import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { Device, UserProfile, Alert } from '../../types';
import { motion } from 'motion/react';
import { Droplets, Users, Smartphone, Zap, Bell, ChevronRight, Activity, LayoutDashboard, Database, BarChart3, ClipboardList, Settings, RefreshCw, Loader2, Book } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    devices: 0,
    activeDevices: 0,
    unassignedDevices: 0,
    users: 0,
    pendingUsers: 0,
    activeUsers: 0,
    pumps: 0,
    alerts: 0,
    criticalAlerts: 0
  });
  const [bridgeStatus, setBridgeStatus] = useState<'online' | 'offline' | 'loading'>('loading');
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // Fetch stats - LIVE data only, no simulation
    const unsubDevices = onSnapshot(collection(db, 'devices'), (snap) => {
      const devices = snap.docs.map(d => d.data());
      const activeDevices = devices.filter(d => d.status === 'active').length;
      const unassignedDevices = devices.filter(d => d.status === 'unassigned').length;
      const activePumps = devices.filter(d => d.pump_status === true && d.status === 'active').length;
      
      setStats(prev => ({ 
        ...prev, 
        devices: snap.size,
        activeDevices,
        unassignedDevices,
        pumps: activePumps
      }));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map(d => d.data());
      const pendingUsers = users.filter(u => u.status === 'pending').length;
      const activeUsers = users.filter(u => u.status === 'active').length;
      
      setStats(prev => ({ 
        ...prev, 
        users: snap.size,
        pendingUsers,
        activeUsers
      }));
    });

    const unsubAlerts = onSnapshot(query(collection(db, 'alerts'), where('read', '==', false)), (snap) => {
      const alerts = snap.docs.map(d => d.data());
      const criticalAlerts = alerts.filter(a => a.alert_type === 'dry_run' || a.alert_type === 'sensor_error').length;
      
      setStats(prev => ({ 
        ...prev, 
        alerts: snap.size,
        criticalAlerts
      }));
    });

    // Fetch recent alerts
    const qAlerts = query(collection(db, 'alerts'), orderBy('triggered_at', 'desc'), limit(5));
    const unsubRecentAlerts = onSnapshot(qAlerts, (snap) => {
      setRecentAlerts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert)));
    });

    // Fetch bridge status (simulated via a heartbeat document)
    const unsubBridge = onSnapshot(doc(db, 'system', 'bridge_status'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const lastSeen = data.last_seen?.toDate();
        const now = new Date();
        // If last seen was more than 30 seconds ago, consider it offline
        if (lastSeen && (now.getTime() - lastSeen.getTime()) < 30000) {
          setBridgeStatus('online');
        } else {
          setBridgeStatus('offline');
        }
      } else {
        setBridgeStatus('offline');
      }
    });

    return () => {
      unsubDevices();
      unsubUsers();
      unsubAlerts();
      unsubRecentAlerts();
      unsubBridge();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <img src="/icon.png" alt="HydroSync Icon" className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">HydroSync</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <div className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Main</div>
          <NavLink to="/admin" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active />
          <NavLink to="/admin/devices" icon={<Smartphone className="w-4 h-4" />} label="Device Registration" />
          <NavLink to="/admin/users" icon={<Users className="w-4 h-4" />} label="Users & Devices" />
          
          <div className="px-4 py-3 mt-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Analytics</div>
          <NavLink to="/admin/charts" icon={<BarChart3 className="w-4 h-4" />} label="Charts & Data" />
          
          <div className="px-4 py-3 mt-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">System</div>
          <NavLink to="/admin/log" icon={<ClipboardList className="w-4 h-4" />} label="Activity Log" />
          <NavLink to="/admin/alerts" icon={<Bell className="w-4 h-4" />} label="Fleet Alerts" badge={stats.alerts} />
          <NavLink to="/admin/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="p-4 bg-white/5 rounded-xl">
            <p className="text-xs font-bold text-white">Admin Account</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">{user?.email || 'admin@hydrosync.com'}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-[#111827] border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-20">
          <h2 className="text-lg font-bold text-white">Dashboard Overview</h2>
          <div className="flex items-center gap-4">
            {/* Documentation Link */}
            <Link
              to="/admin/docs"
              className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/20 transition-all"
            >
              <Book className="w-4 h-4" />
              <span className="text-xs font-bold">Docs</span>
            </Link>
            
            {/* Bridge Status */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 border rounded-full transition-all",
              bridgeStatus === 'online' ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
            )}>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                bridgeStatus === 'online' ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                bridgeStatus === 'online' ? "text-green-500" : "text-red-500"
              )}>
                {bridgeStatus === 'online' ? 'MQTT Bridge Live' : 'MQTT Bridge Down'}
              </span>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              label="Total Devices" 
              value={stats.devices} 
              sub={`${stats.activeDevices} active, ${stats.unassignedDevices} unassigned`} 
              color="text-cyan-500"
              onClick={() => navigate('/admin/devices')}
            />
            <StatCard 
              label="Active Users" 
              value={stats.users} 
              sub={`${stats.pendingUsers} pending confirmation`} 
              color="text-green-500"
              onClick={() => navigate('/admin/users')}
            />
            <StatCard 
              label="Pumps Running" 
              value={stats.pumps} 
              sub={`of ${stats.activeDevices} active devices`} 
              color="text-orange-500"
            />
            <StatCard 
              label="Unread Alerts" 
              value={stats.alerts} 
              sub={`${stats.criticalAlerts} critical`} 
              color="text-red-500"
              onClick={() => navigate('/admin/alerts')}
            />
          </div>

          {/* Recent Alerts */}
          <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Recent Alerts</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Fleet-wide alerts in the last 24 hours</p>
              </div>
              <button 
                onClick={() => navigate('/admin/alerts')}
                className="text-[10px] font-bold text-cyan-400 hover:underline"
              >
                View All →
              </button>
            </div>
            <div className="divide-y divide-white/5">
              {recentAlerts.length > 0 ? recentAlerts.map((alert, i) => (
                <div key={i} className={cn(
                  "px-6 py-4 flex items-center gap-4 transition-colors hover:bg-white/[0.02]",
                  alert.alert_type === 'dry_run' ? "bg-red-500/5 border-l-4 border-red-500" : "border-l-4 border-transparent"
                )}>
                  <div className="text-lg">{alert.alert_type === 'dry_run' ? '🚨' : '⚠'}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      <span className="font-bold text-cyan-400">{alert.device_id}</span> — {alert.message}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {alert.triggered_at?.toDate().toLocaleString() || 'Just now'}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-slate-600 text-sm italic">No recent alerts</div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuickLink 
              title="Device Registration" 
              sub={`${stats.devices} devices · 2 unassigned`} 
              icon={<Smartphone className="w-6 h-6 text-cyan-500" />}
              desc="Auto-registers when device connects. Tokens are permanent and unique per device."
              to="/admin/devices"
            />
            <QuickLink 
              title="Users & Devices" 
              sub={`${stats.users} active · 1 pending`} 
              icon={<Users className="w-6 h-6 text-green-500" />}
              desc="Manage users, link devices, block or delete accounts."
              to="/admin/users"
            />
            <QuickLink 
              title="Charts & Data" 
              sub="Water + Power usage" 
              icon={<BarChart3 className="w-6 h-6 text-orange-500" />}
              desc="Aggregate water consumption and power usage. Download CSV."
              to="/admin/charts"
            />
            <QuickLink 
              title="Activity Log" 
              sub="Full system audit trail" 
              icon={<ClipboardList className="w-6 h-6 text-purple-500" />}
              desc="Every registration, command, block, and token event logged here."
              to="/admin/log"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function NavLink({ to, icon, label, active, badge }: { to: string; icon: React.ReactNode; label: string; active?: boolean; badge?: number }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all group",
        active ? "bg-cyan-500/10 text-cyan-400" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
      )}
    >
      <span className={cn("transition-colors", active ? "text-cyan-400" : "text-slate-600 group-hover:text-slate-400")}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">{badge}</span>
      )}
    </Link>
  );
}

function StatCard({ label, value, sub, color, onClick }: { label: string; value: number | string; sub: string; color: string; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-[#111827] border border-white/5 rounded-2xl p-6 shadow-sm",
        onClick && "cursor-pointer hover:bg-white/[0.02] hover:border-cyan-500/20 transition-all"
      )}
    >
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <p className={cn("text-4xl font-black leading-none", color)}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-3 font-medium">{sub}</p>
    </div>
  );
}

function QuickLink({ title, sub, icon, desc, to }: { title: string; sub: string; icon: React.ReactNode; desc: string; to: string }) {
  return (
    <Link to={to} className="bg-[#111827] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.02] transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            {icon}
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{title}</h4>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{sub}</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-cyan-500 transition-colors" />
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
    </Link>
  );
}
