import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Send, MessageSquare, Droplets, Info, HelpCircle, AlertCircle, Smartphone, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { USER_DOCUMENTATION } from '../constants/docs';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const SYSTEM_PROMPT = `You are HydroSync AI, a friendly water system assistant. You help people understand their water tank levels, pump status, and fix problems. Talk like a helpful neighbour — simple, clear, and practical. Keep answers short. If someone asks something unrelated, help but gently guide them back to water systems.\n\nWhat you know about HydroSync:\n${USER_DOCUMENTATION}`;

// Cooldown to prevent hitting Gemini free tier rate limits
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10000; // 10 seconds between requests

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi! I'm HydroSync AI 👋 How can I help you with your water system today?", sender: 'bot', timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setIsTyping(true);

    try {
      // Enforce cooldown to prevent rate limit exhaustion
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitSeconds = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000);
        const cooldownMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: `Please wait ${waitSeconds} second${waitSeconds > 1 ? 's' : ''} before asking another question. This helps keep the service free for everyone.`,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, cooldownMsg]);
        return;
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_PROMPT,
      });

      lastRequestTime = Date.now();
      // Retry up to 3 times for 503 (server overloaded) errors
      let responseText = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await model.generateContent(currentInput);
          responseText = result.response.text();
          break;
        } catch (err: any) {
          const is503 = err?.message?.includes('503') || err?.message?.includes('high demand');
          if (is503 && attempt < 2) {
            const delay = Math.pow(2, attempt + 1) * 2000; // 4s, 8s
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText || "I'm sorry, I couldn't think of an answer. Try again?",
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      const is429 = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded');
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: is429
          ? "I've reached my daily question limit. Please try again in a few minutes, or contact support if this persists."
          : "I'm sorry, I ran into a problem. Please check your internet connection and try again.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestions = [
    "What does Dry Run mean?",
    "Why is my pump not on?",
    "How do I add a device?",
    "Tank level meanings"
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0f172a]">
      <header className="sticky top-0 z-30 bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white leading-none">HydroSync AI</h1>
          <p className="text-[10px] text-cyan-400 mt-1 font-bold uppercase tracking-widest">Smart Assistant</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
              msg.sender === 'user' 
                ? "bg-cyan-500/15 border border-cyan-500/20 text-cyan-100 ml-auto rounded-tr-none" 
                : "bg-[#1e293b] border border-white/5 text-slate-300 mr-auto rounded-tl-none"
            )}
          >
            {msg.text}
            <div className={cn(
              "text-[9px] mt-2 font-medium uppercase tracking-tighter opacity-50",
              msg.sender === 'user' ? "text-right" : "text-left"
            )}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="bg-[#1e293b] border border-white/5 p-4 rounded-2xl rounded-tl-none w-16 flex gap-1 items-center justify-center">
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
          </div>
        )}
      </div>

      <div className="p-6 bg-[#1e293b] border-t border-white/10 space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setInput(s); handleSend(); }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] font-bold text-cyan-400 whitespace-nowrap transition-all"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your water system..."
            className="flex-1 bg-[#1a2234] border border-white/5 rounded-2xl py-3 px-5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
          />
          <button
            onClick={handleSend}
            className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 active:scale-90 transition-transform"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
