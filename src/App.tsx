import { useState, useEffect, createContext, useContext, ReactNode, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User, sendEmailVerification, reload } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { useNotifications } from './hooks/useNotifications';

// Lazy Load Pages for Security & Performance (F12 Console Protection)
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const History = lazy(() => import('./pages/History'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Settings = lazy(() => import('./pages/Settings'));
const ChatBot = lazy(() => import('./pages/ChatBot'));
const CreateAccount = lazy(() => import('./pages/CreateAccount'));
const ConfirmToken = lazy(() => import('./pages/ConfirmToken'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AddDevice = lazy(() => import('./pages/AddDevice'));

// Admin Pages
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminDevices = lazy(() => import('./pages/admin/Devices'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminCharts = lazy(() => import('./pages/admin/Charts'));
const AdminLog = lazy(() => import('./pages/admin/Log'));
const AdminAlerts = lazy(() => import('./pages/admin/Alerts'));
const AdminDocumentation = lazy(() => import('./pages/admin/Documentation'));

// Context
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuperuser: false,
});

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  // Initialize global notifications
  useNotifications(user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setEmailVerified(firebaseUser.emailVerified);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile({ uid: firebaseUser.uid, ...userDoc.data() } as UserProfile);
          } else {
            setProfile(null);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setProfile(null);
        }
      } else {
        setProfile(null);
        setEmailVerified(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Periodically check email verification status for unverified users
  useEffect(() => {
    if (!user || user.emailVerified) return;
    
    const interval = setInterval(async () => {
      try {
        await reload(user);
        if (user.emailVerified) {
          setEmailVerified(true);
          // Update profile status if needed
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().status === 'pending') {
            // User verified email - they can now proceed to token confirmation
          }
        }
      } catch (error) {
        console.error("Error reloading user:", error);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [user]);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superuser';
  const isSuperuser = profile?.role === 'superuser';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isSuperuser }}>
      <Router>
        <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-cyan-500/30">
          {/* Email Verification Banner */}
          {user && !user.emailVerified && (
            <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-2 flex items-center justify-between gap-4 sticky top-0 z-[60] backdrop-blur-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Email not verified. Check your inbox.</p>
              </div>
              <button 
                onClick={() => sendEmailVerification(user)}
                className="text-[10px] font-bold text-white bg-orange-500 px-3 py-1 rounded-full uppercase tracking-widest hover:bg-orange-400 transition-colors"
              >
                Resend Verification
              </button>
            </div>
          )}
          {/* Email Verified Success Banner */}
          {user && user.emailVerified && profile?.status === 'pending' && (
            <div className="bg-green-500/10 border-b border-green-500/20 px-6 py-2 flex items-center justify-between gap-4 sticky top-0 z-[60] backdrop-blur-md">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Email verified! Please confirm your device token to activate your account.</p>
              </div>
              <button 
                onClick={() => window.location.href = '/confirm-token'}
                className="text-[10px] font-bold text-white bg-green-500 px-3 py-1 rounded-full uppercase tracking-widest hover:bg-green-400 transition-colors"
              >
                Enter Token
              </button>
            </div>
          )}
          <Suspense fallback={<LoadingScreen />}>
            <AnimatePresence mode="wait">
              <Routes>
                {/* Public Website */}
                <Route path="/" element={<LandingPage />} />
                
                {/* Auth Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/create-account" element={<CreateAccount />} />
                <Route path="/confirm-token" element={<ConfirmToken />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/access-denied" element={<AccessDenied />} />
                <Route path="/add-device" element={<AddDevice />} />
                
                {/* Secure Admin Entry Link */}
                <Route path="/setup_Adminhydro" element={<AdminLogin />} />

                {/* User App Routes (Hidden from Landing Page, accessible via direct link/APK) */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute loading={loading} user={user}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/history"
                  element={
                    <ProtectedRoute loading={loading} user={user}>
                      <History />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/alerts"
                  element={
                    <ProtectedRoute loading={loading} user={user}>
                      <Alerts />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute loading={loading} user={user}>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chatbot"
                  element={
                    <ProtectedRoute loading={loading} user={user}>
                      <ChatBot />
                    </ProtectedRoute>
                  }
                />

                {/* Admin Portal Routes */}
                <Route
                  path="/admin"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminDashboard />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/devices"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminDevices />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminUsers />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/charts"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminCharts />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/log"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminLog />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/alerts"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminAlerts />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/docs"
                  element={
                    <AdminRoute loading={loading} isAdmin={isAdmin} user={user}>
                      <AdminDocumentation />
                    </AdminRoute>
                  }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ loading, user, children }: { loading: boolean; user: User | null; children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();
  
  // Show loading while checking auth state
  if (loading) return <LoadingScreen />;
  
  // If no user, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Check if user is blocked
  if (profile?.status === 'blocked') {
    return <Navigate to="/access-denied" state={{ error: "Your account has been blocked." }} replace />;
  }
  
  // Allow pending users to access - they'll see verification/token banners
  return <>{children}</>;
}

function AdminRoute({ loading, isAdmin, user, children }: { loading: boolean; isAdmin: boolean; user: User | null; children: ReactNode }) {
  const location = useLocation();
  
  // Show loading while checking auth state
  if (loading) return <LoadingScreen />;
  
  // If no user or not admin, redirect to admin login
  if (!user || !isAdmin) {
    // Save the attempted URL for redirect after login
    return <Navigate to="/admin-login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full"
      />
      <p className="text-slate-400 font-medium animate-pulse">HydroSync is loading...</p>
    </div>
  );
}
