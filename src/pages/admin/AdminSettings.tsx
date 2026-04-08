import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { useAuth } from '../../App';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, LogOut, ArrowLeft, Shield, Mail, User, Bell, Database, 
  Key, Smartphone, Globe, Clock, ChevronRight, AlertTriangle, RefreshCw,
  Trash2, Download, Moon, Volume2, Lock, Plus, X, Save
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

export default function AdminSettings() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'account' | 'notifications' | 'system' | 'data' | null>('account');

  const handleLogout = async () => {
    setLoading(true);
    try {
      await auth.signOut();
      navigate('/admin-login', { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const settingsSections = [
    { id: 'account', label: 'Account', icon: <User className="w-4 h-4" />, desc: 'Profile, security, and login settings' },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, desc: 'Alert and notification preferences' },
    { id: 'system', label: 'System', icon: <Database className="w-4 h-4" />, desc: 'Bridge status, simulation controls' },
    { id: 'mqtt', label: 'MQTT Hosts', icon: <Globe className="w-4 h-4" />, desc: 'Manage HiveMQ broker URLs' },
    { id: 'data', label: 'Data Management', icon: <RefreshCw className="w-4 h-4" />, desc: 'Export, backup, and reset options' },
  ];

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">HydroSync</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Dashboard</Link>
          <Link to="/admin/devices" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Device Registration</Link>
          <Link to="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Users & Devices</Link>
          <Link to="/admin/settings" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/10 text-cyan-400">Settings</Link>
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="p-4 bg-white/5 rounded-xl">
            <p className="text-xs font-bold text-white">Admin Account</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">{user?.email}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="h-16 bg-[#111827] border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors group"
              title="Back to Admin Dashboard"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <h2 className="text-lg font-bold text-white">Settings</h2>
          </div>
        </header>

        <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
          {/* Settings Navigation */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {settingsSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id as any)}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left",
                  activeSection === section.id 
                    ? "bg-cyan-500/10 border-cyan-500/20" 
                    : "bg-[#111827] border-white/5 hover:bg-white/[0.02]"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center mb-3",
                  activeSection === section.id ? "bg-cyan-500/20 text-cyan-500" : "bg-white/5 text-slate-400"
                )}>
                  {section.icon}
                </div>
                <p className="text-sm font-bold text-white">{section.label}</p>
                <p className="text-[10px] text-slate-500 mt-1">{section.desc}</p>
              </button>
            ))}
          </div>

          {/* Settings Content */}
          <AnimatePresence mode="wait">
            {activeSection === 'account' && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm"
              >
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-cyan-500" />
                    Account Details
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SettingsItem icon={<User className="w-4 h-4" />} label="Name" value={profile?.name || 'N/A'} />
                    <SettingsItem icon={<Mail className="w-4 h-4" />} label="Email" value={user?.email || 'N/A'} />
                    <SettingsItem icon={<Shield className="w-4 h-4" />} label="Role" value={profile?.role || 'N/A'} capitalize />
                    <SettingsItem icon={<Lock className="w-4 h-4" />} label="Status" value={profile?.status || 'Active'} badge />
                  </div>
                  
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <SettingsButton icon={<Key className="w-4 h-4" />} label="Change Password" onClick={() => navigate('/forgot-password')} />
                    <SettingsButton icon={<LogOut className="w-4 h-4" />} label="Log Out" danger onClick={handleLogout} loading={loading} />
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm"
              >
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-orange-500" />
                    Notification Preferences
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <ToggleSetting label="Email Alerts" desc="Receive email notifications for critical alerts" defaultChecked />
                  <ToggleSetting label="Push Notifications" desc="Browser push notifications for device status changes" defaultChecked />
                  <ToggleSetting label="Daily Summary" desc="Receive a daily digest of system activity" />
                  <ToggleSetting label="Dry Run Alerts" desc="Immediate notification when pump runs dry" defaultChecked />
                </div>
              </motion.div>
            )}

            {activeSection === 'system' && (
              <motion.div
                key="system"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm"
              >
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-green-500" />
                    System Configuration
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <SettingsItem icon={<Globe className="w-4 h-4" />} label="MQTT Broker" value="mqtt.hydrosync.io" />
                  <SettingsItem icon={<Clock className="w-4 h-4" />} label="Heartbeat Interval" value="30 seconds" />
                  <SettingsItem icon={<Volume2 className="w-4 h-4" />} label="Voltage Standard" value="240V AC" />
                  <SettingsItem icon={<Moon className="w-4 h-4" />} label="Simulation Mode" value="Active" badge />
                  
                  <div className="pt-4 border-t border-white/5">
                    <SettingsButton icon={<RefreshCw className="w-4 h-4" />} label="Restart Simulation" onClick={() => window.location.reload()} />
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'mqtt' && (
              <motion.div
                key="mqtt"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm"
              >
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    MQTT Host Management
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">Configure HiveMQ broker URLs for device communication</p>
                    <button className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                      <Plus className="w-4 h-4" />
                      Add Host
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="bg-[#1a2234] border border-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                            <Globe className="w-4 h-4 text-green-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">mqtt.hydrosync.io</p>
                            <p className="text-xs text-slate-500">Primary broker - Active</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <Settings className="w-4 h-4" />
                          </button>
                          <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[#1a2234] border border-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                            <Globe className="w-4 h-4 text-yellow-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">mqtt-backup.hydrosync.io</p>
                            <p className="text-xs text-slate-500">Backup broker - Standby</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <Settings className="w-4 h-4" />
                          </button>
                          <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-white/5">
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Globe className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-blue-400">MQTT Configuration</p>
                          <p className="text-xs text-slate-500 mt-1">Devices will automatically connect to the first available broker. Add backup hosts for redundancy.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'data' && (
              <motion.div
                key="data"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#111827] rounded-2xl border border-white/5 overflow-hidden shadow-sm"
              >
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-purple-500" />
                    Data Management
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <SettingsButton icon={<Download className="w-4 h-4" />} label="Export All Data" desc="Download complete system data as JSON" onClick={() => {}} />
                  <SettingsButton icon={<Database className="w-4 h-4" />} label="Backup Database" desc="Create a backup of all Firestore collections" onClick={() => {}} />
                  
                  <div className="pt-4 border-t border-white/5">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-red-400">Danger Zone</p>
                          <p className="text-xs text-slate-500 mt-1">These actions are irreversible. Proceed with caution.</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <SettingsButton icon={<Trash2 className="w-4 h-4" />} label="Clear All Telemetry" danger onClick={() => {}} />
                        <SettingsButton icon={<Trash2 className="w-4 h-4" />} label="Reset System" danger onClick={() => {}} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function SettingsItem({ icon, label, value, capitalize, badge }: { icon: React.ReactNode; label: string; value: string; capitalize?: boolean; badge?: boolean }) {
  return (
    <div className="bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
      </div>
      {badge ? (
        <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded-md text-xs font-bold uppercase tracking-widest">
          {value}
        </span>
      ) : (
        <p className={cn("text-white", capitalize && "capitalize")}>{value}</p>
      )}
    </div>
  );
}

function SettingsButton({ icon, label, desc, danger, loading, onClick }: { icon: React.ReactNode; label: string; desc?: string; danger?: boolean; loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
        danger 
          ? "bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-400" 
          : "bg-white/5 border-white/5 hover:bg-white/10 text-white"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center",
        danger ? "bg-red-500/20" : "bg-white/10"
      )}>
        {icon}
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-bold">{label}</p>
        {desc && <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-600" />
    </button>
  );
}

function ToggleSetting({ label, desc, defaultChecked }: { label: string; desc: string; defaultChecked?: boolean }) {
  const [enabled, setEnabled] = useState(defaultChecked || false);
  
  return (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "w-12 h-6 rounded-full transition-colors relative",
          enabled ? "bg-cyan-500" : "bg-slate-700"
        )}
      >
        <div className={cn(
          "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
          enabled ? "translate-x-6" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}
