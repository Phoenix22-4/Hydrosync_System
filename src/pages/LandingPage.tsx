import { motion, AnimatePresence } from 'motion/react';
import { 
  Droplets, 
  ShieldCheck, 
  Zap, 
  Smartphone, 
  ArrowRight, 
  Menu, 
  X, 
  Cpu, 
  Wifi, 
  Battery, 
  Activity, 
  Bot, 
  Mail, 
  Github, 
  Linkedin,
  Users,
  CheckCircle2,
  LogIn
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { cn } from '../lib/utils';
import FloatingChatBot from '../components/FloatingChatBot';
import SystemArchitectureGraph from '../components/SystemArchitectureGraph';

export default function LandingPage() {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('hardware');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleGetStarted = () => {
    const element = document.getElementById('get-started-steps');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleLogin = () => {
    const isNativeApp = (window as any).Capacitor !== undefined ||
                        (window as any).Android !== undefined ||
                        !/^https?:\/\//.test(document.URL);

    if (isNativeApp) {
      navigate('/login');
      return;
    }

    if (!navigator.onLine) {
      navigate('/access-denied');
      return;
    }

    const appScheme = 'hydrosync://login';
    let appOpened = false;

    const markAppOpened = () => {
      appOpened = true;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markAppOpened();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', markAppOpened);
    window.addEventListener('blur', markAppOpened);

    // Attempt to open the native app via deep link.
    window.location.href = appScheme;

    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', markAppOpened);
      window.removeEventListener('blur', markAppOpened);

      if (!appOpened) {
        const downloadSection = document.getElementById('native-app');
        if (downloadSection) {
          downloadSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }, 1600);
  };

  const features = [
    {
      icon: <Cpu className="w-6 h-6" />,
      title: "Dual-Core Intelligence",
      description: "The ESP32-WROOM-32 features a dual-core architecture. Core 0 manages high-speed WiFi/MQTT connectivity, while Core 1 handles real-time sensor logic and safety shutoffs, ensuring zero-latency performance."
    },
    {
      icon: <Wifi className="w-6 h-6" />,
      title: "Zero-Config Provisioning",
      description: "Our proprietary 'HydroSync_Setup' captive portal eliminates hardcoded credentials. Connect your device to any network via your smartphone in seconds."
    },
    {
      icon: <Battery className="w-6 h-6" />,
      title: "Uninterrupted Monitoring",
      description: "Integrated 18650 Li-ion backup with Diode OR-ing circuitry ensures your data keeps flowing even when the grid goes down."
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "Advanced Dry-Run Logic",
      description: "Using ZHT103 current sensing, HydroSync detects pump cavitation instantly, shutting down the system to prevent catastrophic hardware failure."
    },
    {
      icon: <Bot className="w-6 h-6" />,
      title: "AI-Powered Diagnostics",
      description: "Stuck? Our integrated Gemini AI is trained on the entire HydroSync technical stack to provide instant, expert troubleshooting 24/7."
    },
    {
      icon: <Activity className="w-6 h-6" />,
      title: "Real-Time Telemetry",
      description: "Experience sub-second latency with our HiveMQ-powered MQTT bridge, delivering precise tank levels and power metrics to your palm."
    }
  ];

  const hardwareSpecs = [
    { name: "Brain", detail: "ESP32-WROOM-32 (240MHz Dual-Core)" },
    { name: "Interface", detail: "2.8\" TFT Touch + Arduino Mega 2560" },
    { name: "Sensing", detail: "AJ-SR04M Waterproof Ultrasonic (x2)" },
    { name: "Protection", detail: "ZHT103 Galvanically Isolated CT" },
    { name: "Switching", detail: "SSR-40DA Solid State Relay (Zero-Cross)" },
    { name: "Power", detail: "TP4056 + MT3608 + 3000mAh Li-ion" }
  ];

  const team = [
    {
      name: "Josphat Mwamboa",
      role: "Lead IoT & Embedded Engineer",
      bio: "Device creation, PCB design, device testing, firmware, AWS IoT connectivity, and web app programming.",
      image: "https://picsum.photos/seed/josphat/400/400"
    },
    {
      name: "Joy Kihia",
      role: "Finance & Documentation Lead",
      bio: "Leads budgeting, financial analysis, write-ups, and stakeholder presentations.",
      image: "https://picsum.photos/seed/joy/400/400"
    },
    {
      name: "Davis Mochengo",
      role: "Product Design & Embedded Engineer",
      bio: "Designs protective enclosures and contributes to firmware and validation.",
      image: "https://picsum.photos/seed/davis/400/400"
    },
    {
      name: "John Karauni",
      role: "Marketing & Prototyping Lead",
      bio: "Market outreach and supports firmware plus casing print operations.",
      image: "https://picsum.photos/seed/john/400/400"
    },
    {
      name: "Moses Mutuma",
      role: "Marketing & Quality Assurance",
      bio: "Coordinates market feedback and device field testing to ensure quality.",
      image: "https://picsum.photos/seed/moses/400/400"
    }
  ];

  // Offline Detection Component
  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#0f172a] relative">
        <div className="absolute top-8 left-8">
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
          >
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rotate-180" />
            <span className="text-xs font-bold uppercase tracking-widest">Refresh</span>
          </button>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-red-500/20 shadow-2xl text-center"
        >
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Wifi className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Internet Connection</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            HydroSync requires an internet connection to function properly. Please check your connection and try again.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Activity className="w-5 h-5" />
              Retry Connection
            </button>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              Auto-retry when connection is restored
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b1a] text-slate-200 selection:bg-cyan-500/30 overflow-x-hidden relative">
      {/* Dynamic Water Background Overlay */}
      <div className="fixed inset-0 pointer-events-none -z-20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540339832862-4745a9805ad0?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-[0.15] mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1f3d]/95 via-[#050b1a]/98 to-[#0a1f3d]/95" />
      </div>

      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6",
        isScrolled ? "bg-[#0a0f1e]/80 backdrop-blur-xl border-b border-white/5 h-16" : "bg-transparent h-24"
      )}>
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <img src="/icon.png" alt="HydroSync Icon" className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black text-white tracking-tight">HydroSync</span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#overview" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Overview</a>
            <a href="#architecture" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Architecture</a>
            <a href="#details" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">The Solution</a>
            <a href="#economics" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Impact</a>
            <a href="#ai-analysis" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">AI Insight</a>
            <a href="#production" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Roadmap</a>
            <a href="#about" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">About Us</a>
            <button 
              onClick={handleLogin}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Open App</span>
            </button>
          </div>

          {/* Mobile Nav */}
          <div className="md:hidden flex items-center gap-3">
            <select 
              id="mobile-nav" 
              className="bg-[#1e293b] border border-white/10 text-white text-xs rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2 outline-none"
              onChange={(e) => {
                const val = e.target.value;
                if (val === '/setup_Adminhydro') {
                  navigate(val);
                } else {
                  const target = document.getElementById(val.substring(1));
                  if (target) target.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
              <option value="#overview">Overview</option>
              <option value="#architecture">Architecture</option>
              <option value="#details">The Solution</option>
              <option value="#economics">Impact</option>
              <option value="#ai-analysis">AI Insight</option>
              <option value="#production">Roadmap</option>
              <option value="#about">About Us</option>
            </select>
            <button 
              onClick={handleLogin}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="overview" className="pt-40 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-cyan-500/10 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-8"
          >
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">Next-Gen Water Management</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-white mb-8 leading-[1.1] tracking-tight"
          >
            Smart Water Control <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">For Your Modern Home</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            Monitor tank levels, automate your pump, and prevent dry-run damage with our enterprise-grade IoT solution. Secure, reliable, and intelligent.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button 
              onClick={handleGetStarted}
              className="w-full sm:w-auto px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-2xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 group"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <a 
              href="#hardware"
              className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl transition-all"
            >
              View Hardware
            </a>
          </motion.div>
        </div>
      </section>

      {/* Getting Started Steps */}
      <section id="get-started-steps" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 blur-[150px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">
              Start Your <span className="text-cyan-400">HydroSync</span> Journey
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
              Setting up your smart water system is simple. Follow these professional steps to get connected in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-24 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent -z-10" />
            
            {[
              { 
                step: "01", 
                title: "Create Account", 
                desc: "Sign up securely to our cloud platform to manage your devices from anywhere.",
                link: "/create-account",
                btnText: "Join Now",
                icon: <Users className="w-5 h-5" />
              },
              { 
                step: "02", 
                title: "Verify Identity", 
                desc: "Confirm your email to activate enterprise-grade security for your water data.",
                link: "/login",
                btnText: "Verify Status",
                icon: <ShieldCheck className="w-5 h-5" />
              },
              { 
                step: "03", 
                title: "Hardware Sync", 
                desc: "Connect to 'HydroSync_Setup' WiFi to link your hardware to your account.",
                link: "#details",
                btnText: "Setup Guide",
                icon: <Wifi className="w-5 h-5" />
              },
              { 
                step: "04", 
                title: "Live Monitoring", 
                desc: "Access your dashboard to view real-time levels and control your pump.",
                link: "/dashboard",
                btnText: "Go Live",
                icon: <Activity className="w-5 h-5" />
              }
            ].map((s, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 bg-[#111827]/50 backdrop-blur-sm border border-white/5 rounded-[40px] flex flex-col h-full hover:border-cyan-500/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-8">
                  <span className="text-4xl font-black text-cyan-500/20 group-hover:text-cyan-500/40 transition-colors">
                    {s.step}
                  </span>
                  <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform">
                    {s.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-grow">{s.desc}</p>
                <button 
                  onClick={() => s.link.startsWith('#') ? document.getElementById(s.link.substring(1))?.scrollIntoView({ behavior: 'smooth' }) : navigate(s.link)}
                  className="w-full py-4 bg-white/5 hover:bg-cyan-500 hover:text-slate-900 border border-white/10 hover:border-cyan-500 rounded-2xl text-xs font-black transition-all uppercase tracking-widest"
                >
                  {s.btnText}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Solution in Detail Section */}
      <section id="details" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-600/5 blur-[150px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight"
            >
              The Solution in Detail
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-slate-400 max-w-3xl mx-auto text-lg leading-relaxed"
            >
              Explore the core pillars of the HydroSync system. From the robust hardware that interacts with the physical world to the secure, scalable software that brings control to your screen.
            </motion.p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {[
              { id: 'hardware', label: 'Hardware & Electronics', icon: <Cpu className="w-4 h-4" /> },
              { id: 'software', label: 'Software & Cloud', icon: <Wifi className="w-4 h-4" /> },
              { id: 'safety', label: 'Safety & Reliability', icon: <ShieldCheck className="w-4 h-4" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 py-3 px-8 rounded-full font-bold text-xs uppercase tracking-widest transition-all border",
                  activeTab === tab.id 
                    ? "bg-cyan-500 text-slate-900 border-cyan-500 shadow-lg shadow-cyan-500/20" 
                    : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-[#111827]/50 backdrop-blur-sm border border-white/5 rounded-[40px] p-8 md:p-12 shadow-2xl overflow-hidden min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === 'hardware' && (
                <motion.div
                  key="hardware"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Cpu className="w-6 h-6 text-cyan-500" />
                    Hardware & Electronics
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    The physical unit is built with proven, off-the-shelf components selected for reliability and cost-effectiveness. The core is the ESP32 microcontroller, which provides Wi-Fi connectivity and processing power. It interfaces with two key sensor types:
                  </p>
                  <div className="grid md:grid-cols-2 gap-6 mt-8">
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl group hover:border-cyan-500/30 transition-all">
                      <h4 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                        <img src="/icon.png" alt="HydroSync Icon" className="w-4 h-4" />
                        AJ-SR04M Ultrasonic Sensor
                      </h4>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        A waterproof sensor that measures water levels with high precision by calculating the time-of-flight of a 40kHz sound pulse. This provides non-contact, reliable data even in humid tank environments.
                      </p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl group hover:border-cyan-500/30 transition-all">
                      <h4 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        ZHT103 Current Sensor
                      </h4>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        This sensor operates on the Hall Effect principle, generating a voltage proportional to the current flowing through the pump's live wire. This allows the ESP32 to non-invasively monitor the pump's power consumption and detect a dry-run condition.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'software' && (
                <motion.div
                  key="software"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Wifi className="w-6 h-6 text-cyan-500" />
                    Software & Cloud Architecture
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    The software stack is designed for security, scalability, and flexibility, allowing deployment on platforms like Render or AWS.
                  </p>
                  <div className="grid md:grid-cols-2 gap-6 mt-8">
                    <div className="space-y-4">
                      <div className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                        <h4 className="text-white font-bold text-sm mb-2">Cloud Communication (AWS IoT Core)</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">The ESP32 communicates with the cloud using the secure and lightweight MQTTs protocol. AWS IoT Core acts as the central message broker, reliably routing data from thousands of devices.</p>
                      </div>
                      <div className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                        <h4 className="text-white font-bold text-sm mb-2">Web Application (Django)</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">The user-facing dashboard is a powerful Django application. It uses Django Channels and the Daphne server to handle real-time WebSocket connections, pushing live data to the user's browser without needing to refresh the page.</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                        <h4 className="text-white font-bold text-sm mb-2">Hosting Strategy</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">The Django app is architected for portability. It can be quickly deployed to <strong>Render</strong> for its simplicity and managed PostgreSQL, and later migrated to <strong>AWS Elastic Beanstalk</strong> for fine-grained control and deeper integration with other AWS services as the user base scales.</p>
                      </div>
                      <div className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                        <h4 className="text-white font-bold text-sm mb-2">Database Strategy</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">A dual-database approach ensures performance. <strong>PostgreSQL (AWS RDS)</strong> stores structured user and device ownership data, while <strong>DynamoDB</strong> is used for high-volume, time-series sensor data, perfect for future analytics.</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'safety' && (
                <motion.div
                  key="safety"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-cyan-500" />
                    Safety & Reliability Features
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    HydroSync is engineered to be resilient against common failure points in the Kenyan context.
                  </p>
                  <div className="grid md:grid-cols-3 gap-6 mt-8">
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl">
                      <h4 className="text-white font-bold text-sm mb-3">Intelligent Dry-Run Protection</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">The system's firmware includes a debouncing algorithm. It requires 5 consecutive low-current readings from the ZHT103 sensor (over 2.5 seconds) to confirm a dry-run event. This prevents false alarms from momentary power fluctuations and ensures the pump is shut down only when genuinely at risk.</p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl">
                      <h4 className="text-white font-bold text-sm mb-3">Hybrid Power System</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">During a power outage, the TP4056 module seamlessly switches power to the 18650 lithium-ion battery. The MT3608 boost converter ensures the ESP32 receives a stable 5V, keeping the system's brain online, monitoring levels, and ready to resume automatic operation the moment mains power is restored.</p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl">
                      <h4 className="text-white font-bold text-sm mb-3">Hysteresis Control</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">The pump logic prevents rapid on/off cycling (chattering) which can damage the pump motor. It waits for the water level to drop to a significant low point (e.g., 30%) before starting and fills it to a high point (e.g., 95%) before stopping, ensuring longer, more efficient pumping cycles.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Features Grid (Impact) */}
      <section id="economics" className="py-24 px-6 bg-[#0f172a]/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Advanced Capabilities</h2>
            <p className="text-slate-400">Engineered for reliability, built for the future.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-white/5 rounded-3xl hover:border-cyan-500/30 transition-all group"
              >
                <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-500 mb-6 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* System Architecture */}
      <section id="architecture" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-purple-500/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">System Architecture</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">A seamless flow of data from your tanks to your fingertips, secured by enterprise-grade protocols.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-center">
            <div className="space-y-6">
              <div className="p-6 bg-[#1e293b] border border-white/5 rounded-3xl">
                <h4 className="text-cyan-500 font-bold text-xs uppercase tracking-widest mb-2">01. Edge Layer</h4>
                <p className="text-white font-bold mb-2">ESP32 & Sensors</p>
                <p className="text-slate-400 text-xs leading-relaxed">Waterproof ultrasonic sensors measure levels while the ZHT103 monitors pump current for dry-run protection.</p>
              </div>
              <div className="p-6 bg-[#1e293b] border border-white/5 rounded-3xl">
                <h4 className="text-cyan-500 font-bold text-xs uppercase tracking-widest mb-2">02. Connectivity</h4>
                <p className="text-white font-bold mb-2">MQTT over TLS 1.2</p>
                <p className="text-slate-400 text-xs leading-relaxed">Data is encrypted and streamed to HiveMQ Cloud with sub-second latency using the lightweight MQTT protocol.</p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <div className="w-48 h-48 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/20">
                  <Activity className="w-20 h-20 text-white animate-pulse" />
                </div>
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-[#1e293b] border border-white/10 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-cyan-500" />
                </div>
              </div>
              <div className="mt-8 text-center">
                <span className="px-4 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-Time Core</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-[#1e293b] border border-white/5 rounded-3xl">
                <h4 className="text-cyan-500 font-bold text-xs uppercase tracking-widest mb-2">03. Cloud Backend</h4>
                <p className="text-white font-bold mb-2">Firebase & Firestore</p>
                <p className="text-slate-400 text-xs leading-relaxed">Our backend processes telemetry, manages user accounts, and stores historical data for deep analytics.</p>
              </div>
              <div className="p-6 bg-[#1e293b] border border-white/5 rounded-3xl">
                <h4 className="text-cyan-500 font-bold text-xs uppercase tracking-widest mb-2">04. Interface</h4>
                <p className="text-white font-bold mb-2">React Dashboard</p>
                <p className="text-slate-400 text-xs leading-relaxed">A high-performance web dashboard provides live monitoring, manual controls, and AI-driven insights.</p>
              </div>
            </div>
          </div>

          {/* Interactive D3 Graph */}
          <div className="mt-16">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">Interactive Data Flow</h3>
              <p className="text-slate-400 text-sm">Drag the nodes to explore how data and commands flow through the HydroSync ecosystem.</p>
            </div>
            <SystemArchitectureGraph />
          </div>
        </div>
      </section>

      {/* Hardware Section */}
      <section id="hardware" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">Industrial-Grade Hardware</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                HydroSync isn't just software. It's a custom-engineered hardware solution designed for the toughest environments. From waterproof ultrasonic sensors to solid-state relays, every component is chosen for longevity and precision.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                {hardwareSpecs.map((s, i) => (
                  <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest block mb-1">{s.name}</span>
                    <span className="text-sm font-medium text-white">{s.detail}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-3xl">
                <div className="flex items-center gap-3 mb-3">
                  <Wifi className="w-5 h-5 text-cyan-500" />
                  <h4 className="font-bold text-white">Captive Portal Setup</h4>
                </div>
                <p className="text-sm text-slate-400">
                  No more hardcoded WiFi passwords. HydroSync devices broadcast their own setup network ("HydroSync_Setup") allowing you to provision them securely from your smartphone.
                </p>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-square bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-[40px] border border-white/10 flex items-center justify-center overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/iot/800/800" 
                  alt="HydroSync Hardware" 
                  className="w-full h-full object-cover opacity-50 mix-blend-overlay"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                  <Cpu className="w-20 h-20 text-cyan-500 mb-6 animate-pulse" />
                  <h3 className="text-2xl font-bold text-white">The Brain</h3>
                  <p className="text-slate-400 mt-2">ESP32-WROOM-32 Dual-Core Processor</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Section */}
      <section id="mobile-app" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-cyan-500/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="aspect-[9/16] max-w-[300px] mx-auto bg-[#1e293b] rounded-[3rem] border-[8px] border-[#0f172a] shadow-2xl overflow-hidden relative group">
                <img 
                  src="https://picsum.photos/seed/mobile/600/1066" 
                  alt="HydroSync App" 
                  className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent" />
                <div className="absolute bottom-12 left-0 right-0 p-8 text-center">
                  <img src="/icon.png" alt="HydroSync Icon" className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
                  <h4 className="text-xl font-bold text-white">HydroSync Mobile</h4>
                  <p className="text-xs text-slate-400 mt-2">v1.0.0 Production Build</p>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">HydroSync in Your Pocket</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Take control of your water management on the go. Our native Android application provides real-time push notifications, offline data caching, and a streamlined interface for quick pump control.
              </p>

              <div className="space-y-6" id="native-app">
                <div className="p-6 bg-[#1e293b] border border-white/5 rounded-3xl">
                  <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                    Already have the app?
                  </h4>
                  <p className="text-slate-400 text-sm mb-4">Click below to open HydroSync on your device.</p>
                  <button 
                    onClick={handleLogin}
                    className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl transition-all flex items-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    Open App
                  </button>
                </div>

                <div className="p-6 bg-white/5 border border-white/10 rounded-3xl">
                  <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-cyan-500" />
                    New Installation
                  </h4>
                  <p className="text-slate-400 text-sm mb-4">Download the latest APK to install HydroSync on your Android smartphone.</p>
                  <a 
                    href="/HydroSync-App.apk"
                    download
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all flex items-center gap-2 inline-block"
                  >
                    <Zap className="w-4 h-4" />
                    Download APK (v1.0.0)
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap Section (Production) */}
      <section id="production" className="py-24 px-6 bg-[#0f172a]/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Production Roadmap</h2>
            <p className="text-slate-400">From prototype to enterprise-grade deployment.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "R&D Phase", desc: "Sensor calibration and firmware optimization for Kenyan infrastructure." },
              { step: "02", title: "Beta Testing", desc: "Field testing in 50+ households to validate dry-run protection logic." },
              { step: "03", title: "Mass Production", desc: "Custom PCB manufacturing and IP65-rated enclosure assembly." },
              { step: "04", title: "Global Scale", desc: "Expansion to multi-region cloud clusters and OTA update support." }
            ].map((r, i) => (
              <div key={i} className="relative p-8 bg-[#1e293b] border border-white/5 rounded-3xl group hover:border-cyan-500/30 transition-all">
                <span className="text-4xl font-black text-white/5 absolute top-4 right-4 group-hover:text-cyan-500/10 transition-colors">{r.step}</span>
                <h4 className="text-lg font-bold text-white mb-3">{r.title}</h4>
                <p className="text-slate-400 text-xs leading-relaxed">{r.desc}</p>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-[1px] bg-white/10 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section (About Us) */}
      <section id="about" className="py-24 px-6 bg-[#0f172a]/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Meet the Visionaries</h2>
            <p className="text-slate-400">The team behind the innovation.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {team.map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-[#1e293b] border border-white/5 rounded-3xl overflow-hidden group"
              >
                <div className="aspect-square overflow-hidden">
                  <img 
                    src={member.image} 
                    alt={member.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="p-6">
                  <h4 className="font-bold text-white">{member.name}</h4>
                  <p className="text-xs text-cyan-500 font-bold uppercase tracking-widest mt-1 mb-3">{member.role}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{member.bio}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Section (AI Insight) */}
      <section id="ai-analysis" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 blur-[150px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Need Assistance?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
              Choose the support channel that best fits your needs. Our AI is perfect for quick fixes, while our human engineers handle the complex stuff.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* AI Support Card */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-10 bg-[#111827]/50 backdrop-blur-sm border border-white/5 rounded-[40px] relative group overflow-hidden hover:border-cyan-500/30 transition-all"
            >
              <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:opacity-20 transition-opacity">
                <Bot className="w-32 h-32 text-cyan-500" />
              </div>
              <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-500 mb-8 group-hover:scale-110 transition-transform">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Immediate AI Assistance</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                Our **HydroSync Gemini AI** is available 24/7. It has deep knowledge of our hardware specs, connection protocols, and common troubleshooting steps. Perfect for quick questions and setup guidance.
              </p>
              <button 
                onClick={() => navigate('/chatbot')}
                className="flex items-center gap-2 text-cyan-400 font-bold text-sm hover:gap-3 transition-all group"
              >
                Launch AI Chatbot <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>

            {/* Human Support Card */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-[40px] group relative overflow-hidden hover:border-cyan-500/40 transition-all"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16" />
              <div className="w-16 h-16 bg-cyan-500 rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-cyan-500/20 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Complex Issue?</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                If our AI can't resolve your specific hardware failure or complex network issue, our human engineering team is ready to step in. We provide direct technical support for all HydroSync deployments.
              </p>
              <div className="space-y-4">
                <a 
                  href="mailto:support@hydrosync.co.ke"
                  className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-cyan-500 hover:text-slate-900 transition-all group"
                >
                  <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400 group-hover:bg-slate-900/20 group-hover:text-slate-900 transition-colors">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 group-hover:text-slate-900/70 uppercase tracking-widest transition-colors">Direct Support Email</span>
                    <span className="text-base font-black">support@hydrosync.co.ke</span>
                  </div>
                </a>
                <p className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                  Typical response: &lt; 24 Hours
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="HydroSync Icon" className="w-6 h-6 text-cyan-500" />
            <span className="text-lg font-bold text-white">HydroSync</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 HydroSync. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-slate-500 hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-slate-500 hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
      {/* Floating ChatBot */}
      <FloatingChatBot />
    </div>
  );
}
