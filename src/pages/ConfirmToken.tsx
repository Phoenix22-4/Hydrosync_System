import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { motion } from 'motion/react';
import { Key, AlertCircle, Loader2, CheckCircle2, ArrowLeft, Copy } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ConfirmToken() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get data from navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.token) {
      setDeviceToken(state.token);
    }
    if (state?.deviceId) {
      setDeviceId(state.deviceId);
    }
  }, [location]);

  useEffect(() => {
    // User must be logged in
    if (!auth.currentUser) {
      navigate('/login');
      return;
    }
    
    // Fetch device info if not provided in state
    const fetchDeviceInfo = async () => {
      if (!deviceId && auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const dId = userData.device_ids?.[0];
          if (dId) {
            setDeviceId(dId);
            const deviceRef = doc(db, 'devices', dId);
            const deviceSnap = await getDoc(deviceRef);
            if (deviceSnap.exists()) {
              setDeviceToken(deviceSnap.data().token);
            }
          }
        }
      }
    };
    fetchDeviceInfo();
  }, [navigate, deviceId]);

  const copyToken = () => {
    if (deviceToken) {
      navigator.clipboard.writeText(deviceToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskEmail = (email: string) => {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    return `${user.slice(0, 2)}***@${domain}`;
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1. Get user profile to find the device ID
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        setError("User profile not found.");
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const dId = deviceId || userData.device_ids?.[0];

      if (!dId) {
        setError("No device linked to this account. Please contact support.");
        setLoading(false);
        return;
      }

      // 2. Verify token against device record
      const deviceRef = doc(db, 'devices', dId);
      const deviceSnap = await getDoc(deviceRef);

      if (!deviceSnap.exists()) {
        setError(`Device record for ${dId} not found.`);
        setLoading(false);
        return;
      }

      const deviceData = deviceSnap.data();
      
      // Case-insensitive token comparison with proper null handling
      const storedToken = (deviceData.token || '').toString().toUpperCase().trim();
      const enteredToken = token.toUpperCase().trim();
      
      if (storedToken !== enteredToken) {
        setError("Incorrect token. Please copy the token displayed above and paste it here.");
        setLoading(false);
        return;
      }

      // 3. Update device and user status
      await updateDoc(deviceRef, {
        status: 'active'
      });

      await updateDoc(userRef, {
        status: 'active'
      });

      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      console.error("Token confirmation error:", err);
      setError(err.message || "Failed to confirm token.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
          <h2 className="text-2xl font-bold text-white mb-2">Device Activated!</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Your device is now linked and active. Redirecting you to the dashboard...
          </p>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 2 }}
              className="h-full bg-cyan-500"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl"
      >
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors mb-8 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4">
            <Key className="w-8 h-8 text-cyan-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white text-center">Confirm Device Ownership</h1>
          <p className="text-slate-400 mt-2 text-sm text-center leading-relaxed">
            Copy your device token below and paste it to verify ownership.
          </p>
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

        {/* Token Display Section */}
        {deviceId && deviceToken && (
          <div className="bg-[#1a2234] border border-white/5 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Device ID</span>
              <span className="text-cyan-400 font-mono font-semibold">{deviceId}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Your Email</span>
              <span className="text-white font-semibold">{auth.currentUser?.email ? maskEmail(auth.currentUser.email) : 'N/A'}</span>
            </div>
            
            {/* Token Display */}
            <div className="pt-3 border-t border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-500">Your Device Token (32 characters)</span>
                <button
                  onClick={copyToken}
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-[#0f172a] border border-cyan-500/20 rounded-lg p-3">
                <code className="text-xs font-mono text-cyan-400 break-all leading-relaxed">
                  {deviceToken}
                </code>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Copy this token and paste it below to verify your device ownership.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-cyan-500 uppercase tracking-wider ml-1">Device Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => {
                // Strip non-alphanumeric chars, keep up to 32 chars
                const raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 32);
                setToken(raw);
              }}
              placeholder="Paste your 32-character token here"
              required
              maxLength={40}
              className="w-full bg-[#1a2234] border border-white/5 rounded-xl py-4 px-4 text-white text-center text-sm font-mono tracking-widest placeholder:text-slate-600 placeholder:text-sm placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            />
            <p className="text-[11px] text-slate-600 mt-2 ml-1">
              Tokens are permanent for each device. Enter the exact 32-character token shown above.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] disabled:opacity-50",
              "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </div>
            ) : (
              "Verify Token & Activate →"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-slate-500 text-xs leading-relaxed">
            Need help? Contact support at <span className="text-cyan-500/80">support@hydrosync.com</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
