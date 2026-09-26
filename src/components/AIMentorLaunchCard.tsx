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
      className={`fixed right-3 md:right-4 z-40 cursor-pointer ${className}`}
      style={{
        // Position above bottom nav on mobile (64px nav + safe-area + 12px margin)
        // On desktop, position normally from bottom
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
      }}
      aria-label="Ask AI Mentor"
    >
      <LiquidGlassCard className="!p-2.5 md:!p-3 flex items-center gap-2 md:gap-2.5 pr-3 md:pr-4 hover:!bg-white/10 transition-colors">
        <div className="relative flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
          <div
            ref={glowRef}
            className="pointer-events-none absolute -inset-1 rounded-full bg-purple-500 blur-md opacity-40 -z-10"
          />
          <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        </div>
        <div className="text-left hidden xs:block">
          <div className="flex items-center gap-1 text-xs font-bold text-white whitespace-nowrap">
            Ask AI Mentor
            <Sparkles className="w-3 h-3 text-purple-300" />
          </div>
        </div>
      </LiquidGlassCard>
    </button>
  );
}

export default AIMentorLaunchCard;
