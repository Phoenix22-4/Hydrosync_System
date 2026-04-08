import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { Alert } from '../../types';
import { motion } from 'motion/react';
import { Bell, Search, Filter, Trash2, CheckCircle2, Loader2, ArrowLeft, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'alerts'), orderBy('triggered_at', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const markAllRead = async () => {
    const unread = alerts.filter(a => !a.read);
    try {
      await Promise.all(unread.map(a => updateDoc(doc(db, 'alerts', a.id), { read: true })));
    } catch (error) {
      console.error("Error marking alerts as read:", error);
    }
  };

  const markAsUnread = async (id: string) => {
    try {
      await updateDoc(doc(db, 'alerts', id), { read: false });
    } catch (error) {
      console.error("Error marking alert as unread:", error);
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'alerts', id));
    } catch (error) {
      console.error("Error deleting alert:", error);
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'unread') return !a.read;
    if (filter === 'critical') return a.alert_type === 'dry_run' || a.alert_type === 'sensor_error';
    return true;
  });

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar (Simplified) */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">HydroSync</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>
        <nav className="p-4 space-y-1">
          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Dashboard</Link>
          <Link to="/admin/devices" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Device Registration</Link>
          <Link to="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Users & Devices</Link>
          <Link to="/admin/alerts" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/10 text-cyan-400">Fleet Alerts</Link>
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
            <h2 className="text-lg font-bold text-white">Fleet Alerts</h2>
          </div>
          <button 
            onClick={markAllRead}
            className="text-xs font-bold text-slate-500 hover:text-white transition-colors"
          >
            Mark All Read
          </button>
        </header>

        <div className="p-8 space-y-6">
          <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-white/5 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-[#1a2234] border border-white/5 rounded-xl py-2 px-4 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">All Alerts</option>
                  <option value="unread">Unread Only</option>
                  <option value="critical">Critical Only</option>
                </select>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {loading ? (
                <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500" /></div>
              ) : filteredAlerts.length > 0 ? filteredAlerts.map((a) => (
                <div key={a.id} className={cn(
                  "px-8 py-4 flex items-center gap-6 transition-colors hover:bg-white/[0.01]",
                  !a.read ? "bg-cyan-500/[0.02] border-l-4 border-cyan-500" : "border-l-4 border-transparent"
                )}>
                  <div className="text-xl shrink-0">
                    {a.alert_type === 'dry_run' ? '🚨' : a.alert_type === 'sensor_error' ? '🛠' : '⚠'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-mono">{a.device_id}</span>
                      <span className="text-sm font-medium text-slate-200">{a.message}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 font-medium uppercase tracking-tighter">
                      {a.triggered_at?.toDate().toLocaleString() || 'Just now'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!a.read && (
                      <button 
                        onClick={() => updateDoc(doc(db, 'alerts', a.id), { read: true })}
                        className="p-2 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 rounded-lg transition-all"
                        title="Mark as read"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    {a.read && (
                      <button 
                        onClick={() => markAsUnread(a.id)}
                        className="p-2 bg-slate-800 text-slate-500 hover:bg-orange-500/10 hover:text-orange-500 rounded-lg transition-all"
                        title="Mark as unread"
                      >
                        <Circle className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => deleteAlert(a.id)}
                      className="p-2 bg-slate-800 text-slate-500 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                      title="Delete alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-slate-600 text-sm italic">No alerts found</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Link({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)} className={className}>{children}</button>;
}
