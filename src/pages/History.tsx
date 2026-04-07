// HydroSync — User History with Charts and Numbers
// Enhanced History page with live data, charts, and CSV export
// Tech: React 18 + TypeScript + Recharts

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { Telemetry, Device, ActivityLog } from '../types';
import { motion } from 'motion/react';
import { ArrowLeft, BarChart2, Droplets, Bell, Settings, Loader2, Download, ChevronDown, ChevronUp, Zap, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import Papa from 'papaparse';

type Period = '24h' | '7d' | '30d';

// Helper functions
const fmtNum = (n: number, decimals = 0): string => {
  return n.toLocaleString('en-KE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export default function History() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceIdx, setActiveDeviceIdx] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('24h');
  const [expandedSection, setExpandedSection] = useState<'water' | 'power' | 'activity' | null>('water');
  const navigate = useNavigate();

  const activeDevice = devices[activeDeviceIdx];

  // Fetch devices
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'devices'), where('assigned_to_user', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDevices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device)));
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch telemetry data
  useEffect(() => {
    if (!activeDevice) return;
    setLoading(true);
    const limitCount = period === '24h' ? 48 : period === '7d' ? 168 : 720;
    const q = query(
      collection(db, 'devices', activeDevice.id, 'telemetry'),
      orderBy('recorded_at', 'desc'),
      limit(limitCount)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTelemetry(snapshot.docs.map(doc => doc.data() as Telemetry).reverse());
      setLoading(false);
    });
    return () => unsubscribe();
  }, [activeDevice, period]);

  // Fetch activity logs
  useEffect(() => {
    if (!activeDevice) return;
    setLogsLoading(true);
    const q = query(
      collection(db, 'devices', activeDevice.id, 'pump_events'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp,
          action: data.action || 'System event',
          performed_by: data.performed_by,
          device_id: activeDevice.id,
          user_id: data.user_id
        } as ActivityLog;
      });
      setActivityLogs(logs);
      setLogsLoading(false);
    }, (error) => {
      console.error('Error fetching logs:', error);
      setLogsLoading(false);
    });
    return () => unsubscribe();
  }, [activeDevice]);

  // Calculate statistics
  const totalWaterPumped = telemetry.reduce((sum, t) => sum + (t.overhead_level || 0) * (activeDevice?.ohCap || 1000) / 100, 0);
  const totalPumpCycles = telemetry.filter(t => t.pump_status).length;
  const avgOverhead = telemetry.length > 0 ? telemetry.reduce((sum, t) => sum + (t.overhead_level || 0), 0) / telemetry.length : 0;
  const avgUnderground = telemetry.length > 0 ? telemetry.reduce((sum, t) => sum + (t.underground_level || 0), 0) / telemetry.length : 0;
  const totalKwh = telemetry.reduce((sum, t) => sum + ((t.pump_current || 0) * 240 / 1000), 0);
  const totalPumpHours = telemetry.filter(t => t.pump_status).length * (period === '24h' ? 0.5 : period === '7d' ? 1 : 1);

  // Process chart data with timestamps
  const chartData = telemetry.map(t => ({
    ...t,
    time: t.recorded_at?.toDate ? t.recorded_at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    date: t.recorded_at?.toDate ? t.recorded_at.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
    power_kw: ((t.pump_current || 0) * 240 / 1000).toFixed(2)
  }));

  // CSV Export functions
  const exportWaterCSV = useCallback(() => {
    const csvData = telemetry.map(t => ({
      timestamp: t.recorded_at?.toDate?.().toISOString() || new Date().toISOString(),
      date: t.recorded_at?.toDate?.().toLocaleDateString() || '',
      time: t.recorded_at?.toDate?.().toLocaleTimeString() || '',
      overhead_level_pct: t.overhead_level || 0,
      overhead_litres: Math.round((t.overhead_level || 0) * (activeDevice?.ohCap || 1000) / 100),
      underground_level_pct: t.underground_level || 0,
      underground_litres: Math.round((t.underground_level || 0) * (activeDevice?.ugCap || 5000) / 100),
      pump_status: t.pump_status ? 'ON' : 'OFF',
      pump_current_a: t.pump_current || 0,
      power_kw: ((t.pump_current || 0) * 240 / 1000).toFixed(2)
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hydrosync_history_${activeDevice?.id}_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [telemetry, activeDevice, period]);

  const exportActivityCSV = useCallback(() => {
    const csvData = activityLogs.map(log => ({
      timestamp: log.timestamp?.toDate?.().toISOString() || '',
      date: log.timestamp?.toDate?.().toLocaleDateString() || '',
      time: log.timestamp?.toDate?.().toLocaleTimeString() || '',
      action: log.action || '',
      performed_by: log.performed_by || 'System',
      device_id: log.device_id || activeDevice?.id || ''
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hydrosync_activity_${activeDevice?.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activityLogs, activeDevice]);

  return (
    <div className="flex flex-col min-h-screen pb-24 bg-[#0a0f1e]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#111827]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">History & Analytics</h1>
          <p className="text-[10px] text-slate-500">Device: {activeDevice?.name || 'Loading...'}</p>
        </div>
      </header>

      {/* Device Selector */}
      <div className="flex items-center gap-2 px-6 py-3 overflow-x-auto no-scrollbar border-b border-white/5 bg-[#111827]">
        {devices.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setActiveDeviceIdx(i)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
              i === activeDeviceIdx 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" 
                : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
            )}
          >
            {i === 0 ? '🏠 ' : i === 1 ? '🌾 ' : '📟 '} {d.name}
          </button>
        ))}
      </div>

      <main className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Period Tabs */}
        <div className="flex gap-2">
          {(['24h', '7d', '30d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                period === p 
                  ? "bg-cyan-500 text-slate-900" 
                  : "bg-white/5 text-slate-500 hover:bg-white/10"
              )}
            >
              {p === '24h' ? 'Last 24 Hours' : p === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
            </button>
          ))}
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#1e293b] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Water</div>
            <div className="text-2xl font-bold text-cyan-400">{Math.round(totalWaterPumped).toLocaleString()} L</div>
            <div className="text-[10px] text-slate-500 mt-1">Pumped volume</div>
          </div>
          <div className="bg-[#1e293b] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pump Cycles</div>
            <div className="text-2xl font-bold text-orange-400">{totalPumpCycles}</div>
            <div className="text-[10px] text-slate-500 mt-1">ON/OFF cycles</div>
          </div>
          <div className="bg-[#1e293b] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Power Used</div>
            <div className="text-2xl font-bold text-yellow-400">{totalKwh.toFixed(1)} kWh</div>
            <div className="text-[10px] text-slate-500 mt-1">Total energy</div>
          </div>
          <div className="bg-[#1e293b] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Avg OH Level</div>
            <div className="text-2xl font-bold text-green-400">{avgOverhead.toFixed(1)}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Overhead tank</div>
          </div>
        </div>

        {/* Water Consumption Section */}
        <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden">
          <div 
            onClick={() => setExpandedSection(expandedSection === 'water' ? null : 'water')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                <Droplets className="w-5 h-5 text-cyan-500" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Water Consumption</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Tank levels & water volume tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); exportWaterCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <Download className="w-3 h-3" />
                CSV
              </button>
              {expandedSection === 'water' ? <ChevronUp className="w-5 h-5 text-slate-600" /> : <ChevronDown className="w-5 h-5 text-slate-600" />}
            </div>
          </div>
          
          {expandedSection === 'water' && (
            <div className="p-6 border-t border-white/5">
              <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
                {/* Left Side - Numeric Totals */}
                <div className="bg-[#0f172a] rounded-xl border border-white/5 p-4 space-y-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-2 border-b border-white/5">
                    Recorded Totals
                  </div>
                  
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Avg OH Level</span>
                    <span className="text-sm font-mono font-bold text-cyan-400">{avgOverhead.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Avg UG Level</span>
                    <span className="text-sm font-mono font-bold text-blue-400">{avgUnderground.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Peak OH</span>
                    <span className="text-sm font-mono font-bold text-green-400">
                      {telemetry.length > 0 ? Math.max(...telemetry.map(t => t.overhead_level || 0)).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Min UG</span>
                    <span className="text-sm font-mono font-bold text-orange-400">
                      {telemetry.length > 0 ? Math.min(...telemetry.map(t => t.underground_level || 100)).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Readings</span>
                    <span className="text-sm font-mono font-bold text-slate-300">{telemetry.length}</span>
                  </div>
                  
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white">Total Water</span>
                      <span className="text-sm font-mono font-bold text-green-400">{Math.round(totalWaterPumped).toLocaleString()} L</span>
                    </div>
                  </div>
                </div>

                {/* Right Side - Chart */}
                <div className="h-[280px]">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOH" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorUG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis 
                          dataKey={period === '24h' ? 'time' : 'date'} 
                          stroke="#4b5563"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#4b5563" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        <Area type="monotone" dataKey="overhead_level" name="Overhead %" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorOH)" />
                        <Area type="monotone" dataKey="underground_level" name="Underground %" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorUG)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Power Usage Section */}
        <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden">
          <div 
            onClick={() => setExpandedSection(expandedSection === 'power' ? null : 'power')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Power Usage</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Voltage: 240V AC • Energy consumption</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); exportWaterCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <Download className="w-3 h-3" />
                CSV
              </button>
              {expandedSection === 'power' ? <ChevronUp className="w-5 h-5 text-slate-600" /> : <ChevronDown className="w-5 h-5 text-slate-600" />}
            </div>
          </div>
          
          {expandedSection === 'power' && (
            <div className="p-6 border-t border-white/5">
              <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
                {/* Left Side - Numeric Totals */}
                <div className="bg-[#0f172a] rounded-xl border border-white/5 p-4 space-y-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-2 border-b border-white/5">
                    Power Stats
                  </div>
                  
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Total kWh</span>
                    <span className="text-sm font-mono font-bold text-orange-400">{totalKwh.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Pump Hours</span>
                    <span className="text-sm font-mono font-bold text-yellow-400">{totalPumpHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Avg Current</span>
                    <span className="text-sm font-mono font-bold text-cyan-400">
                      {telemetry.length > 0 ? (telemetry.reduce((sum, t) => sum + (t.pump_current || 0), 0) / telemetry.length).toFixed(2) : 0} A
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-slate-400">Peak Current</span>
                    <span className="text-sm font-mono font-bold text-red-400">
                      {telemetry.length > 0 ? Math.max(...telemetry.map(t => t.pump_current || 0)).toFixed(2) : 0} A
                    </span>
                  </div>
                  
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white">Est. Cost</span>
                      <span className="text-sm font-mono font-bold text-green-400">KES {(totalKwh * 25).toFixed(0)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">@ KES 25/kWh</div>
                  </div>
                </div>

                {/* Right Side - Chart */}
                <div className="h-[280px]">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis 
                          dataKey={period === '24h' ? 'time' : 'date'} 
                          stroke="#4b5563"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#4b5563" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(v) => `${v}A`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="pump_current" name="Current (A)" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity Log Section */}
        <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden">
          <div 
            onClick={() => setExpandedSection(expandedSection === 'activity' ? null : 'activity')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-500" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Activity Log</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{activityLogs.length} events recorded</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); exportActivityCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <Download className="w-3 h-3" />
                CSV
              </button>
              {expandedSection === 'activity' ? <ChevronUp className="w-5 h-5 text-slate-600" /> : <ChevronDown className="w-5 h-5 text-slate-600" />}
            </div>
          </div>
          
          {expandedSection === 'activity' && (
            <div className="p-6 border-t border-white/5">
              <div className="bg-[#0f172a] rounded-xl border border-white/5 overflow-hidden">
                <div className="grid grid-cols-3 gap-4 p-4 border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <div>Time</div>
                  <div>Action</div>
                  <div>By</div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {logsLoading ? (
                    <div className="p-8 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    </div>
                  ) : activityLogs.length > 0 ? (
                    activityLogs.map((log, i) => (
                      <div key={log.id || i} className="grid grid-cols-3 gap-4 p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors text-sm">
                        <div className="text-slate-400 font-mono text-xs">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                        </div>
                        <div className="text-slate-300">{log.action || 'System event'}</div>
                        <div className="text-slate-500 text-xs">{log.performed_by || 'System'}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      No activity logs yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#1e293b] border-t border-white/10 h-20 flex items-center justify-around px-2">
        <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <img src="/icon.png" alt="HydroSync Icon" className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
        </button>
        <button onClick={() => navigate('/history')} className="flex flex-col items-center gap-1 text-cyan-500">
          <BarChart2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">History</span>
        </button>
        <button onClick={() => navigate('/alerts')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <Bell className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Alerts</span>
        </button>
        <button onClick={() => navigate('/settings')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
        </button>
      </nav>
    </div>
  );
}
