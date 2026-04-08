import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { useAuth } from '../../App';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, LogOut, ArrowLeft, Shield, Mail, User, Bell, Database, 
  Key, Smartphone, Globe, Clock, ChevronRight, AlertTriangle, RefreshCw,
  Trash2, Download, Moon, Volume2, Lock, Plus, X, Save, Edit
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, addDoc } from 'firebase/firestore';

export default function AdminSettings() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'account' | 'notifications' | 'system' | 'mqtt' | 'data' | null>('account');
  const [mqttHosts, setMqttHosts] = useState<Array<{id: string, url: string, status: 'active' | 'inactive'}>>([]);
  const [newHostUrl, setNewHostUrl] = useState('');
  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    pushNotifications: true,
    dailySummary: false,
    dryRunAlerts: true
  });

  useEffect(() => {
    // Load notification settings from localStorage
    const saved = localStorage.getItem('admin_notifications');
    if (saved) {
      setNotificationSettings(JSON.parse(saved));
    }
  }, []);

  const updateNotificationSetting = (key: string, value: boolean) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);
    localStorage.setItem('admin_notifications', JSON.stringify(newSettings));
  };

  useEffect(() => {
    if (activeSection === 'mqtt') {
      loadMqttHosts();
    }
  }, [activeSection]);

  const loadMqttHosts = async () => {
    try {
      const hostsRef = collection(db, 'mqtt_hosts');
      const snapshot = await getDocs(hostsRef);
      const hosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Array<{id: string, url: string, status: 'active' | 'inactive'}>;
      setMqttHosts(hosts);
    } catch (error) {
      console.error('Error loading MQTT hosts:', error);
    }
  };

  const addMqttHost = async () => {
    if (!newHostUrl.trim()) return;
    try {
      await addDoc(collection(db, 'mqtt_hosts'), {
        url: newHostUrl.trim(),
        status: 'active'
      });
      setNewHostUrl('');
      loadMqttHosts();
    } catch (error) {
      console.error('Error adding MQTT host:', error);
    }
  };

  const updateMqttHost = async (id: string) => {
    if (!editUrl.trim()) return;
    try {
      await updateDoc(doc(db, 'mqtt_hosts', id), {
        url: editUrl.trim()
      });
      setEditingHost(null);
      setEditUrl('');
      loadMqttHosts();
    } catch (error) {
      console.error('Error updating MQTT host:', error);
    }
  };

  const deleteMqttHost = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'mqtt_hosts', id));
      loadMqttHosts();
    } catch (error) {
      console.error('Error deleting MQTT host:', error);
    }
  };

  const toggleHostStatus = async (id: string, currentStatus: 'active' | 'inactive') => {
    try {
      await updateDoc(doc(db, 'mqtt_hosts', id), {
        status: currentStatus === 'active' ? 'inactive' : 'active'
      });
      loadMqttHosts();
    } catch (error) {
      console.error('Error toggling host status:', error);
    }
  };

  const exportAllData = async () => {
    try {
      setLoading(true);
      // Export all collections except users
      const collections = ['devices', 'mqtt_hosts', 'email_tokens'];
      const exportData: any = {};

      for (const coll of collections) {
        const snapshot = await getDocs(collection(db, coll));
        exportData[coll] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hydrosync_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  const backupDatabase = async () => {
    // Same as export for now
    await exportAllData();
  };

  const clearAllTelemetry = async () => {
    if (!confirm('Are you sure you want to clear all telemetry data? This cannot be undone.')) return;
    try {
      setLoading(true);
      const devicesSnapshot = await getDocs(collection(db, 'devices'));
      for (const deviceDoc of devicesSnapshot.docs) {
        const historyRef = collection(db, 'devices', deviceDoc.id, 'history');
        const historySnapshot = await getDocs(historyRef);
        const deletePromises = historySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
      alert('All telemetry data cleared successfully');
    } catch (error) {
      console.error('Error clearing telemetry:', error);
      alert('Failed to clear telemetry data');
    } finally {
      setLoading(false);
    }
  };

  const resetSystem = async () => {
    if (!confirm('Are you sure you want to reset the system? This will delete all data except users. This cannot be undone.')) return;
    try {
      setLoading(true);
      // Delete all collections except users
      const collections = ['devices', 'mqtt_hosts', 'email_tokens'];
      for (const coll of collections) {
        const snapshot = await getDocs(collection(db, coll));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
      alert('System reset successfully');
    } catch (error) {
      console.error('Error resetting system:', error);
      alert('Failed to reset system');
    } finally {
      setLoading(false);
    }
  };

  const deleteAllData = async () => {
    if (profile?.role !== 'superuser') {
      alert('Only superusers can perform this action');
      return;
    }
    if (!confirm('SUPERUSER ACTION: Are you sure you want to delete ALL data except users? This cannot be undone.')) return;
    await resetSystem();
  };

  const settingsSections = [
    { id: 'account', label: 'Account', icon: <User className="w-4 h-4" />, desc: 'Profile, security, and login settings' },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, desc: 'Alert and notification preferences' },
    { id: 'system', label: 'System', icon: <Database className="w-4 h-4" />, desc: 'Bridge status and system controls' },
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
                  <ToggleSetting 
                    label="Email Alerts" 
                    desc="Receive email notifications for critical alerts" 
                    checked={notificationSettings.emailAlerts}
                    onChange={(checked) => updateNotificationSetting('emailAlerts', checked)}
                  />
                  <ToggleSetting 
                    label="Push Notifications" 
                    desc="Browser push notifications for device status changes" 
                    checked={notificationSettings.pushNotifications}
                    onChange={(checked) => updateNotificationSetting('pushNotifications', checked)}
                  />
                  <ToggleSetting 
                    label="Daily Summary" 
                    desc="Receive a daily digest of system activity" 
                    checked={notificationSettings.dailySummary}
                    onChange={(checked) => updateNotificationSetting('dailySummary', checked)}
                  />
                  <ToggleSetting 
                    label="Dry Run Alerts" 
                    desc="Immediate notification when pump runs dry" 
                    checked={notificationSettings.dryRunAlerts}
                    onChange={(checked) => updateNotificationSetting('dryRunAlerts', checked)}
                  />
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
                  <SettingsItem icon={<Globe className="w-4 h-4" />} label="MQTT Broker" value="https://www.hivemq.com/mqtt-cloud-broker/" />
                  <SettingsItem icon={<Clock className="w-4 h-4" />} label="Heartbeat Interval" value="30 seconds" />
                  <SettingsItem icon={<Volume2 className="w-4 h-4" />} label="Voltage Standard" value="240V AC" />
                  
                  <div className="pt-4 border-t border-white/5">
                    <SettingsButton icon={<RefreshCw className="w-4 h-4" />} label="Restart System" onClick={() => window.location.reload()} />
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
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newHostUrl}
                        onChange={(e) => setNewHostUrl(e.target.value)}
                        placeholder="mqtt://broker.hivemq.com"
                        className="bg-[#1a2234] border border-white/5 rounded-lg px-3 py-2 text-white text-sm w-64"
                      />
                      <button 
                        onClick={addMqttHost}
                        disabled={!newHostUrl.trim()}
                        className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-400 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Host
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {mqttHosts.map(host => (
                      <div key={host.id} className="bg-[#1a2234] border border-white/5 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              host.status === 'active' ? "bg-green-500/10" : "bg-yellow-500/10"
                            )}>
                              <Globe className={cn(
                                "w-4 h-4",
                                host.status === 'active' ? "text-green-500" : "text-yellow-500"
                              )} />
                            </div>
                            {editingHost === host.id ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  type="url"
                                  value={editUrl}
                                  onChange={(e) => setEditUrl(e.target.value)}
                                  className="flex-1 bg-[#0f172a] border border-white/5 rounded-lg px-3 py-2 text-white text-sm"
                                  placeholder="mqtt://broker.hivemq.com"
                                />
                                <button
                                  onClick={() => updateMqttHost(host.id)}
                                  className="px-3 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-sm"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingHost(null)}
                                  className="px-3 py-2 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 rounded-lg text-sm"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex-1">
                                <p className="text-sm font-bold text-white">{host.url}</p>
                                <p className="text-xs text-slate-500">{host.status === 'active' ? 'Active' : 'Inactive'}</p>
                              </div>
                            )}
                          </div>
                          {editingHost !== host.id && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingHost(host.id);
                                  setEditUrl(host.url);
                                }}
                                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleHostStatus(host.id, host.status)}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-xs font-bold",
                                  host.status === 'active' 
                                    ? "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400" 
                                    : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
                                )}
                              >
                                {host.status === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                onClick={() => deleteMqttHost(host.id)}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {mqttHosts.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No MQTT hosts configured</p>
                        <p className="text-sm">Add your first HiveMQ broker URL above</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-white/5">
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Globe className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-blue-400">MQTT Configuration</p>
                          <p className="text-xs text-slate-500 mt-1">Devices will automatically connect to the first available active broker. Add backup hosts for redundancy and scalability.</p>
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
                  <SettingsButton icon={<Download className="w-4 h-4" />} label="Export All Data" desc="Download complete system data as JSON" onClick={exportAllData} loading={loading} />
                  <SettingsButton icon={<Database className="w-4 h-4" />} label="Backup Database" desc="Create a backup of all Firestore collections" onClick={backupDatabase} loading={loading} />
                  
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
                        <SettingsButton icon={<Trash2 className="w-4 h-4" />} label="Clear All Telemetry" danger onClick={clearAllTelemetry} loading={loading} />
                        <SettingsButton icon={<Trash2 className="w-4 h-4" />} label="Reset System" danger onClick={resetSystem} loading={loading} />
                        {profile?.role === 'superuser' && (
                          <SettingsButton icon={<Trash2 className="w-4 h-4" />} label="Delete All Data (Superuser)" danger onClick={deleteAllData} loading={loading} />
                        )}
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

function ToggleSetting({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "w-12 h-6 rounded-full transition-colors relative",
          checked ? "bg-cyan-500" : "bg-slate-700"
        )}
      >
        <div className={cn(
          "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
          checked ? "translate-x-6" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}
