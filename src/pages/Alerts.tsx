import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { Alert } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Bell, Trash2, CheckCircle2, Filter, Droplets, BarChart2, Settings, Loader2, Circle } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Alerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'alerts'), where('user_id', '==', user.uid), orderBy('triggered_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'alerts', id), { read: true });
    } catch (error) {
      console.error("Error marking alert as read:", error);
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

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">Alerts</h1>
        </div>
        {unreadCount > 0 && (
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
            {unreadCount} Unread
          </span>
        )}
      </header>

      <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5">
        {(['all', 'unread', 'critical'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
              filter === f 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" 
                : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <main className="flex-1 p-6 space-y-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>
        ) : filteredAlerts.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredAlerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => !alert.read && markAsRead(alert.id)}
                  className={cn(
                    "relative p-5 bg-[#1e293b] rounded-2xl border transition-all cursor-pointer group",
                    !alert.read ? "border-cyan-500/30 shadow-lg shadow-cyan-500/5" : "border-white/5 opacity-80"
                  )}
                >
                  {!alert.read && (
                    <div className="absolute top-5 right-5 w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                  )}
                  <div className="flex gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-xl",
                      alert.alert_type === 'dry_run' ? "bg-red-500/10 text-red-500" : 
                      alert.alert_type === 'device_offline' ? "bg-red-500/10 text-red-500" :
                      alert.alert_type === 'tank_empty' ? "bg-orange-500/10 text-orange-500" : "bg-cyan-500/10 text-cyan-500"
                    )}>
                      {alert.alert_type === 'dry_run' ? '🚨' : 
                       alert.alert_type === 'device_offline' ? '📡' :
                       alert.alert_type === 'tank_empty' ? '⚠' : '🔔'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white leading-tight mb-1">{alert.message}</p>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
                        {alert.device_id} • {alert.triggered_at?.toDate().toLocaleString() || 'Just now'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!alert.read && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); markAsRead(alert.id); }}
                          className="p-2 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Mark as read"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {alert.read && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); markAsUnread(alert.id); }}
                          className="p-2 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Mark as unread"
                        >
                          <Circle className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteAlert(alert.id); }}
                        className="p-2 bg-white/5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-slate-700" />
            </div>
            <p className="text-slate-500 text-sm font-medium italic">No alerts to show</p>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#1e293b] border-t border-white/10 h-20 flex items-center justify-around px-2">
        <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <img src="/icon.png" alt="HydroSync Icon" className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
        </button>
        <button onClick={() => navigate('/history')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <BarChart2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">History</span>
        </button>
        <button onClick={() => navigate('/alerts')} className="flex flex-col items-center gap-1 text-cyan-500">
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
