import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface TankSceneProps {
  ohLevel: number; // 0-100
  ugLevel: number; // 0-100
  pumpOn: boolean;
  ohCap?: number;
  ugCap?: number;
}

export default function TankScene({ ohLevel, ugLevel, pumpOn, ohCap, ugCap }: TankSceneProps) {
  const OH_H = 148;
  const UG_H = 88;
  const OH_TOP = 21;
  const UG_TOP = 211;

  // Ensure valid numbers with fallbacks - prevent undefined SVG attributes
  const safeOhLevel = Math.max(0, Math.min(100, Number(ohLevel) || 0));
  const safeUgLevel = Math.max(0, Math.min(100, Number(ugLevel) || 0));

  const ohWaterH = Math.max(0, (safeOhLevel / 100) * OH_H);
  const ohWaterY = OH_TOP + OH_H - ohWaterH;

  const ugWaterH = Math.max(0, (safeUgLevel / 100) * UG_H);
  const ugWaterY = UG_TOP + UG_H - ugWaterH;

  const ohLitres = ohCap ? Math.round((safeOhLevel / 100) * ohCap) : null;
  const ugLitres = ugCap ? Math.round((safeUgLevel / 100) * ugCap) : null;

  // Ensure no undefined/NaN values for SVG attributes - use fixed fallbacks
  const safeOhWaterY = isFinite(ohWaterY) ? ohWaterY : 169;
  const safeOhWaterH = isFinite(ohWaterH) ? ohWaterH : 0;
  const safeUgWaterY = isFinite(ugWaterY) ? ugWaterY : 299;
  const safeUgWaterH = isFinite(ugWaterH) ? ugWaterH : 0;

  return (
    <div className="w-full aspect-[380/320] bg-[#1e293b] rounded-t-2xl overflow-hidden border-b border-white/5">
      <svg viewBox="0 0 380 320" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wgOH" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity=".9" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity=".95" />
          </linearGradient>
          <linearGradient id="wgUG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity=".85" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity=".95" />
          </linearGradient>
          <linearGradient id="gGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
          <clipPath id="cOH">
            <rect x="31" y="21" width="98" height="148" rx="10" />
          </clipPath>
          <clipPath id="cUG">
            <rect x="251" y="211" width="98" height="88" rx="8" />
          </clipPath>
        </defs>

        {/* Ground */}
        <rect x="0" y="195" width="380" height="125" fill="url(#gGrad)" />
        <circle cx="40" cy="215" r="2" fill="#78350f" opacity=".5" />
        <circle cx="130" cy="210" r="2" fill="#78350f" opacity=".4" />
        <circle cx="200" cy="220" r="1.5" fill="#78350f" opacity=".5" />
        <circle cx="300" cy="215" r="2" fill="#78350f" opacity=".4" />
        <text x="190" y="310" textAnchor="middle" fill="#92400e" fontSize="10" opacity=".7" className="font-bold uppercase tracking-widest">Ground Level</text>

        {/* Stand for OH Tank */}
        <rect x="52" y="168" width="6" height="28" fill="#475569" rx="2" />
        <rect x="100" y="168" width="6" height="28" fill="#475569" rx="2" />
        <rect x="46" y="178" width="68" height="4" fill="#334155" rx="2" />

        {/* Overhead Tank */}
        <rect x="30" y="20" width="100" height="150" rx="10" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <g clipPath="url(#cOH)">
          <motion.rect
            x="31"
            y={safeOhWaterY}
            width="98"
            height={safeOhWaterH}
            fill="url(#wgOH)"
            initial={false}
            animate={{ y: safeOhWaterY, height: safeOhWaterH }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
          <motion.path
            initial={false}
            animate={{
              d: [
                `M31,${safeOhWaterY} Q50,${safeOhWaterY - 4} 69,${safeOhWaterY} Q88,${safeOhWaterY + 4} 107,${safeOhWaterY} Q126,${safeOhWaterY - 3} 129,${safeOhWaterY} L129,${OH_TOP + OH_H} L31,${OH_TOP + OH_H} Z`,
                `M31,${safeOhWaterY + 2} Q50,${safeOhWaterY - 2} 69,${safeOhWaterY + 2} Q88,${safeOhWaterY + 6} 107,${safeOhWaterY + 2} Q126,${safeOhWaterY - 1} 129,${safeOhWaterY + 2} L129,${OH_TOP + OH_H} L31,${OH_TOP + OH_H} Z`,
                `M31,${safeOhWaterY} Q50,${safeOhWaterY - 4} 69,${safeOhWaterY} Q88,${safeOhWaterY + 4} 107,${safeOhWaterY} Q126,${safeOhWaterY - 3} 129,${safeOhWaterY} L129,${OH_TOP + OH_H} L31,${OH_TOP + OH_H} Z`
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            fill="url(#wgOH)" opacity=".8"
          />
        </g>
        <rect x="30" y="20" width="100" height="150" rx="10" fill="none" stroke="#334155" strokeWidth="1.5" />
        <rect x="36" y="28" width="12" height="60" rx="6" fill="white" opacity=".05" />
        <text x="80" y="14" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing=".05em">OVERHEAD</text>
        <text x="80" y="100" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{safeOhLevel}%</text>
        <text x="80" y="118" textAnchor="middle" fill="#93c5fd" fontSize="9">{ohLitres !== null ? `${ohLitres.toLocaleString()} L` : '— L'}</text>

        {/* Pump */}
        <rect x="155" y="175" width="70" height="42" rx="8" fill="#1e293b" stroke={pumpOn ? "#3b82f6" : "#475569"} strokeWidth="1.5" />
        <circle cx="190" cy="196" r="12" fill="#0f172a" stroke="#334155" strokeWidth="1" />
        <motion.g
          animate={pumpOn ? { rotate: 360 } : { rotate: 0 }}
          transition={pumpOn ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0 }}
          style={{ transformOrigin: "190px 196px" }}
        >
          <path d="M190,186 A10,10 0 0,1 200,196" stroke="#3b82f6" strokeWidth="2" fill="none" />
          <path d="M190,206 A10,10 0 0,1 180,196" stroke="#3b82f6" strokeWidth="2" fill="none" />
        </motion.g>
        <circle cx="190" cy="196" r="3" fill="#3b82f6" />
        <text x="190" y="228" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">{pumpOn ? "PUMP ON" : "PUMP OFF"}</text>

        {/* Pipes */}
        <rect x="87" y="185" width="68" height="12" rx="4" fill="#334155" stroke="#475569" strokeWidth=".5" />
        {pumpOn && (
          <motion.rect
            animate={{ opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            x="88" y="186" width="66" height="10" rx="3" fill="#3b82f6" opacity=".6"
          />
        )}

        {/* Underground Tank */}
        <rect x="240" y="200" width="120" height="15" fill="#92400e" opacity=".7" rx="3" />
        <rect x="250" y="210" width="100" height="90" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
        <g clipPath="url(#cUG)">
          <motion.rect
            x="251"
            y={safeUgWaterY}
            width="98"
            height={safeUgWaterH}
            fill="url(#wgUG)"
            initial={false}
            animate={{ y: safeUgWaterY, height: safeUgWaterH }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
          <motion.path
            initial={false}
            animate={{
              d: [
                `M251,${safeUgWaterY} Q280,${safeUgWaterY - 4} 300,${safeUgWaterY} Q325,${safeUgWaterY + 4} 349,${safeUgWaterY} L349,${UG_TOP + UG_H} L251,${UG_TOP + UG_H} Z`,
                `M251,${safeUgWaterY + 2} Q280,${safeUgWaterY - 2} 300,${safeUgWaterY + 2} Q325,${safeUgWaterY + 6} 349,${safeUgWaterY + 2} L349,${UG_TOP + UG_H} L251,${UG_TOP + UG_H} Z`,
                `M251,${safeUgWaterY} Q280,${safeUgWaterY - 4} 300,${safeUgWaterY} Q325,${safeUgWaterY + 4} 349,${safeUgWaterY} L349,${UG_TOP + UG_H} L251,${UG_TOP + UG_H} Z`
              ]
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            fill="url(#wgUG)" opacity=".8"
          />
        </g>
        <rect x="250" y="210" width="100" height="90" rx="8" fill="none" stroke="#475569" strokeWidth="1.5" />
        <text x="300" y="206" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing=".05em">UNDERGROUND</text>
        <text x="300" y="255" textAnchor="middle" fill="white" fontSize="15" fontWeight="700">{safeUgLevel}%</text>
        <text x="300" y="268" textAnchor="middle" fill="#93c5fd" fontSize="9">{ugLitres !== null ? `${ugLitres.toLocaleString()} L` : '— L'}</text>

        {/* Suction Pipe */}
        <rect x="225" y="189" width="25" height="12" rx="4" fill="#334155" stroke="#475569" strokeWidth=".5" />
        <rect x="225" y="196" width="12" height="55" rx="4" fill="#334155" stroke="#475569" strokeWidth=".5" />
        {pumpOn && (
          <motion.rect
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
            x="226" y="197" width="10" height="53" rx="3" fill="#1d4ed8" opacity=".5"
          />
        )}
      </svg>
    </div>
  );
}
