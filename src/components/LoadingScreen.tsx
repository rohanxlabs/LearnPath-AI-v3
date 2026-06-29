import React from 'react';
import { motion } from 'motion/react';
import { easeInOut } from 'motion';

type LoadingVariant = 'book' | 'pencil' | 'pages';

interface LoadingScreenProps {
  variant?: LoadingVariant;
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  variant = 'book', 
  message = 'Loading your learning space...' 
}) => {
  return (
    <div className="fixed inset-0 bg-[#0A0A0A] flex flex-col items-center justify-center z-50">
      <div className="relative w-24 h-24 mb-6">
        {variant === 'book' && (
          <motion.div
            className="w-full h-full relative"
            animate={{ rotateY: [0, -30, 0, 30, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: easeInOut }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-2xl" />
            <motion.div
              className="absolute left-0 top-0 bottom-0 w-1 bg-white/20 rounded-l-lg"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <div className="absolute bottom-0 left-2 right-2 h-1 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full opacity-60" />
          </motion.div>
        )}

        {variant === 'pencil' && (
          <motion.div
            className="w-full h-full flex items-center justify-center"
            animate={{ rotate: [-10, 10, -10] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: easeInOut }}
          >
            <div className="relative">
              <div className="w-8 h-20 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full shadow-lg" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-300 rounded-full" />
              <motion.div
                className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-800 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </div>
          </motion.div>
        )}

        {variant === 'pages' && (
          <motion.div
            className="w-full h-full flex items-center justify-center gap-1"
            animate={{ x: [-10, 10, -10] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: easeInOut }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-6 h-20 bg-white/5 border border-white/10 rounded-sm"
                initial={{ rotate: 0 }}
                animate={{ rotate: [-5, 5, -5] }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  delay: i * 0.2,
                  ease: easeInOut 
                }}
              />
            ))}
          </motion.div>
        )}
      </div>

      <motion.p
        className="text-zinc-400 text-xs font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {message}
      </motion.p>
    </div>
  );
};

export default LoadingScreen;