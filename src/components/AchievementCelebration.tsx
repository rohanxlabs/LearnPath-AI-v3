import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { easeOut } from 'motion';
import { Achievement } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AchievementCelebrationProps {
  achievement: Achievement;
  onDone?: () => void;
}

export const AchievementCelebration: React.FC<AchievementCelebrationProps> = ({ 
  achievement, 
  onDone 
}) => {
  const reduced = useReducedMotion();
  const [show, setShow] = useState(true);
  const [xpCount, setXpCount] = useState(0);

  useEffect(() => {
    if (reduced) return;

    const timer = setTimeout(() => {
      if (onDone) onDone();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onDone, reduced]);

  useEffect(() => {
    if (reduced) return;

    const duration = 1500;
    const increment = achievement.xpReward / (duration / 50);
    let current = 0;

    const interval = setInterval(() => {
      current += increment;
      if (current >= achievement.xpReward) {
        setXpCount(achievement.xpReward);
        clearInterval(interval);
      } else {
        setXpCount(Math.floor(current));
      }
    }, 50);

    return () => clearInterval(interval);
  }, [achievement.xpReward, reduced]);

  if (reduced) return null;

  const handleClose = () => {
    setShow(false);
    if (onDone) onDone();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="relative"
            initial={{ y: -100, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {/* Medal */}
            <motion.div
              className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-2xl border-4 border-amber-200"
              animate={{ 
                rotate: [0, 5, -5, 0],
                y: [0, -10, 0]
              }}
              transition={{ 
                rotate: { duration: 4, repeat: Infinity },
                y: { duration: 2, repeat: Infinity }
              }}
            >
              <span className="text-4xl">🏆</span>
            </motion.div>

            {/* Sparkles */}
            <SparkleParticles count={8} />

            {/* Content */}
            <motion.div
              className="mt-4 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: easeOut }}
            >
              <h3 className="text-xl font-bold text-white mb-2">Achievement Unlocked!</h3>
              <p className="text-lg text-amber-300 font-semibold mb-1">{achievement.name}</p>
              <p className="text-xs text-zinc-400">{achievement.description}</p>
              
              {/* XP Counter */}
              <motion.div
                className="mt-3 px-4 py-2 bg-emerald-500/20 rounded-full inline-block"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
              >
                <span className="text-emerald-300 font-bold">+{xpCount} XP</span>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Sparkle component
const SparkleParticles: React.FC<{ count: number }> = ({ count }) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-amber-300"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ 
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            rotate: [0, 180, 360],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: easeOut 
          }}
        >
          ✨
        </motion.div>
      ))}
    </div>
  );
};

export default AchievementCelebration;