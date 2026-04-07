import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { motion } from 'motion/react';
import { Droplets, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user exists in Firestore
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (!userDoc.exists()) {
        await auth.signOut();
        setError("Account not found. Please create an account first.");
        setLoading(false);
        return;
      }
      
      const userData = userDoc.data();
      if (userData.status === 'blocked') {
        await auth.signOut();
        setError("Your account has been blocked. Contact support.");
        setLoading(false);
        return;
      }
      
      // For pending users, still allow login but they'll see verification banner
      // For active users, proceed normally
      setLoading(false);
      navigate('/dashboard');
    } catch (err: any) {
      console.error("Login error:", err);
      // Handle specific Firebase auth errors
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError("Invalid email or password. Please try again.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else {
        setError(err.message || "Failed to sign in. Please check your credentials.");
      }
      setLoading(false);
    }
  };

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
        className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4">
            <img src="/icon.png" alt="HydroSync Icon" className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">HydroSync</h1>
          <p className="text-slate-400 mt-2 font-medium">Smart Water Management</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400 leading-relaxed">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-cyan-500 ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="josphat@email.com"
                required
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-sm font-semibold text-cyan-500">Password</label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs font-medium text-slate-500 hover:text-cyan-400 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
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
              "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Signing In...</span>
              </div>
            ) : (
              "Sign In →"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-4">
          <p className="text-slate-400 text-sm">
            Don't have an account?{" "}
            <Link to="/create-account" className="text-cyan-400 font-bold hover:underline underline-offset-4">
              Create Account
            </Link>
          </p>
        </div>
      </motion.div>

      <p className="mt-8 text-slate-600 text-xs font-medium uppercase tracking-widest">
        HydroSync v1.0.0 • Secure Serverless Platform
      </p>
    </div>
  );
}
