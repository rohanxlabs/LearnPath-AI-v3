import React, { useRef, useEffect } from 'react';
import { animate, stagger, createScope, type Scope } from 'animejs';
import { LiquidGlassCard } from './LiquidGlass';

/**
 * Activity Rings — Apple Watch-style progress rings, repurposed to show
 * LearnPath study activity (hours studied / lessons completed / streak)
 * instead of Move/Exercise/Stand.
 *
 * Ported from a Framer Motion demo to anime.js so animation stays
 * consistent with the rest of the app's new anime.js-driven components.
 */

interface RingData {
  label: string;
  value: number; // 0-100 percent fill
  color: string;
  colorEnd: string;
  size: number;
  current: number;
  target: number;
  unit: string;
}

export interface ActivityRingsProps {
  hoursStudied: number;
  hoursTarget?: number;
  lessonsCompleted: number;
  lessonsTarget?: number;
  streak: number;
  streakTarget?: number;
  title?: string;
  className?: string;
}

export function ActivityRings({
  hoursStudied,
  hoursTarget = 20,
  lessonsCompleted,
  lessonsTarget = 30,
  streak,
  streakTarget = 14,
  title = 'This Week',
  className = '',
}: ActivityRingsProps) {
  const rings: RingData[] = [
    {
      label: 'HOURS',
      value: Math.min((hoursStudied / hoursTarget) * 100, 100),
      color: '#a855f7',
      colorEnd: '#c4b5fd',
      size: 200,
      current: hoursStudied,
      target: hoursTarget,
      unit: 'HRS',
    },
    {
      label: 'LESSONS',
      value: Math.min((lessonsCompleted / lessonsTarget) * 100, 100),
      color: '#38bdf8',
      colorEnd: '#7dd3fc',
      size: 160,
      current: lessonsCompleted,
      target: lessonsTarget,
      unit: 'DONE',
    },
    {
      label: 'STREAK',
      value: Math.min((streak / streakTarget) * 100, 100),
      color: '#f59e0b',
      colorEnd: '#fbbf24',
      size: 120,
      current: streak,
      target: streakTarget,
      unit: 'DAYS',
    },
  ];

  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;

    scopeRef.current = createScope({ root: rootRef }).add((self) => {
      // Title fade-down
      animate('[data-arings-title]', {
        opacity: [0, 1],
        translateY: [-16, 0],
        duration: 500,
        ease: 'outQuad',
      });

      // Rings fill in, staggered outer-to-inner like the original
      rings.forEach((ring, index) => {
        const circumference = 2 * Math.PI * ((ring.size - 16) / 2);
        const offset = circumference - (ring.value / 100) * circumference;

        animate(`[data-ring="${ring.label}"]`, {
          strokeDashoffset: [circumference, offset],
          duration: 1400,
          delay: index * 200,
          ease: 'inOutQuad',
        });
      });

      // Detail rows stagger in
      animate('[data-arings-detail]', {
        opacity: [0, 1],
        translateX: [16, 0],
        delay: stagger(120, { start: 300 }),
        duration: 450,
        ease: 'outQuad',
      });
    });

    return () => scopeRef.current?.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursStudied, lessonsCompleted, streak]);

  return (
    <LiquidGlassCard className={`p-8 ${className}`}>
      <div ref={rootRef} className="flex flex-col items-center gap-8">
        <h2 data-arings-title className="font-display font-medium text-xl text-white opacity-0">
          {title}
        </h2>

        <div className="flex items-center">
          <div className="relative" style={{ height: 180, width: 180 }}>
            {rings.map((ring) => {
              const strokeWidth = 16;
              const radius = (ring.size - strokeWidth) / 2;
              const circumference = 2 * Math.PI * radius;
              const gradientId = `arings-gradient-${ring.label.toLowerCase()}`;

              return (
                <div className="absolute inset-0 flex items-center justify-center" key={ring.label}>
                  <svg
                    aria-label={`${ring.label} progress — ${Math.round(ring.value)}%`}
                    className="-rotate-90 transform"
                    height={ring.size}
                    viewBox={`0 0 ${ring.size} ${ring.size}`}
                    width={ring.size}
                  >
                    <title>{`${ring.label} progress — ${Math.round(ring.value)}%`}</title>
                    <defs>
                      <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: ring.color, stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: ring.colorEnd, stopOpacity: 1 }} />
                      </linearGradient>
                    </defs>
                    <circle
                      className="text-white/10"
                      cx={ring.size / 2}
                      cy={ring.size / 2}
                      fill="none"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth={strokeWidth}
                    />
                    <circle
                      cx={ring.size / 2}
                      cy={ring.size / 2}
                      data-ring={ring.label}
                      fill="none"
                      r={radius}
                      stroke={`url(#${gradientId})`}
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference}
                      strokeLinecap="round"
                      strokeWidth={strokeWidth}
                      style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.25))' }}
                    />
                  </svg>
                </div>
              );
            })}
          </div>

          <div className="ml-8 flex flex-col gap-6">
            {rings.map((ring) => (
              <div className="flex flex-col opacity-0" data-arings-detail key={ring.label}>
                <span className="font-medium text-sm text-zinc-400">{ring.label}</span>
                <span className="font-semibold text-2xl" style={{ color: ring.color }}>
                  {ring.current}/{ring.target}
                  <span className="ml-1 text-base text-zinc-400">{ring.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export default ActivityRings;
