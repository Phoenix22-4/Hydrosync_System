import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { motion } from 'motion/react';
import { Droplets, User, Mail, Lock, Smartphone, AlertCircle, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';

export default function CreateAccount() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    deviceId: '',
  });
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // 1. Check if Device ID exists and is unassigned (if provided)
      let deviceToken: string | null = null;
      if (formData.deviceId.trim()) {
        const deviceRef = doc(db, 'devices', formData.deviceId.toUpperCase());
        const deviceSnap = await getDoc(deviceRef);

        if (!deviceSnap.exists()) {
          setError(`Device ID "${formData.deviceId}" not found. Please check the ID on your controller.`);
          setLoading(false);
          return;
        }

        const deviceData = deviceSnap.data();
        if (deviceData.status !== 'unassigned') {
          setError(`Device "${formData.deviceId}" is already registered to another account.`);
          setLoading(false);
          return;
        }
        
        // Get existing token or generate new one (32 char uppercase)
        const generateNewToken = () => Math.random().toString(36).substring(2, 18).toUpperCase() + Math.random().toString(36).substring(2, 18).toUpperCase();
        deviceToken = deviceData.token || generateNewToken();
      }

      // 2. Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: formData.name });

      // 2.5 Send Verification Email
      await sendEmailVerification(user);

      // 3. Create User Profile in Firestore (status: pending)
      await setDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        email: formData.email,
        status: 'pending',
        created_at: serverTimestamp(),
        device_ids: formData.deviceId.trim() ? [formData.deviceId.toUpperCase()] : [],
        role: 'user'
      });

      // Create admin alert for new user registration
      try {
        await addDoc(collection(db, 'alerts'), {
          type: 'new_user',
          title: 'New User Registered',
          message: `${formData.name} (${formData.email}) just created an account`,
          user_id: user.uid,
          user_email: formData.email,
          user_name: formData.name,
          read: false,
          triggered_at: serverTimestamp()
        });
      } catch (alertErr) {
        console.log("Could not create alert:", alertErr);
      }

      // 4. Update device with generated token and assign to user
      if (formData.deviceId.trim() && deviceToken) {
        const deviceRef = doc(db, 'devices', formData.deviceId.toUpperCase());
        await updateDoc(deviceRef, {
          token: deviceToken,
          assigned_to_user: user.uid,
          user_name: formData.name,
          status: 'pending_confirmation'
        });
        
        setGeneratedToken(deviceToken);
        
        // Log the token email (simulated - in production would use Cloud Functions)
        console.log(`========================================`);
        console.log(`DEVICE TOKEN EMAIL (Simulated)`);
        console.log(`To: ${formData.email}`);
        console.log(`Device: ${formData.deviceId.toUpperCase()}`);
        console.log(`Token: ${deviceToken}`);
        console.log(`========================================`);
      }
      
      // Store device ID for token page
      if (formData.deviceId.trim()) {
        setDeviceId(formData.deviceId.toUpperCase());
      }
      
      // Move to Step 2 - Token confirmation page
      setStep(2);
    } catch (err: any) {
      console.error("Registration error:", err);
      // Handle specific errors
      if (err.code === 'auth/email-already-in-use') {
        setError("An account with this email already exists. Please login instead.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password is too weak. Please use at least 6 characters.");
      } else if (err.code === 'permission-denied') {
        setError("Permission denied. Please try again or contact support.");
      } else {
        setError(err.message || "Failed to create account.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl text-center"
        >
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
          <p className="text-slate-400 mb-4 leading-relaxed">
            A verification email has been sent to <span className="text-cyan-400 font-semibold">{formData.email}</span>.
          </p>
          <p className="text-slate-500 text-sm mb-6">
            Please verify your email, then enter your device token below.
          </p>
          
          {generatedToken && deviceId && (
            <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
              <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest mb-2">Your Device Token</p>
              <p className="font-mono text-sm text-white break-all select-all">{generatedToken}</p>
              <p className="text-[10px] text-slate-500 mt-2">
                This token was sent to your email. Enter it below to confirm device ownership.
              </p>
            </div>
          )}
          
          <button
            onClick={() => navigate('/confirm-token', { state: { deviceId, token: generatedToken, email: formData.email } })}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98]"
          >
            Continue to Token Confirmation →
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a] relative">
      <div className="absolute top-8 left-8">
        <button 
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Back to Login</span>
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4">
            <img src="/icon.png" alt="HydroSync Icon" className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Create Account</h1>
          <p className="text-slate-400 mt-1 text-sm">Join the HydroSync network</p>
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

        <form onSubmit={handleStep1} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Full Name</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="Josphat Kamau"
                required
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="josphat@email.com"
                required
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
                <input
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Confirm</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
                <input
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Device ID (Optional for Admin)</label>
            <div className="relative group">
              <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              <input
                name="deviceId"
                type="text"
                value={formData.deviceId}
                onChange={handleChange}
                placeholder="HOME_01"
                className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 uppercase transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-4 mt-4 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] disabled:opacity-50",
              "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating...</span>
              </div>
            ) : (
              "Create Account →"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-slate-400 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-cyan-400 font-bold hover:underline underline-offset-4">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
