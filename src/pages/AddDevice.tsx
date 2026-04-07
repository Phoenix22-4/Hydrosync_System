// HydroSync — src/pages/AddDevice.tsx
// Real flow:
//   Step 1 — User types Device ID (e.g. HOME_01) → we check Firestore 'devices' collection
//             to verify the device exists and is not yet claimed.
//   Step 2 — System displays the permanent 32-character device token.
//             User copies the token to their clipboard.
//   Step 3 — User pastes the token they copied. We verify it against Firestore
//             device record. On match → device is assigned to this user.
//   Step 4 — Success screen. Navigate to /dashboard.

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Loader2,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Key,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

type Step = 'device-id' | 'send-token' | 'enter-token' | 'success';

interface VerifiedDevice {
  firestoreId: string;   // Firestore document ID
  deviceId: string;      // e.g. "HYDROSYNC_01"
  name: string;          // e.g. "Josphat's Home"
  permanentToken: string; // 32-character permanent token from Firestore
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

function validateDeviceIdFormat(id: string): string | null {
  const t = id.trim().toUpperCase();
  if (!t) return 'Device ID is required.';
  if (!/^[A-Z]{2,10}_[0-9]{2,}$/.test(t))
    return 'Format: 2-10 letters, underscore, then 2+ digits. Example: HOME_01, TANK_02, HYDROSYNC_10';
  return null;
}

// ═══════════════════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════════════════

const STEPS: { key: Step; label: string }[] = [
  { key: 'device-id',    label: 'Device' },
  { key: 'send-token',   label: 'Request' },
  { key: 'enter-token',  label: 'Verify' },
  { key: 'success',      label: 'Done' },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 mb-8 w-full max-w-sm">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                i < idx
                  ? 'bg-green-500/20 border-green-500 text-green-400'
                  : i === idx
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-600'
              )}
            >
              {i < idx ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-widest',
                i === idx ? 'text-cyan-400' : i < idx ? 'text-green-400' : 'text-slate-600'
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 mx-1 mb-4 rounded transition-all duration-500',
                i < idx ? 'bg-green-500/50' : 'bg-slate-700'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SHARED UI BITS
// ═══════════════════════════════════════════════════════

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1.5 block">
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  const { hasError, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={cn(
        'w-full bg-[#1a2234] border rounded-xl py-3 px-4 text-white text-sm',
        'focus:outline-none focus:ring-2 transition-all',
        hasError
          ? 'border-red-500/50 focus:ring-red-500/30'
          : 'border-white/5 focus:ring-cyan-500/40',
        className
      )}
    />
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      {msg}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4 text-xs text-slate-400 leading-relaxed">
      {children}
    </div>
  );
}

function PrimaryButton({
  loading,
  disabled,
  onClick,
  children,
}: {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-95 mt-6',
        'flex items-center justify-center gap-2',
        disabled || loading
          ? 'bg-slate-800 border border-white/5 text-slate-600 cursor-not-allowed'
          : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-lg shadow-cyan-500/20 cursor-pointer'
      )}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// STEP 1 — Enter Device ID
// ═══════════════════════════════════════════════════════

interface Step1Props {
  onNext: (deviceId: string, firestoreId: string, name: string, permanentToken: string) => void;
}

function Step1EnterDeviceId({ onNext }: Step1Props) {
  const [deviceId, setDeviceId] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const { user } = useAuth();

  const handleNext = useCallback(async () => {
    const formatted = deviceId.trim().toUpperCase();
    const fmtErr = validateDeviceIdFormat(formatted);
    if (fmtErr) { setError(fmtErr); return; }

    setLoading(true);
    setError(null);

    try {
      // 1. Check device exists in Firestore 'devices' collection
      const q = query(
        collection(db, 'devices'),
        where('device_id', '==', formatted)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('Device not found. Check your Device ID and try again. Contact support if the issue persists.');
        return;
      }

      const deviceDoc = snap.docs[0];
      const data = deviceDoc.data();

      // 2. Check it's not already claimed by someone else
      if (data.assigned_to_user && data.assigned_to_user !== user?.uid) {
        setError('This device is already linked to another account. Contact support if you believe this is an error.');
        return;
      }

      // 3. Check it's not already claimed by THIS user
      if (data.assigned_to_user === user?.uid) {
        setError('This device is already linked to your account.');
        return;
      }

      // Pass the device's permanent token from Firestore
      const permanentToken = data.token; // 32-character permanent token
      onNext(formatted, deviceDoc.id, data.name || formatted, permanentToken);
    } catch (err) {
      console.error(err);
      setError('Failed to verify device. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [deviceId, onNext, user]);

  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full"
    >
      <div className="w-14 h-14 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mb-5">
        <Smartphone className="w-7 h-7 text-cyan-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Add a Device</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">
        Enter the Device ID printed on your HydroSync controller unit.
        It starts with <span className="text-cyan-400 font-mono font-semibold">HS_</span> followed by your unit number.
      </p>

      <div className="mb-4">
        <FieldLabel>Device ID</FieldLabel>
        <FieldInput
          type="text"
          value={deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleNext()}
          placeholder="e.g. HOME_01, TANK_02"
          hasError={!!error}
          maxLength={14}
          spellCheck={false}
          autoFocus
          style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
        />
        {error && <ErrorMsg msg={error} />}
        {!error && (
          <p className="text-[11px] text-slate-600 mt-2 ml-1">
            Found on the sticker on the bottom of your HydroSync unit.
          </p>
        )}
      </div>

      <InfoBox>
        <span className="text-yellow-400 font-semibold">⚡ Before you continue:</span> Make sure your HydroSync
        unit is powered on and connected to the internet. The admin must have pre-registered
        your device ID before you can add it here.
      </InfoBox>

      <PrimaryButton
        loading={loading}
        disabled={!deviceId.trim()}
        onClick={handleNext}
      >
        Verify Device →
      </PrimaryButton>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// STEP 2 — Display Token for Copy
// ═══════════════════════════════════════════════════════

interface Step2Props {
  device: VerifiedDevice;
  onTokenSent: () => void;
}

function Step2SendToken({ device, onTokenSent }: Step2Props) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyToken = useCallback(() => {
    navigator.clipboard.writeText(device.permanentToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [device.permanentToken]);

  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full"
    >
      <div className="w-14 h-14 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mb-5">
        <ShieldCheck className="w-7 h-7 text-cyan-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Verify Your Device</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">
        Copy your unique device token below. This token links you to{' '}
        <span className="text-cyan-400 font-mono font-semibold">{device.deviceId}</span>.
      </p>

      {/* Device info display */}
      <div className="bg-[#1a2234] border border-white/5 rounded-xl p-4 mb-5 space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Device ID</span>
          <span className="text-cyan-400 font-mono font-semibold">{device.deviceId}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Device Name</span>
          <span className="text-white font-semibold">{device.name}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Your Email</span>
          <span className="text-white font-semibold">{maskEmail(user?.email || '')}</span>
        </div>
        
        {/* Token Display */}
        <div className="pt-3 border-t border-white/5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-500">Your Device Token</span>
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
              {device.permanentToken}
            </code>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            This is your unique 32-character token. Click "Copy" to copy it to your clipboard.
          </p>
        </div>
      </div>

      <InfoBox>
        <span className="text-cyan-400 font-semibold">Next Step:</span> Copy your token above, then click "Enter Token" below to paste it and complete device linking.
      </InfoBox>

      <PrimaryButton onClick={onTokenSent}>
        I have copied my token — Enter it →
      </PrimaryButton>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// STEP 3 — Enter Token
// ═══════════════════════════════════════════════════════

interface Step3Props {
  device: VerifiedDevice;
  onSuccess: () => void;
}

function Step3EnterToken({ device, onSuccess }: Step3Props) {
  const { user } = useAuth();
  const [token, setToken]         = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Format display: no dash, just show full token
  const displayToken = token;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip non-alphanumeric chars, keep up to 32 chars
    const raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 32);
    setToken(raw);
    setError(null);
  };

  const handleVerify = useCallback(async () => {
    if (token.length < 32) { setError('Token must be 32 characters.'); return; }
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Verify against the device's permanent token stored in Firestore
      const deviceRef = doc(db, 'devices', device.firestoreId);
      const deviceSnap = await getDoc(deviceRef);

      if (!deviceSnap.exists()) {
        setError('Device not found. Please try again.');
        return;
      }

      const deviceData = deviceSnap.data();
      
      // Check if the entered token matches the device's permanent token (case-insensitive)
      const storedToken = (deviceData.token || '').toString().toUpperCase().trim();
      const enteredToken = token.toUpperCase().trim();
      
      if (storedToken !== enteredToken) {
        setError('Incorrect token. Please check the token displayed on your device screen and try again.');
        return;
      }

      // Check if device is already claimed by someone else
      if (deviceData.assigned_to_user && deviceData.assigned_to_user !== user.uid) {
        setError('This device is already linked to another account.');
        return;
      }

      // Token is valid - assign device to this user
      await updateDoc(deviceRef, {
        assigned_to_user: user.uid,
        user_name: user.displayName || user.email?.split('@')[0] || 'User',
        status: 'active',
        linked_at: serverTimestamp(),
      });

      // Log the action
      await addDoc(collection(db, 'activity_log'), {
        timestamp: serverTimestamp(),
        device_id: device.deviceId,
        user_id: user.uid,
        action: `Device ${device.deviceId} linked to account`,
        performed_by: user.email || 'user',
      });

      onSuccess();
    } catch (err) {
      console.error(err);
      setError('Verification failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token, user, device, onSuccess]);

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full"
    >
      <div className="w-14 h-14 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mb-5">
        <ShieldCheck className="w-7 h-7 text-cyan-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Enter Your Token</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">
        Paste the token displayed on your device screen below to verify ownership of{' '}
        <span className="text-cyan-400 font-mono font-semibold">{device.deviceId}</span>.
      </p>

      <div className="mb-4">
        <FieldLabel>Verification Token</FieldLabel>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={displayToken}
            onChange={handleChange}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            placeholder="Paste your 32-char token here"
            autoFocus
            className={cn(
              'w-full bg-[#1a2234] border rounded-xl py-4 px-4 text-white text-sm text-center',
              'focus:outline-none focus:ring-2 transition-all pr-12',
              'font-mono tracking-[0.1em]',
              error
                ? 'border-red-500/50 focus:ring-red-500/30'
                : 'border-white/5 focus:ring-cyan-500/40'
            )}
            maxLength={40}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {error && <ErrorMsg msg={error} />}
        {!error && (
          <p className="text-[11px] text-slate-600 mt-2 ml-1">
            Tokens are permanent for each device. Enter the exact 32-character token shown on your device.
          </p>
        )}
      </div>

      <PrimaryButton
        loading={loading}
        disabled={token.length < 32}
        onClick={handleVerify}
      >
        Verify & Add Device →
      </PrimaryButton>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// STEP 4 — Success
// ═══════════════════════════════════════════════════════

function Step4Success({ device, onDone }: { device: VerifiedDevice; onDone: () => void }) {
  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full text-center flex flex-col items-center"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 bg-green-500/15 border-2 border-green-500/40 rounded-full flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-green-400" />
      </motion.div>

      <h2 className="text-2xl font-bold text-white mb-2">Device Added!</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-8">
        <span className="text-cyan-400 font-mono font-semibold">{device.deviceId}</span> —{' '}
        {device.name} — is now linked to your HydroSync account.
      </p>

      <div className="w-full bg-[#1a2234] border border-white/5 rounded-xl p-4 mb-6 space-y-2 text-left">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Device ID</span>
          <span className="text-cyan-400 font-mono font-semibold">{device.deviceId}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Name</span>
          <span className="text-white font-semibold">{device.name}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Status</span>
          <span className="text-green-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            Linked
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
      >
        Go to Dashboard →
      </button>

      <p className="text-xs text-slate-600 mt-4 leading-relaxed">
        You can rename your device and set tank capacities in{' '}
        <span className="text-cyan-500">Settings → Device Info</span>.
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════

export default function AddDevice() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep]               = useState<Step>('device-id');
  const [device, setDevice]           = useState<VerifiedDevice | null>(null);

  const handleDeviceVerified = useCallback(
    (deviceId: string, firestoreId: string, name: string, permanentToken: string) => {
      setDevice({ deviceId, firestoreId, name, permanentToken });
      setStep('send-token');
    },
    []
  );

  const handleBack = useCallback(() => {
    if (step === 'device-id')   navigate('/dashboard');
    if (step === 'send-token')  setStep('device-id');
    if (step === 'enter-token') setStep('send-token');
    // No back from success
  }, [step, navigate]);

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 px-5 py-4 flex items-center gap-4">
        {step !== 'success' && (
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-base font-bold text-white leading-none">
            {step === 'device-id'   && 'Add Device'}
            {step === 'send-token'  && 'Request Token'}
            {step === 'enter-token' && 'Verify Token'}
            {step === 'success'     && 'Device Added'}
          </h1>
        </div>
        {/* Secure badge */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5">
          <ShieldCheck className="w-3 h-3" />
          Secure
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center px-5 py-8 max-w-sm mx-auto w-full">
        {step !== 'success' && <StepIndicator current={step} />}

        <div className="w-full bg-[#1e293b] border border-white/10 rounded-2xl p-6 shadow-2xl">
          <AnimatePresence mode="wait">
            {step === 'device-id' && (
              <Step1EnterDeviceId key="s1" onNext={handleDeviceVerified} />
            )}
            {step === 'send-token' && device && (
              <Step2SendToken
                key="s2"
                device={device}
                onTokenSent={() => setStep('enter-token')}
              />
            )}
            {step === 'enter-token' && device && (
              <Step3EnterToken
                key="s3"
                device={device}
                onSuccess={() => setStep('success')}
              />
            )}
            {step === 'success' && device && (
              <Step4Success
                key="s4"
                device={device}
                onDone={() => navigate('/dashboard')}
              />
            )}
          </AnimatePresence>
        </div>

        {step !== 'success' && (
          <p className="text-[11px] text-slate-600 text-center mt-6 leading-relaxed px-2">
            🔒 Tokens are permanent for each device. Keep your token secure and do not share it.
          </p>
        )}
      </div>
    </div>
  );
}