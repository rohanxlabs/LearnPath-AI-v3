import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-[#0A0A0A] flex flex-col items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-24 h-24 mb-6"
      >
        <motion.div
          animate={{ rotateY: [0, -30, 0, 30, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-full h-full"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-2xl" />
          <motion.div
            className="absolute left-0 top-0 bottom-0 w-1 bg-white/20 rounded-l-lg"
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <div className="absolute bottom-0 left-2 right-2 h-1 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full opacity-60" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-center"
      >
        <h1 className="font-display font-extrabold text-2xl text-white flex items-center gap-2">
          LearnPath <span className="text-purple-400">AI</span>
          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        </h1>
        <p className="text-xs text-zinc-400 mt-2">Loading your learning space...</p>
      </motion.div>
    </div>
  );
};

export default SplashScreen;