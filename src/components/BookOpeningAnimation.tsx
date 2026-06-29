import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { easeInOut } from 'motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface BookOpeningAnimationProps {
  onComplete?: () => void;
  lessonTitle?: string;
}

export const BookOpeningAnimation: React.FC<BookOpeningAnimationProps> = ({ 
  onComplete, 
  lessonTitle = 'Lesson' 
}) => {
  const reduced = useReducedMotion();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reduced && onComplete) {
      timeoutRef.current = setTimeout(() => {
        onComplete();
      }, 1200) as ReturnType<typeof setTimeout>;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onComplete, reduced]);

  if (reduced) {
    return null;
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={onComplete}
    >
      <div className="relative w-64 h-48 perspective-1000">
        {/* Book Cover */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-purple-600 to-blue-600 rounded-r-lg shadow-2xl origin-left"
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -150 }}
          transition={{ duration: 0.8, ease: easeInOut }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <span className="text-white text-lg font-bold text-center">{lessonTitle}</span>
          </div>
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-white/20 rounded-l-full" />
        </motion.div>

        {/* Book Pages - Left side */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-12 bg-white/90 rounded-l-lg shadow-lg"
          initial={{ x: 0, opacity: 0 }}
          animate={{ x: -8, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: easeInOut }}
        />

        {/* Book Pages - Right side */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-12 bg-white/70 rounded-r-lg shadow-lg"
          initial={{ x: 0, opacity: 0 }}
          animate={{ x: 8, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: easeInOut }}
        />

        {/* Lesson Content Fade-in */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4, ease: easeInOut }}
        >
          <div className="p-6 bg-white/95 rounded-lg shadow-xl max-w-xs">
            <p className="text-zinc-800 text-sm font-medium">Loading lesson...</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default BookOpeningAnimation;