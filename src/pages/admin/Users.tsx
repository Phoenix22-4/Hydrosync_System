import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, deleteDoc, getDocs, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { UserProfile, Device } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Search, Filter, ShieldAlert, ShieldCheck, Trash2, Plus, Smartphone, ChevronDown, ChevronUp, Loader2, X, Copy, Check, ArrowLeft, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, deleteUser as deleteAuthUser } from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

// Initialize secondary app for creating users without signing out the admin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [unassignedDevices, setUnassignedDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Add User Form State
  const [addType, setAddType] = useState<'user' | 'admin'>('user');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDevice, setNewUserDevice] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  const { user, isSuperuser } = useAuth();
  const navigate = useNavigate();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (!user) return;
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('created_at', 'desc')), (snap) => {
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });

    const unsubDevices = onSnapshot(query(collection(db, 'devices'), where('status', '==', 'unassigned')), (snap) => {
      setUnassignedDevices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device)));
    });

    return () => {
      unsubUsers();
      unsubDevices();
    };
  }, [user]);

  const toggleBlock = async (userProfile: UserProfile) => {
    const newStatus = userProfile.status === 'blocked' ? 'active' : 'blocked';
    try {
      await updateDoc(doc(db, 'users', userProfile.uid), { status: newStatus });
    } catch (error) {
      console.error("Error updating user status:", error);
    }
  };

  const activateUser = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { status: 'active' });
    } catch (error) {
      console.error("Error activating user:", error);
    }
  };

  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const deleteUser = async (uid: string, userEmail: string) => {
    if (!window.confirm(`Delete user "${userEmail}"? This action cannot be undone.`)) return;
    
    setDeletingUserId(uid);
    try {
      // Delete from Firestore users collection
      await deleteDoc(doc(db, 'users', uid));
      
      // Unassign any devices linked to this user
      const deviceDocs = await getDocs(query(collection(db, 'devices'), where('assigned_to_user', '==', uid)));
      for (const d of deviceDocs.docs) {
        await updateDoc(doc(db, 'devices', d.id), {
          assigned_to_user: null,
          user_name: null,
          status: 'unassigned'
        });
      }
      
      // Note: Firebase Auth user deletion requires Admin SDK (server-side)
      // This should be implemented via Cloud Functions for security
      // For now, only Firestore data is deleted
      
      // The onSnapshot listener will automatically update the UI
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user. Please try again.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const assignDevice = async (uid: string, deviceId: string) => {
    try {
      const userProfile = users.find(u => u.uid === uid);
      if (!userProfile) return;

      const newDeviceIds = [...(userProfile.device_ids || []), deviceId];
      await updateDoc(doc(db, 'users', uid), { device_ids: newDeviceIds });
      
      // Find the device doc ID
      const deviceDocs = await getDocs(query(collection(db, 'devices'), where('device_id', '==', deviceId)));
      if (!deviceDocs.empty) {
        await updateDoc(doc(db, 'devices', deviceDocs.docs[0].id), { 
          assigned_to_user: uid, 
          user_name: userProfile.name,
          status: 'active' 
        });
      }
      
      setExpandedUserId(uid);
    } catch (error) {
      console.error("Error assigning device:", error);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) {
      setAddUserError("Name, email, and password are required.");
      return;
    }

    if (addType === 'user' && !newUserDevice) {
      setAddUserError("A device must be assigned to a user.");
      return;
    }

    setIsAddingUser(true);
    setAddUserError(null);

    try {
      // Create user in Firebase Auth using secondary app
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;

      // Create user document in Firestore
      await setDoc(doc(db, 'users', newUid), {
        name: newUserName,
        email: newUserEmail,
        status: 'pending', // Default to pending as requested
        role: 'user', // Default to user as requested
        device_ids: newUserDevice ? [newUserDevice] : [],
        created_at: serverTimestamp()
      });

      // Update device if assigned
      if (newUserDevice) {
        const deviceDocs = await getDocs(query(collection(db, 'devices'), where('device_id', '==', newUserDevice)));
        if (!deviceDocs.empty) {
          await updateDoc(doc(db, 'devices', deviceDocs.docs[0].id), { 
            assigned_to_user: newUid, 
            user_name: newUserName,
            status: 'active' 
          });
        }
      }

      // Sign out secondary app to clean up
      await signOut(secondaryAuth);

      // Reset form and close modal
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserDevice('');
      setShowAddModal(false);
    } catch (error: any) {
      console.error("Error adding user:", error);
      setAddUserError(error.message || "Failed to create user.");
    } finally {
      setIsAddingUser(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.uid.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || u.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex min-h-screen bg-[#0a0f1e]">
      {/* Sidebar (Simplified) */}
      <aside className="w-64 bg-[#111827] border-r border-white/5 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">HydroSync</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>
        <nav className="p-4 space-y-1">
          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Dashboard</Link>
          <Link to="/admin/devices" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-200">Device Registration</Link>
          <Link to="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/10 text-cyan-400">Users & Devices</Link>
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
            <h2 className="text-lg font-bold text-white">Users & Their Devices</h2>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            Add User Manually
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
                  placeholder="Search by name or email..."
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
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Devices</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Region</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr><td colSpan={6} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500" /></td></tr>
                  ) : filteredUsers.length > 0 ? filteredUsers.map((u) => (
                    <React.Fragment key={u.uid}>
                      <tr 
                        onClick={() => setExpandedUserId(expandedUserId === u.uid ? null : u.uid)}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-200">{u.name}</span>
                              {expandedUserId === u.uid ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[9px] font-mono text-slate-600 truncate max-w-[80px]">{u.uid}</span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(u.uid); }}
                                className="p-1 text-slate-600 hover:text-cyan-500 transition-colors"
                              >
                                {copiedId === u.uid ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                            u.status === 'active' ? "bg-green-500/10 border-green-500/30 text-green-500" :
                            u.status === 'blocked' ? "bg-red-500/10 border-red-500/30 text-red-500" :
                            "bg-orange-500/10 border-orange-500/30 text-orange-500"
                          )}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {u.device_ids?.map(id => (
                              <span key={id} className="px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 text-[9px] font-bold rounded uppercase tracking-tighter">{id}</span>
                            )) || <span className="text-[10px] text-slate-600 italic">None</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{u.region || '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                            {u.status === 'pending' && (
                              <button 
                                onClick={() => activateUser(u.uid)}
                                className="p-2 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 rounded-lg transition-all"
                                title="Activate User"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => toggleBlock(u)}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                u.status === 'blocked' ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              )}
                              title={u.status === 'blocked' ? "Unblock User" : "Block User"}
                            >
                              {u.status === 'blocked' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                            </button>
                            {isSuperuser && (
                              <button 
                                onClick={() => deleteUser(u.uid, u.email)}
                                disabled={deletingUserId === u.uid}
                                className="p-2 bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all disabled:opacity-50"
                                title="Delete User"
                              >
                                {deletingUserId === u.uid ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedUserId === u.uid && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white/[0.01]"
                          >
                            <td colSpan={6} className="px-12 py-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Assign New Device</h4>
                                  {unassignedDevices.length > 0 ? (
                                    <div className="space-y-2">
                                      {unassignedDevices.map(d => (
                                        <button
                                          key={d.id}
                                          onClick={() => assignDevice(u.uid, d.device_id)}
                                          className="w-full flex items-center justify-between p-3 bg-[#1a2234] border border-white/5 rounded-xl hover:border-cyan-500/30 transition-all group"
                                        >
                                          <div className="flex items-center gap-3">
                                            <Smartphone className="w-4 h-4 text-slate-600 group-hover:text-cyan-500" />
                                            <span className="text-sm font-mono text-slate-300">{d.device_id}</span>
                                          </div>
                                          <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">Assign →</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-600 italic">No unassigned devices available</p>
                                  )}
                                </div>
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Account Details</h4>
                                  <div className="space-y-3">
                                    <DetailRow label="Joined" value={u.created_at?.toDate().toLocaleDateString() || '—'} />
                                    <DetailRow label="Total Devices" value={u.device_ids?.length || 0} />
                                    <DetailRow label="Region" value={u.region || 'Not set'} />
                                    <DetailRow label="Role" value={u.role || 'user'} />
                                  </div>
                                  
                                  {isSuperuser && (
                                    <div className="mt-6 pt-6 border-t border-white/5">
                                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Superuser Actions</h4>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const { sendPasswordResetEmail } = await import('firebase/auth');
                                            const { auth } = await import('../../firebase');
                                            await sendPasswordResetEmail(auth, u.email);
                                            alert(`Password reset email sent to ${u.email}`);
                                          } catch (err: any) {
                                            alert(`Failed to send reset email: ${err.message}`);
                                          }
                                        }}
                                        className="w-full py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2"
                                      >
                                        <Mail className="w-4 h-4" /> Send Password Reset
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  )) : (
                    <tr><td colSpan={6} className="p-12 text-center text-slate-600 text-sm italic">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md bg-[#111827] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Add {addType === 'admin' ? 'Admin' : 'User'} Manually</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="flex gap-2 p-1 bg-[#1a2234] rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setAddType('user')}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                      addType === 'user' ? "bg-cyan-500 text-slate-900 shadow-md" : "text-slate-400 hover:text-white"
                    )}
                  >
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddType('admin')}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                      addType === 'admin' ? "bg-purple-500 text-white shadow-md" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Admin
                  </button>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  The {addType} will be created with a <span className="text-orange-400 font-bold">pending</span> status and <span className="text-cyan-400 font-bold">user</span> role. You can activate them here, but to make them an admin, you must change their role in the Firebase Console.
                </p>
                
                {addUserError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">{addUserError}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="John Kamau" 
                    required
                    className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email" 
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="john@email.com" 
                    required
                    className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
                  <input 
                    type="password" 
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="••••••••" 
                    required
                    minLength={6}
                    className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all" 
                  />
                </div>
                
                {addType === 'user' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Assign Device (Mandatory)</label>
                    <select 
                      value={newUserDevice}
                      onChange={(e) => setNewUserDevice(e.target.value)}
                      required
                      className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">-- Select Unassigned Device --</option>
                      {unassignedDevices.map(d => <option key={d.id} value={d.device_id}>{d.device_id}</option>)}
                    </select>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isAddingUser}
                  className={cn(
                    "w-full py-4 mt-2 font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex justify-center items-center gap-2",
                    addType === 'admin' ? "bg-purple-500 hover:bg-purple-400 text-white shadow-purple-500/20" : "bg-cyan-500 hover:bg-cyan-400 text-slate-900 shadow-cyan-500/20"
                  )}
                >
                  {isAddingUser ? <Loader2 className="w-5 h-5 animate-spin" /> : `Create ${addType === 'admin' ? 'Admin' : 'User'} ✓`}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-300">{value}</span>
    </div>
  );
}

function Link({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)} className={className}>{children}</button>;
}

import React from 'react';
