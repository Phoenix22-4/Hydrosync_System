import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useAuth } from '../../App';
import { motion } from 'motion/react';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, XCircle, Home } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deniedReason, setDeniedReason] = useState<string>('');
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading, profile } = useAuth();

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [authLoading, user, isAdmin, navigate]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAccessDenied(false);

    // Check if online
    if (!navigator.onLine) {
      setDeniedReason("You are currently offline. HydroSync requires an internet connection to function.");
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // 2. Check and auto-upgrade specific admin emails
      const adminEmails = ['htmlfirephoenix@gmail.com', 'visiontech072025@gmail.com'];
      
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (adminEmails.includes(firebaseUser.email || '')) {
        // Auto-upgrade this user to active admin if they are the designated owner
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            name: 'System Administrator',
            email: firebaseUser.email,
            status: 'active',
            role: 'admin',
            created_at: serverTimestamp()
          });
        } else {
          await updateDoc(userRef, {
            status: 'active',
            role: 'admin'
          });
        }
        // Success - set loading false, useEffect will redirect when isAdmin becomes true
        setLoading(false);
        return;
      }

      // 3. For other users, check if they are actually an admin and active
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.role !== 'admin' && userData.role !== 'superuser') {
          await auth.signOut();
          setDeniedReason("You do not have administrator privileges.");
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        if (userData.status === 'pending') {
          await auth.signOut();
          setDeniedReason("Your administrator account is pending approval.");
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        if (userData.status === 'blocked') {
          await auth.signOut();
          setDeniedReason("Your access has been revoked.");
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        
        // Success - set loading false, useEffect will redirect when isAdmin becomes true
        setLoading(false);
        return;
      } else {
        await auth.signOut();
        setDeniedReason("Account not found in the system.");
        setAccessDenied(true);
        setLoading(false);
      }

    } catch (err: any) {
      // Show access denied for any authentication error
      setDeniedReason("Invalid credentials or account not found.");
      setAccessDenied(true);
      setLoading(false);
    }
  };

  // Access Denied Screen
  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-red-500/20 shadow-2xl text-center"
        >
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            {deniedReason}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Return to Home
            </button>
            <button
              onClick={() => {
                setAccessDenied(false);
                setEmail('');
                setPassword('');
              }}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-slate-400 transition-all"
            >
              Try Again
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a] relative">
      <div className="absolute top-8 left-8">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Back to Home</span>
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center shadow-lg border border-cyan-500/30 mb-4">
            <Shield className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white uppercase tracking-widest">Admin Portal</h1>
          <p className="text-slate-400 mt-2 text-sm">Secure System Access</p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-cyan-500 ml-1">Admin Email</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hydrosync.com"
                required
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-cyan-500 ml-1">Security Key / Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
              "bg-cyan-600 hover:bg-cyan-500"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              "Secure Login →"
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> TLS Secured Connection
          </p>
        </div>
      </motion.div>
    </div>
  );
}
