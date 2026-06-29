import React from 'react';
import { motion } from 'motion/react';
import { easeInOut } from 'motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface FloatingGradientBlobsProps {
  count?: number;
}

const blobColors = [
  'from-purple-500/10 to-blue-600/10',
  'from-emerald-500/10 to-teal-600/10',
  'from-indigo-500/10 to-purple-600/10',
];

export const FloatingGradientBlobs: React.FC<FloatingGradientBlobsProps> = ({ 
  count = 3 
}) => {
  const reduced = useReducedMotion();

  if (reduced) return null;

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={`absolute w-96 h-96 rounded-full bg-gradient-to-br ${blobColors[i % blobColors.length]} blur-3xl`}
          style={{
            left: `${Math.random() * 80 + 10}%`,
            top: `${Math.random() * 80 + 10}%`,
          }}
          animate={{
            x: [0, 50, -50, 0],
            y: [0, -30, 30, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{
            duration: 15 + i * 5,
            repeat: Infinity,
            ease: easeInOut,
          }}
        />
      ))}
    </div>
  );
};

export default FloatingGradientBlobs;