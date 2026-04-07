import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const controls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_PULL = 100;
  const THRESHOLD = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0 || refreshing) return;
    setStartY(e.touches[0].clientY);
    setPulling(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    
    const currentY = e.touches[0].clientY;
    const distance = currentY - startY;

    if (distance > 0) {
      // Prevent default scrolling when pulling down
      if (e.cancelable) {
        e.preventDefault();
      }
      const newDistance = Math.min(distance * 0.5, MAX_PULL);
      setPullDistance(newDistance);
      controls.set({ y: newDistance });
      
      // Light haptic feedback as you pull
      if (newDistance > THRESHOLD && pullDistance <= THRESHOLD) {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling || refreshing) return;
    setPulling(false);

    if (pullDistance > THRESHOLD) {
      setRefreshing(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      controls.start({ y: THRESHOLD, transition: { type: 'spring', stiffness: 300, damping: 20 } });
      
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
        controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
      }
    } else {
      setPullDistance(0);
      controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <motion.div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center h-16 -mt-16 overflow-hidden"
        animate={controls}
      >
        <motion.div
          animate={{ rotate: refreshing ? 360 : pullDistance }}
          transition={refreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0 }}
          className="w-8 h-8 rounded-full bg-[#1e293b] border border-white/10 shadow-lg flex items-center justify-center text-cyan-500"
        >
          <RefreshCw className="w-4 h-4" />
        </motion.div>
      </motion.div>
      
      <motion.div animate={controls} className="w-full h-full">
        {children}
      </motion.div>
    </div>
  );
}
