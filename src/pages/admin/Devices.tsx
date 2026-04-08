import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { Device } from '../../types';
import { motion } from 'motion/react';
import { Smartphone, Search, Copy, Check, ShieldAlert, ShieldCheck, Filter, Loader2, Wifi, WifiOff, Key, X, Save, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isDeviceOffline, getLastSeenString } from '../../lib/status';
import { Telemetry } from '../../types';
import PullToRefresh from '../../components/PullToRefresh';

export default function AdminDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, Telemetry>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMqtt, setEditingMqtt] = useState<Device | null>(null);
  const [mqttForm, setMqttForm] = useState({ username: '', password: '', broker: '' });
  const [savingMqtt, setSavingMqtt] = useState(false);
  const [showMqttPassword, setShowMqttPassword] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'devices'), orderBy('registered_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      setDevices(devs);
      setLoading(false);

      // Fetch latest telemetry for each device
      devs.forEach(device => {
        const tq = query(
          collection(db, 'devices', device.id, 'telemetry'),
          orderBy('recorded_at', 'desc'),
          limit(1)
        );
        onSnapshot(tq, (tSnap) => {
          if (!tSnap.empty) {
            setTelemetryMap(prev => ({
              ...prev,
              [device.id]: tSnap.docs[0].data() as Telemetry
            }));
          }
        });
      });
    });
    return () => unsubscribe();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleBlock = async (device: Device) => {
    const newStatus = device.status === 'blocked' ? 'active' : 'blocked';
    try {
      await updateDoc(doc(db, 'devices', device.id), { status: newStatus });
    } catch (error) {
      console.error("Error updating device status:", error);
    }
  };

  const handleMqttEdit = (device: Device) => {
    setEditingMqtt(device);
    setMqttForm({
      username: device.mqtt_username || '',
      password: device.mqtt_password || '',
      broker: device.mqtt_broker || '70f11a2fa15842628bf9227997bb4ba9.s1.eu.hivemq.cloud'
    });
  };

  const saveMqtt = async () => {
    if (!editingMqtt) return;
    setSavingMqtt(true);
    try {
      await updateDoc(doc(db, 'devices', editingMqtt.id), {
        mqtt_username: mqttForm.username,
        mqtt_password: mqttForm.password,
        mqtt_broker: mqttForm.broker
      });
      setEditingMqtt(null);
    } catch (error) {
      console.error("Error saving MQTT credentials:", error);
    } finally {
      setSavingMqtt(false);
    }
  };

  const filteredDevices = devices.filter(d => {
    const matchesSearch = 
      d.device_id.toLowerCase().includes(search.toLowerCase()) ||
      (d.user_name?.toLowerCase() || '').includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || d.status === filter;
    return matchesSearch && matchesFilter;
  });

  const handleRefresh = async () => {
    await new Promise(resolve => setTimeout(resolve, 800));
  };

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar (Simplified for brevity, in real app use a shared component) */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">HydroSync</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>
        <nav className="p-4 space-y-1">
          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Dashboard</Link>
          <Link to="/admin/devices" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/10 text-cyan-400">Device Registration</Link>
          <Link to="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Users & Devices</Link>
          <Link to="/admin/settings" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-[#111827] border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors group"
              title="Back to Admin Dashboard"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <h2 className="text-lg font-bold text-white">Device Registration</h2>
          </div>
        </header>

        <PullToRefresh onRefresh={handleRefresh}>
          <div className="p-8 space-y-6">
            <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-white/5">
                <h3 className="text-sm font-bold text-white">Device Registry</h3>
                <p className="text-[10px] text-slate-500 mt-1">Devices auto-register when they first connect to the internet. Tokens are permanent and cannot be regenerated.</p>
              </div>

              <div className="p-6 flex flex-wrap gap-4 items-center border-b border-white/5">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by Device ID..."
                    className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="active">Active</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Device ID</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Token</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Connectivity</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assigned To</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registered</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loading ? (
                      <tr><td colSpan={7} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500" /></td></tr>
                    ) : filteredDevices.length > 0 ? filteredDevices.map((d) => {
                      const tel = telemetryMap[d.id];
                      const offline = tel ? isDeviceOffline(tel) : true;
                      
                      return (
                        <tr key={d.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-slate-200">{d.device_id}</span>
                              {Date.now() - (d.registered_at?.toMillis() || 0) < 86400000 && (
                                <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-bold rounded uppercase tracking-widest border border-purple-500/30">New</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-500 truncate max-w-[120px]">{d.token.substring(0, 16)}...</span>
                              <button 
                                onClick={() => copyToClipboard(d.token, d.id)}
                                className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-cyan-500 hover:bg-cyan-500/20 transition-all"
                              >
                                {copiedId === d.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                              d.status === 'active' ? "bg-green-500/10 border-green-500/30 text-green-500" :
                              d.status === 'blocked' ? "bg-red-500/10 border-red-500/30 text-red-500" :
                              "bg-slate-500/10 border-slate-500/30 text-slate-500"
                            )}>
                              {d.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {offline ? <WifiOff className="w-3 h-3 text-red-500" /> : <Wifi className="w-3 h-3 text-green-500" />}
                                <span className={cn(
                                  "text-[10px] font-bold uppercase tracking-widest",
                                  offline ? "text-red-500" : "text-green-500"
                                )}>
                                  {offline ? 'Offline' : 'Online'}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500">
                                {getLastSeenString(tel)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-400">{d.user_name || '—'}</td>
                          <td className="px-6 py-4 text-xs text-slate-500">{d.registered_at?.toDate().toLocaleDateString() || '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleMqttEdit(d)}
                                className="p-2 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 rounded-lg transition-all"
                                title="Edit MQTT Credentials"
                              >
                                <Key className="w-4 h-4" />
                              </button>
                              {d.status !== 'unassigned' && (
                                <button 
                                  onClick={() => toggleBlock(d)}
                                  className={cn(
                                    "p-2 rounded-lg transition-all",
                                    d.status === 'blocked' ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                  )}
                                >
                                  {d.status === 'blocked' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={7} className="p-12 text-center text-slate-600 text-sm italic">No devices found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </PullToRefresh>
      </main>

      {/* MQTT Edit Modal */}
      {editingMqtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">MQTT Credentials</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Device: {editingMqtt.device_id}</p>
              </div>
              <button onClick={() => setEditingMqtt(null)} className="p-2 text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Broker URL</label>
                <input
                  type="text"
                  value={mqttForm.broker}
                  onChange={(e) => setMqttForm({ ...mqttForm, broker: e.target.value })}
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">MQTT Username</label>
                <input
                  type="text"
                  value={mqttForm.username}
                  onChange={(e) => setMqttForm({ ...mqttForm, username: e.target.value })}
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">MQTT Password</label>
                <div className="relative">
                  <input
                    type={showMqttPassword ? "text" : "password"}
                    value={mqttForm.password}
                    onChange={(e) => setMqttForm({ ...mqttForm, password: e.target.value })}
                    className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 pl-4 pr-11 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMqttPassword(!showMqttPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showMqttPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
              <button 
                onClick={() => setEditingMqtt(null)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={saveMqtt}
                disabled={savingMqtt}
                className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {savingMqtt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Config
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Link({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)} className={className}>{children}</button>;
}
