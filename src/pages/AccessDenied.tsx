import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessage = location.state?.error || "You do not have administrative privileges. Admin roles must be manually assigned by the system owner via the Firebase Console.";

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#1e293b] rounded-3xl border border-red-500/20 p-8 shadow-2xl flex flex-col items-center"
      >
        <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-8">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          {errorMessage}
        </p>
        <button 
          onClick={() => navigate('/')} 
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all flex justify-center items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" /> Return to Dashboard
        </button>
      </motion.div>
    </div>
  );
}
