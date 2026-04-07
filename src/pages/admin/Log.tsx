import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { ActivityLog } from '../../types';
import { motion } from 'motion/react';
import { ClipboardList, Search, Filter, Download, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import Papa from 'papaparse';

export default function AdminLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'activity_log'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => doc.data() as ActivityLog));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const downloadCSV = () => {
    const csvData = logs.map(l => ({
      Timestamp: l.timestamp?.toDate().toLocaleString(),
      Action: l.action,
      Device: l.device_id || '-',
      User: l.user_id || '-',
      PerformedBy: l.performed_by
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `hydrosync_activity_log_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(search.toLowerCase()) || 
    l.device_id?.toLowerCase().includes(search.toLowerCase()) ||
    l.performed_by.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar (Simplified) */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ClipboardList className="w-5 h-5 text-white" />
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
          <Link to="/admin/log" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/10 text-cyan-400">Activity Log</Link>
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
            <h2 className="text-lg font-bold text-white">Activity Log</h2>
          </div>
          <button 
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-200 font-bold rounded-xl transition-all text-xs border border-white/5"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </header>

        <div className="p-8 space-y-6">
          <div className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-white/5 flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search log by action, device, or user..."
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[180px]">Timestamp</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Action</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[100px]">Device</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[150px]">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr><td colSpan={4} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500" /></td></tr>
                  ) : filteredLogs.length > 0 ? filteredLogs.map((l, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">
                        {l.timestamp?.toDate().toLocaleString() || 'Just now'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-200">{l.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-cyan-500">{l.device_id || '-'}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">{l.performed_by}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-600 text-sm italic">No log entries found</td></tr>
                  )}
                </tbody>
              </table>
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
