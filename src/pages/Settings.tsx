import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Device } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, User, Smartphone, Bell, Info, LogOut, ChevronRight, ChevronDown, ChevronUp, Save, Loader2, ShieldCheck, Droplets, BarChart2, Settings as SettingsIcon, Trash2, AlertTriangle, X, Mail } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Settings() {
  const { user, profile, isAdmin } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [deviceEdits, setDeviceEdits] = useState<Record<string, { name: string; ohCap: number; ugCap: number }>>({});
  const [savingDevice, setSavingDevice] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    setEditName(profile?.name || '');
    setEditRegion(profile?.region || '');

    const q = query(collection(db, 'devices'), where('assigned_to_user', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const deviceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      setDevices(deviceData);
      // Initialize edit state for each device
      const edits: Record<string, { name: string; ohCap: number; ugCap: number }> = {};
      deviceData.forEach(d => {
        edits[d.id] = { name: d.name, ohCap: d.ohCap || 1000, ugCap: d.ugCap || 2000 };
      });
      setDeviceEdits(edits);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, profile]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: editName,
        region: editRegion
      });
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateDeviceName = async (deviceId: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), { name: newName });
    } catch (error) {
      console.error("Error updating device name:", error);
    }
  };

  const saveDeviceChanges = async (deviceId: string) => {
    const edits = deviceEdits[deviceId];
    if (!edits) return;
    
    setSavingDevice(deviceId);
    try {
      await updateDoc(doc(db, 'devices', deviceId), {
        name: edits.name,
        ohCap: edits.ohCap,
        ugCap: edits.ugCap
      });
    } catch (error) {
      console.error("Error saving device changes:", error);
    } finally {
      setSavingDevice(null);
    }
  };

  const resetAllData = async () => {
    if (resetConfirm !== 'RESET') return;
    setResetting(true);
    try {
      const collections = ['devices', 'alerts', 'activity_log', 'commands'];
      
      for (const colName of collections) {
        const q = query(collection(db, colName));
        const snap = await getDocs(q);
        
        // Delete in batches of 500
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();

        // If it's devices, also delete their telemetry subcollections
        if (colName === 'devices') {
          for (const deviceDoc of snap.docs) {
            const telSnap = await getDocs(collection(db, 'devices', deviceDoc.id, 'telemetry'));
            const telBatch = writeBatch(db);
            telSnap.docs.forEach(t => telBatch.delete(t.ref));
            await telBatch.commit();
          }
        }
      }
      
      setShowResetModal(false);
      setResetConfirm('');
      alert("All system data has been wiped successfully.");
    } catch (error) {
      console.error("Error resetting data:", error);
      alert("Failed to reset data. Check console for details.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
      </header>

      <main className="flex-1 p-6 space-y-8 max-w-lg mx-auto w-full">
        {/* Account Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Account</h3>
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a2234] border border-white/5 rounded-xl">
                  <span className="text-sm text-slate-400">{user?.email}</span>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Cannot change</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Global Region</label>
                <select
                  value={editRegion}
                  onChange={(e) => setEditRegion(e.target.value)}
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none"
                >
                  <option value="Nairobi">Nairobi</option>
                  <option value="Mombasa">Mombasa</option>
                  <option value="Kisumu">Kisumu</option>
                  <option value="Nakuru">Nakuru</option>
                  <option value="Eldoret">Eldoret</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 border border-cyan-500/30 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Account Changes
              </button>
            </div>
          </div>
        </section>

        {/* Device Info Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Device Info</h3>
          <div className="space-y-3">
            {devices.map((d) => (
              <div key={d.id} className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => setExpandedDevice(expandedDevice === d.id ? null : d.id)}
                  className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-sm font-bold text-white">{d.name}</h4>
                      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{d.device_id}</p>
                    </div>
                  </div>
                  {expandedDevice === d.id ? <ChevronUp className="w-5 h-5 text-slate-600" /> : <ChevronDown className="w-5 h-5 text-slate-600" />}
                </button>

                <AnimatePresence>
                  {expandedDevice === d.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 p-5 space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Device ID</span>
                          <p className="text-xs font-mono text-slate-400 bg-[#1a2234] p-2 rounded-lg border border-white/5">{d.device_id}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Token</span>
                          <p className="text-xs font-mono text-slate-400 bg-[#1a2234] p-2 rounded-lg border border-white/5">32 characters</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">Device Name</label>
                        <input
                          type="text"
                          value={deviceEdits[d.id]?.name || d.name}
                          onChange={(e) => setDeviceEdits(prev => ({
                            ...prev,
                            [d.id]: { ...prev[d.id], name: e.target.value }
                          }))}
                          className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">Overhead (L)</label>
                          <input
                            type="number"
                            value={deviceEdits[d.id]?.ohCap || d.ohCap || 1000}
                            onChange={(e) => setDeviceEdits(prev => ({
                              ...prev,
                              [d.id]: { ...prev[d.id], ohCap: Number(e.target.value) }
                            }))}
                            className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-cyan-400 font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">Underground (L)</label>
                          <input
                            type="number"
                            value={deviceEdits[d.id]?.ugCap || d.ugCap || 2000}
                            onChange={(e) => setDeviceEdits(prev => ({
                              ...prev,
                              [d.id]: { ...prev[d.id], ugCap: Number(e.target.value) }
                            }))}
                            className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-2.5 px-4 text-sm text-cyan-400 font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                          />
                        </div>
                      </div>
                      {/* Save Button */}
                      <button
                        onClick={() => saveDeviceChanges(d.id)}
                        disabled={savingDevice === d.id}
                        className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 border border-cyan-500/30 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {savingDevice === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Device Changes
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Notifications</h3>
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
            <ToggleRow label="Tank Low Alert" sub="Below 10% triggers alert" active />
            <ToggleRow label="Tank Full Alert" sub="When overhead reaches 100%" active />
            <ToggleRow label="Dry Run Alert" sub="Critical pump protection" active />
            <ToggleRow label="Sensor Errors" sub="Ultrasonic sensor failures" active />
            <ToggleRow label="Device Offline" sub="No data for >5 minutes" />
          </div>
        </section>

        {/* Support Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Support</h3>
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-3xl border border-cyan-500/20 p-8 space-y-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-all" />
            
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-cyan-500/20 relative">
                <div className="absolute inset-0 bg-cyan-400 rounded-2xl animate-ping opacity-20" />
                <Mail className="w-7 h-7 text-white relative z-10" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Need Technical Help?</h4>
                <p className="text-xs text-slate-400">Direct access to our engineering team.</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              For complex hardware issues, sensor calibration, or account recovery that the AI cannot resolve, contact our human administrators directly.
            </p>
            
            <button
              onClick={() => window.location.href = 'mailto:support@hydrosync.co.ke'}
              className="w-full py-5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black text-xs uppercase tracking-[0.25em] rounded-2xl transition-all shadow-xl shadow-cyan-500/30 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Mail className="w-4 h-4" />
              Contact Human Admin
            </button>
            
            <div className="pt-2 text-center">
              <p className="text-[10px] text-slate-500 font-medium">Average response time: &lt; 24 hours</p>
            </div>
          </div>
        </section>

        {/* App Info */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">App</h3>
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
            <div className="p-5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Version</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">HydroSync v1.0.0</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full p-5 flex items-center gap-4 text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-bold">Sign Out</span>
            </button>
          </div>
        </section>
      </main>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#111827] rounded-3xl border border-red-500/30 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-red-500/10">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-bold text-white">Critical Action</h3>
                </div>
                <button onClick={() => setShowResetModal(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-sm text-slate-400 leading-relaxed">
                  You are about to wipe the entire database. This includes all registered devices, their telemetry history, and all system logs. 
                  <br /><br />
                  To confirm, please type <span className="text-white font-bold tracking-widest">RESET</span> below:
                </p>
                <input
                  type="text"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder="Type RESET here"
                  className="w-full bg-[#1a2234] border border-red-500/20 rounded-xl py-4 px-6 text-center text-lg font-black tracking-[0.2em] text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all uppercase"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={resetAllData}
                    disabled={resetConfirm !== 'RESET' || resetting}
                    className="flex-1 py-4 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:hover:bg-red-500 text-white font-bold rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Confirm Wipe
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        <button onClick={() => navigate('/alerts')} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors">
          <Bell className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Alerts</span>
        </button>
        <button onClick={() => navigate('/settings')} className="flex flex-col items-center gap-1 text-cyan-500">
          <SettingsIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
        </button>
      </nav>
    </div>
  );
}

function ToggleRow({ label, sub, active = false }: { label: string; sub: string; active?: boolean }) {
  const [on, setOn] = useState(active);
  return (
    <div className="p-5 flex items-center justify-between">
      <div>
        <h4 className="text-sm font-bold text-white">{label}</h4>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={cn(
          "w-11 h-6 rounded-full transition-all relative",
          on ? "bg-cyan-500" : "bg-slate-700"
        )}
      >
        <div className={cn(
          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
          on ? "left-6" : "left-1"
        )} />
      </button>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
}
