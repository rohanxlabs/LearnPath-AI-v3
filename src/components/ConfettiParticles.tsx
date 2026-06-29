import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { easeOut } from 'motion';

interface ConfettiParticlesProps {
  count?: number;
  colors?: string[];
  onComplete?: () => void;
}

interface ParticleType {
  id: number;
  x: number;
  y: number;
  color: string;
  delay: number;
}

export const ConfettiParticles: React.FC<ConfettiParticlesProps> = ({ 
  count = 20, 
  colors = ['#8b5cf6', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899'],
  onComplete 
}) => {
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const particles: ParticleType[] = Array.from({ length: count }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.5,
  }));

  return (
    <div ref={particlesRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            backgroundColor: p.color,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          initial={{ 
            opacity: 1, 
            y: 0, 
            rotate: 0,
            scale: 0
          }}
          animate={{ 
            y: -200, 
            rotate: Math.random() * 360 - 180,
            scale: [0, 1, 0.5],
          }}
          transition={{ 
            duration: 1.5, 
            delay: p.delay,
            ease: easeOut 
          }}
        />
      ))}
    </div>
  );
};

export default ConfettiParticles;