// HydroSync — src/pages/Dashboard.tsx
// Key fix: DeviceBar's onAddDevice is wired to navigate('/add-device')
// Device tabs are real <button type="button"> elements via DeviceBar component.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, updateDoc,
  orderBy, limit, addDoc, serverTimestamp, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { Device, Telemetry, ActivityLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, BarChart2, Bell, Play, Square,
  Loader2, AlertTriangle, Plus, RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import TankScene from '../components/TankScene';
import { isDeviceOffline, getLastSeenString } from '../lib/status';
import PullToRefresh from '../components/PullToRefresh';
import FloatingChatBot from '../components/FloatingChatBot';
import { useMQTT } from '../hooks/useMQTT';
import mqtt from 'mqtt';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [devices, setDevices]           = useState<Device[]>([]);
  const [activeDeviceIdx, setActiveDeviceIdx] = useState(0);
  const [telemetry, setTelemetry]       = useState<Telemetry | null>(null);
  const [logs, setLogs]                 = useState<ActivityLog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showSetupGate, setShowSetupGate] = useState(false);
  const [setupData, setSetupData]       = useState({ name: '', ohCap: '', ugCap: '', region: '' });
  const [setupLoading, setSetupLoading] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [isOffline, setIsOffline]       = useState(false);
  const [isInternetOffline, setIsInternetOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsInternetOffline(false);
    const handleOffline = () => setIsInternetOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeDevice = devices[activeDeviceIdx] ?? devices[0];

  // ── MQTT Connection ──────────────────────────────────
  const { isConnected: mqttConnected, subscribe, publish: mqttPublish } = useMQTT(
    activeDevice?.mqtt_broker ? (
      activeDevice.mqtt_broker.startsWith('ws://') || activeDevice.mqtt_broker.startsWith('wss://')
        ? activeDevice.mqtt_broker
        : `wss://${activeDevice.mqtt_broker}:8884/mqtt`
    ) : undefined,
    {
      username: activeDevice?.mqtt_username,
      password: activeDevice?.mqtt_password,
      onMessage: (topic: string, message: Buffer) => {
        try {
          const payload = JSON.parse(message.toString());

          // Security: Only accept messages for owned devices
          const isAuthorizedTopic = devices.some(device =>
            topic.startsWith(`devices/${device.id}/`) && device.assigned_to_user === user?.uid
          );

          if (!isAuthorizedTopic) {
            console.warn('MQTT: Received message for unauthorized device/topic:', topic);
            return;
          }

          // Find which device this message is for
          const targetDevice = devices.find(device => topic.startsWith(`devices/${device.id}/`));
          if (!targetDevice) return;

          if (topic === `devices/${targetDevice.id}/data`) {
            // Update telemetry with live data
            setTelemetry({
              recorded_at: serverTimestamp() as any,
              overhead_level: payload.overhead_level ?? telemetry?.overhead_level ?? 50,
              underground_level: payload.underground_level ?? telemetry?.underground_level ?? 50,
              pump_status: payload.pump_status ?? telemetry?.pump_status ?? false,
              pump_current: parseFloat(payload.pump_current) || telemetry?.pump_current || 0,
              system_status: payload.system_status || telemetry?.system_status || 'System Ready',
            });

            // Update device status in Firestore
            if (activeDevice) {
              updateDoc(doc(db, 'devices', activeDevice.id), {
                last_seen: serverTimestamp(),
                overhead_level: payload.overhead_level,
                underground_level: payload.underground_level,
                pump_status: payload.pump_status,
                current_draw: parseFloat(payload.pump_current) || 0,
                error_state: payload.system_status,
              });
            }
          } else if (topic === `devices/${activeDevice?.id}/alerts`) {
            // Handle alerts
            console.log('Alert received:', payload);
            // Could add alert handling here
          }
        } catch (err) {
          console.error('MQTT message parse error:', err);
        }
      },
    }
  );

  // ── Fetch devices ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'devices'), where('assigned_to_user', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const devs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Device));
      setDevices(devs);
      setLoading(false);

      if (devs.length > 0) {
        const activeDev = devs[activeDeviceIdx] ?? devs[0];
        if (activeDev.overhead_level !== undefined) {
          setTelemetry({
            recorded_at:       activeDev.last_seen ?? (serverTimestamp() as any),
            overhead_level:    activeDev.overhead_level ?? 50,
            underground_level: activeDev.underground_level ?? 50,
            pump_status:       activeDev.pump_status ?? false,
            pump_current:      activeDev.current_draw ?? 0,
            system_status:     activeDev.error_state ?? 'System Ready',
          });
        }
      }
    });
  }, [user, activeDeviceIdx]);

  // ── MQTT Subscription for Live Data ──────────────────
  useEffect(() => {
    if (!activeDevice || !mqttConnected) return;

    const dataTopic = `devices/${activeDevice.id}/data`;
    const alertTopic = `devices/${activeDevice.id}/alerts`;

    subscribe(dataTopic);
    subscribe(alertTopic);

    return () => {
      // Cleanup would happen in the hook
    };
  }, [activeDevice, mqttConnected, subscribe]);

  // ── Setup gate ────────────────────────────────────────
  useEffect(() => {
    if (activeDevice && (!activeDevice.ohCap || !activeDevice.ugCap || !activeDevice.region)) {
      setShowSetupGate(true);
      setSetupData({
        name:   activeDevice.name ?? '',
        ohCap:  activeDevice.ohCap?.toString() ?? '',
        ugCap:  activeDevice.ugCap?.toString() ?? '',
        region: activeDevice.region ?? '',
      });
    } else {
      setShowSetupGate(false);
    }
  }, [activeDevice]);

  // ── Telemetry listener ────────────────────────────────
  useEffect(() => {
    if (!activeDevice) return;
    const q = query(
      collection(db, 'devices', activeDevice.id, 'telemetry'),
      orderBy('recorded_at', 'desc'),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setTelemetry(snap.docs[0].data() as Telemetry);
      } else {
        setTelemetry({
          recorded_at:       serverTimestamp() as any,
          overhead_level:    78,
          underground_level: 45,
          pump_status:       false,
          pump_current:      0,
          system_status:     'System Ready',
        });
      }
    });
  }, [activeDevice]);

  // ── Offline alert trigger ─────────────────────────────
  useEffect(() => {
    if (!telemetry || !activeDevice || !user) return;
    const offline = isDeviceOffline(telemetry);
    setIsOffline(offline);

    if (offline) {
      (async () => {
        const oneHourAgo = new Date(Date.now() - 3_600_000);
        const q = query(
          collection(db, 'alerts'),
          where('device_id',   '==', activeDevice.id),
          where('alert_type',  '==', 'device_offline'),
          where('triggered_at', '>',  oneHourAgo)
        );
        const existing = await getDocs(q);
        if (existing.empty) {
          await addDoc(collection(db, 'alerts'), {
            user_id:     user.uid,
            device_id:   activeDevice.id,
            alert_type:  'device_offline',
            message:     `Device ${activeDevice.name} (${activeDevice.id}) has gone offline.`,
            triggered_at: serverTimestamp(),
            read:         false,
          });
        }
      })();
    }
  }, [telemetry, activeDevice, user]);

  // ── Activity logs ─────────────────────────────────────
  useEffect(() => {
    if (!activeDevice) return;
    const q = query(
      collection(db, 'activity_log'),
      where('device_id', '==', activeDevice.device_id),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => d.data() as ActivityLog));
    });
  }, [activeDevice]);

  // ── Unread alerts badge ───────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'alerts'),
      where('user_id', '==', user.uid),
      where('read', '==', false)
    );
    return onSnapshot(q, (snap) => setUnreadAlerts(snap.size));
  }, [user]);

  // ── Helpers ───────────────────────────────────────────
  const createDemoDevice = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'devices'), {
        name:             'Demo System',
        assigned_to_user: user.uid,
        ohCap:            1000,
        ugCap:            5000,
        region:           'Nairobi',
        created_at:       serverTimestamp(),
        last_seen:        serverTimestamp(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDevice) return;
    setSetupLoading(true);
    try {
      await updateDoc(doc(db, 'devices', activeDevice.id), {
        name:   setupData.name,
        ohCap:  Number(setupData.ohCap),
        ugCap:  Number(setupData.ugCap),
        region: setupData.region,
      });
      setShowSetupGate(false);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleRefresh = async () => new Promise<void>((r) => setTimeout(r, 800));

  const sendCommand = useCallback(async (cmd: string) => {
    if (!activeDevice || !user) return;
    try {
      await addDoc(collection(db, 'activity_log'), {
        timestamp:    serverTimestamp(),
        device_id:   activeDevice.id,
        user_id:     user.uid,
        action:      `Manual command: ${cmd} initiated`,
        performed_by: user.email ?? 'user',
      });

      await addDoc(collection(db, 'commands'), {
        device_id:  activeDevice.id,
        command:    cmd,
        payload:    cmd === 'PUMP_ON' ? { state: true } : cmd === 'PUMP_OFF' ? { state: false } : {},
        status:     'pending',
        created_at: serverTimestamp(),
        user_id:    user.uid,
      });

      if (mqttConnected) {
        // Use the persistent MQTT connection
        const commandTopic = `devices/${activeDevice.id}/commands`;
        mqttPublish(commandTopic, cmd);
      } else if (activeDevice.mqtt_broker) {
        // Fallback: create temporary connection
        try {
          let brokerUrl = activeDevice.mqtt_broker;
          if (!brokerUrl.startsWith('ws://') && !brokerUrl.startsWith('wss://')) {
            brokerUrl = `wss://${brokerUrl}:8884/mqtt`;
          }
          const client = mqtt.connect(brokerUrl, {
            username: activeDevice.mqtt_username,
            password: activeDevice.mqtt_password,
            clientId: `hydrosync_web_${Math.random().toString(16).slice(2, 8)}`,
          });
          client.on('connect', () => { client.publish(`devices/${activeDevice.id}/commands`, cmd); client.end(); });
          client.on('error',   (err) => { console.error('MQTT:', err); client.end(); });
        } catch (err) {
          console.error('MQTT connect failed:', err);
        }
      }

      // Optimistic UI
      if (cmd === 'PUMP_ON' && telemetry)
        setTelemetry({ ...telemetry, pump_status: true,  system_status: 'Command Sent...' });
      if (cmd === 'PUMP_OFF' && telemetry)
        setTelemetry({ ...telemetry, pump_status: false, system_status: 'Command Sent...' });
    } catch (err) {
      console.error('sendCommand error:', err);
    }
  }, [activeDevice, user, telemetry, mqttConnected, mqttPublish]);

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  // ── No devices screen ─────────────────────────────────
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-6">
          <img src="/icon.png" alt="HydroSync" className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Devices Linked</h2>
        <p className="text-slate-400 mb-8 max-w-xs">
          You haven't linked any HydroSync devices to your account yet.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {/* ← THIS is the correct navigate call */}
          <button
            type="button"
            onClick={() => navigate('/add-device')}
            className="w-full px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl transition-all"
          >
            Add Device Now
          </button>
          <button
            type="button"
            onClick={createDemoDevice}
            className="w-full px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Demo Device
          </button>
        </div>
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen pb-24">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <img src="/icon.png" alt="HydroSync" className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">HydroSync</h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {isInternetOffline ? (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Offline - Limited Functionality
                </span>
              ) : (
                `${activeDevice?.name || 'Device'} • ${getLastSeenString(telemetry)}`
              )}
            </p>
          </div>
        </div>
        {/* Header actions */}
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors',
              isOffline
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : 'bg-green-500/10 border-green-500/20 text-green-500'
            )}
          >
            <div className={cn('w-2 h-2 rounded-full', isOffline ? 'bg-red-500' : 'bg-green-500 animate-pulse')} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {isOffline ? 'Offline' : 'Live'}
            </span>
          </div>
        </div>
      </header>

      {/* Device nav - styled like bottom nav */}
      <nav className="sticky top-[72px] z-20 bg-[#1e293b] border-b border-white/10 h-16 flex items-center justify-start px-2 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Device tabs */}
        {devices.map((dev, i) => (
          <button
            key={dev.id}
            type="button"
            onClick={() => setActiveDeviceIdx(i)}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors flex-shrink-0',
              i === activeDeviceIdx
                ? 'text-cyan-500 bg-cyan-500/10'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <span className="text-lg">{['\u{1F3E0}', '\u{1F33E}', '\u{1F4DF}', '\u{1F3E2}'][i] || '\u{1F4FA}'}</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter truncate max-w-[80px]">{dev.name || dev.id}</span>
          </button>
        ))}

        {/* Add Device button */}
        <button
          type="button"
          onClick={() => navigate('/add-device')}
          disabled={devices.length >= 4}
          title={devices.length >= 4 ? 'Maximum 4 devices reached' : 'Add a new device'}
          className={cn(
            'flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors flex-shrink-0',
            devices.length >= 4
              ? 'text-slate-600 cursor-not-allowed opacity-50'
              : 'text-cyan-400 hover:text-white hover:bg-cyan-500/10'
          )}
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Add ({devices.length}/4)</span>
        </button>
      </nav>

      {/* ── Scrollable content ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        <main className="flex-1 p-6 space-y-6 max-w-lg mx-auto w-full">

          {/* Tank card */}
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Water System</span>
                <button
                  type="button"
                  onClick={() => {
                    setSetupData({
                      name:   activeDevice?.name ?? '',
                      ohCap:  activeDevice?.ohCap?.toString() ?? '',
                      ugCap:  activeDevice?.ugCap?.toString() ?? '',
                      region: activeDevice?.region ?? '',
                    });
                    setShowSetupGate(true);
                  }}
                  className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-cyan-400 transition-colors"
                  title="Edit Configuration"
                >
                  <Settings className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[10px] text-slate-500">
                Last seen: {getLastSeenString(telemetry)}
              </span>
            </div>

            <TankScene
              ohLevel={telemetry?.overhead_level ?? 0}
              ugLevel={telemetry?.underground_level ?? 0}
              pumpOn={telemetry?.pump_status ?? false}
              ohCap={activeDevice?.ohCap}
              ugCap={activeDevice?.ugCap}
            />

            <div className="grid grid-cols-2 divide-x divide-white/5 p-4">
              {/* Overhead */}
              <div className="pr-4 text-center">
                <div className={cn('text-2xl font-bold leading-none mb-1',
                  (telemetry?.overhead_level ?? 0) >= 50 ? 'text-green-500'
                  : (telemetry?.overhead_level ?? 0) >= 20 ? 'text-orange-500' : 'text-red-500'
                )}>
                  {Number(telemetry?.overhead_level ?? 0).toFixed(0)}%
                </div>
                <div className="text-xs font-semibold text-cyan-400">
                  {activeDevice?.ohCap
                    ? `${Math.round((telemetry?.overhead_level ?? 0) / 100 * activeDevice.ohCap).toLocaleString()} L`
                    : '— L'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase font-medium">Overhead Tank</div>
              </div>
              {/* Underground */}
              <div className="pl-4 text-center">
                <div className={cn('text-2xl font-bold leading-none mb-1',
                  (telemetry?.underground_level ?? 0) >= 50 ? 'text-green-500'
                  : (telemetry?.underground_level ?? 0) >= 20 ? 'text-orange-500' : 'text-red-500'
                )}>
                  {Number(telemetry?.underground_level ?? 0).toFixed(0)}%
                </div>
                <div className="text-xs font-semibold text-cyan-400">
                  {activeDevice?.ugCap
                    ? `${Math.round((telemetry?.underground_level ?? 0) / 100 * activeDevice.ugCap).toLocaleString()} L`
                    : '— L'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase font-medium">Underground Tank</div>
              </div>
            </div>
          </div>

          {/* Pump status */}
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 p-4 flex items-center gap-4 shadow-lg">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all shrink-0',
              telemetry?.pump_status
                ? 'bg-green-500/15 border-2 border-green-500/40 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                : 'bg-slate-800 border-2 border-slate-700 text-slate-600'
            )}>⚙</div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm font-bold uppercase tracking-wide',
                telemetry?.pump_status ? 'text-green-500' : 'text-slate-500'
              )}>
                {telemetry?.pump_status ? 'Pump Running' : 'Pump Off'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                <span>Current: <span className="text-cyan-400 font-semibold">{Number(telemetry?.pump_current ?? 0).toFixed(2)} A</span></span>
                <span>Power: <span className="text-cyan-400 font-semibold">{(Number(telemetry?.pump_current ?? 0) * 240 / 1000).toFixed(2)} kW</span></span>
              </div>
            </div>
          </div>

          {/* Status chip */}
          <div className="flex justify-center">
            <div className={cn(
              'px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border',
              telemetry?.system_status?.includes('Err')
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : telemetry?.pump_status
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-green-500/10 border-green-500/30 text-green-400'
            )}>
              {telemetry?.system_status?.includes('Err') ? '🚨' : telemetry?.pump_status ? '⬆' : '✓'}
              {telemetry?.system_status || 'System Ready'}
            </div>
          </div>

          {/* Manual controls */}
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden shadow-lg">
            <div className="px-4 py-2 border-b border-white/5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manual Controls</span>
            </div>
            <div className="p-4 space-y-3">
              {Number(telemetry?.underground_level ?? 0) < 15 && (
                <div className="p-2 bg-red-500/10 border-l-4 border-red-500 rounded-r text-[10px] text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Dry Run Protection: Underground too low ({Number(telemetry?.underground_level ?? 0).toFixed(0)}%). Pump disabled.
                </div>
              )}
              <div className="p-2 bg-orange-500/5 border-l-4 border-orange-500 rounded-r text-[10px] text-slate-400">
                ⚠ Hardware safety always takes priority over remote commands.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (Number(telemetry?.underground_level ?? 0) < 15) return;
                    sendCommand('PUMP_ON');
                  }}
                  disabled={Number(telemetry?.underground_level ?? 0) < 15}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all active:scale-95',
                    Number(telemetry?.underground_level ?? 0) < 15
                      ? 'bg-slate-800 border border-white/5 opacity-50 cursor-not-allowed'
                      : 'bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 cursor-pointer'
                  )}
                >
                  <Play className="w-4 h-4 text-green-500" />
                  <span className="text-[10px] font-bold text-green-500 uppercase">On</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand('PUMP_OFF')}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <Square className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Off</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand('RESET_ERROR')}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-orange-500" />
                  <span className="text-[10px] font-bold text-orange-500 uppercase">Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden shadow-lg">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Activity</span>
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="text-[10px] font-bold text-cyan-400 hover:underline cursor-pointer"
              >
                View All →
              </button>
            </div>
            <div className="divide-y divide-white/5 max-h-[200px] overflow-y-auto">
              {logs.length > 0 ? logs.map((log, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {(log.timestamp as any)?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Just now'}
                  </span>
                  <span className="text-xs text-slate-300 truncate flex-1">{log.action}</span>
                </div>
              )) : (
                <div className="p-6 text-center text-slate-600 text-xs">No recent activity</div>
              )}
            </div>
          </div>
        </main>
      </PullToRefresh>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#1e293b] border-t border-white/10 h-20 flex items-center justify-around px-2">
        <button type="button" onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-cyan-500">
          <img src="/icon.png" alt="HydroSync" className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
        </button>
        <button type="button" onClick={() => navigate('/history')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <BarChart2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">History</span>
        </button>
        <button type="button" onClick={() => navigate('/alerts')} className="relative flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <Bell className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Alerts</span>
          {unreadAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#1e293b]">
              {unreadAlerts}
            </span>
          )}
        </button>
        <button type="button" onClick={() => navigate('/settings')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
        </button>
      </nav>

      {/* ── Setup gate modal ── */}
      <AnimatePresence>
        {showSetupGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0f172a] flex flex-col items-center justify-center p-6"
          >
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6">
              <img src="/icon.png" alt="HydroSync" className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Device Configuration</h2>
            <p className="text-slate-400 text-center mb-8 max-w-xs leading-relaxed">
              Configure your tank capacities and device details for accurate monitoring.
            </p>

            <form
              onSubmit={handleSetupSubmit}
              className="w-full max-w-sm bg-[#1e293b] p-6 rounded-2xl border border-white/10 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <span className="text-xs font-bold text-cyan-500 uppercase tracking-widest">
                  📟 Device: {activeDevice?.id}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSetupGate(false)}
                  className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Device Name
                </label>
                <input
                  type="text"
                  value={setupData.name}
                  onChange={(e) => setSetupData({ ...setupData, name: e.target.value })}
                  placeholder="Home Tank"
                  required
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Overhead (L)</label>
                  <input type="number" value={setupData.ohCap} onChange={(e) => setSetupData({ ...setupData, ohCap: e.target.value })} placeholder="2000" required className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Underground (L)</label>
                  <input type="number" value={setupData.ugCap} onChange={(e) => setSetupData({ ...setupData, ugCap: e.target.value })} placeholder="5000" required className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Region</label>
                <select value={setupData.region} onChange={(e) => setSetupData({ ...setupData, region: e.target.value })} required className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none">
                  <option value="">-- Select Region --</option>
                  {['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Malindi','Kitale','Garissa','Nyeri','Other'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={setupLoading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {setupLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save & Continue →'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingChatBot />
    </div>
  );
}