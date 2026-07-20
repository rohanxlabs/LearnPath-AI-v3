import React, { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { Bot, Sparkles } from 'lucide-react';
import { LiquidGlassCard } from './LiquidGlass';

/**
 * Floating quick-launch card for the AI Mentor, sitting just above the
 * bottom navigation. Built on LiquidGlassCard so it gets the liquid ripple
 * background for free; adds its own gentle glow pulse via anime.js to draw
 * the eye without being distracting.
 */
export interface AIMentorLaunchCardProps {
  onOpen: () => void;
  className?: string;
}

export function AIMentorLaunchCard({ onOpen, className = '' }: AIMentorLaunchCardProps) {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!glowRef.current) return;
    const anim = animate(glowRef.current, {
      opacity: [0.35, 0.65],
      duration: 1800,
      direction: 'alternate',
      loop: true,
      ease: 'inOutSine',
    });
    return () => {
      anim.pause();
    };
  }, []);

  return (
    <button
      onClick={onOpen}
      className={`fixed right-4 bottom-20 md:bottom-6 z-40 cursor-pointer ${className}`}
      aria-label="Ask AI Mentor"
    >
      <LiquidGlassCard className="!p-3 flex items-center gap-2.5 pr-4 hover:!bg-white/10 transition-colors">
        <div className="relative flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
          <div
            ref={glowRef}
            className="pointer-events-none absolute -inset-1 rounded-full bg-purple-500 blur-md opacity-40 -z-10"
          />
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1 text-xs font-bold text-white">
            Ask AI Mentor
            <Sparkles className="w-3 h-3 text-purple-300" />
          </div>
        </div>
      </LiquidGlassCard>
    </button>
  );
}

export default AIMentorLaunchCard;
