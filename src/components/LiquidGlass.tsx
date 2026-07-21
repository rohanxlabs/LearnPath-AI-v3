import React, { useRef, useId } from 'react';
import { animate, createScope, type Scope } from 'animejs';

/**
 * Liquid Glass kit — adapted for LearnPath AI's Vite + React 19 stack.
 * No Next.js / shadcn dependency: plain elements + Tailwind, matching the
 * app's existing dark glass-card design language (see styles/theme.ts).
 *
 * Animation: anime.js (v4) drives the SVG displacement filter and the
 * press/hover feedback, replacing what was plain CSS transitions.
 */

const GLASS_SHADOW =
  'shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_0_0_6px_6px_rgba(255,255,255,0.06),inset_0_0_2px_2px_rgba(255,255,255,0.04),0_0_12px_rgba(0,0,0,0.15)]';

const DEFAULT_FILTER_SCALE = 30;
const BUTTON_FILTER_SCALE = 70;
const HOVER_FILTER_SCALE_BUMP = 25;

function GlassFilter({ id, scale = DEFAULT_FILTER_SCALE }: { id: string; scale?: number }) {
  return (
    <svg aria-hidden="true" className="hidden" focusable={false}>
      <title>Glass Effect Filter</title>
      <defs>
        <filter colorInterpolationFilters="sRGB" height="200%" id={id} width="200%" x="-50%" y="-50%">
          <feTurbulence baseFrequency="0.05 0.05" numOctaves={1} result="turbulence" seed={1} type="fractalNoise" />
          <feGaussianBlur in="turbulence" result="blurredNoise" stdDeviation={2} />
          <feDisplacementMap
            id={`${id}-displace`}
            in="SourceGraphic"
            in2="blurredNoise"
            result="displaced"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="B"
          />
          <feGaussianBlur in="displaced" result="finalBlur" stdDeviation={4} />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

export interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'solid';
}

export function LiquidButton({ className = '', variant = 'ghost', children, ...props }: LiquidButtonProps) {
  const filterId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);

  React.useEffect(() => {
    scopeRef.current = createScope({ root: rootRef }).add(() => {});
    return () => scopeRef.current?.revert();
  }, []);

  const feId = `${filterId}-displace`;

  const rippleIn = () => {
    animate(`#${CSS.escape(feId)}`, {
      scale: [BUTTON_FILTER_SCALE, BUTTON_FILTER_SCALE + HOVER_FILTER_SCALE_BUMP],
      duration: 500,
      ease: 'outQuad',
    });
    if (rootRef.current) {
      animate(rootRef.current, { scale: 1.05, duration: 250, ease: 'outQuad' });
    }
  };

  const rippleOut = () => {
    animate(`#${CSS.escape(feId)}`, {
      scale: BUTTON_FILTER_SCALE,
      duration: 400,
      ease: 'outQuad',
    });
    if (rootRef.current) {
      animate(rootRef.current, { scale: 1, duration: 250, ease: 'outQuad' });
    }
  };

  const pressDown = () => {
    if (rootRef.current) animate(rootRef.current, { scale: 0.94, duration: 120, ease: 'outQuad' });
  };
  const pressUp = () => {
    if (rootRef.current) animate(rootRef.current, { scale: 1.05, duration: 150, ease: 'outElastic(1, .6)' });
  };

  return (
    <div
      ref={rootRef}
      className="relative inline-flex motion-reduce:transition-none"
      onMouseEnter={rippleIn}
      onMouseLeave={rippleOut}
      onMouseDown={pressDown}
      onMouseUp={pressUp}
    >
      <button
        className={`relative overflow-hidden cursor-pointer ${GLASS_SHADOW} ${
          variant === 'solid'
            ? 'bg-gradient-to-br from-purple-500 to-blue-600 text-white'
            : 'bg-white/5 text-zinc-300 hover:bg-white/10'
        } ${className}`}
        {...props}
      >
        <div
          className="pointer-events-none absolute inset-0 isolate -z-10 overflow-hidden rounded-[inherit]"
          style={{ backdropFilter: `url("#${filterId}")` }}
        />
        <span className="relative z-10 flex items-center justify-center">{children}</span>
      </button>
      <GlassFilter id={filterId} scale={BUTTON_FILTER_SCALE} />
    </div>
  );
}

export interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glassEffect?: boolean;
  children?: React.ReactNode;
}

export function LiquidGlassCard({ className = '', glassEffect = true, children, ...props }: LiquidGlassCardProps) {
  const filterId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!rootRef.current) return;
    // Entrance: soft fade + rise, matches the app's existing card-mount feel.
    const anim = animate(rootRef.current, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 500,
      ease: 'outQuad',
    });
    return () => {
      anim.pause();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`group relative overflow-hidden rounded-3xl bg-white/5 backdrop-blur-[2px] border border-white/10 p-6 ${GLASS_SHADOW} ${className}`}
      {...props}
    >
      {glassEffect && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
            style={{ backdropFilter: `url("#${filterId}")` }}
          />
          <GlassFilter id={filterId} scale={DEFAULT_FILTER_SCALE} />
        </>
      )}
      <div className="relative z-10">{children}</div>
      <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100" />
    </div>
  );
}
