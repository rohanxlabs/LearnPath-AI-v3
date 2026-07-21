import React, { useEffect, useRef } from 'react';

const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const dots = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a: Math.random() * 0.45 + 0.2,
    }));

    let raf = 0;
    let paused = false;

    const draw = () => {
      if (!paused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const d of dots) {
          d.x += d.vx;
          d.y += d.vy;
          if (d.x < 0) d.x = canvas.width;
          if (d.x > canvas.width) d.x = 0;
          if (d.y < 0) d.y = canvas.height;
          if (d.y > canvas.height) d.y = 0;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(168,85,247,${d.a * 0.6})`;
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const observer = new IntersectionObserver(
      ([entry]) => { paused = !entry.isIntersecting; },
      { threshold: 0 },
    );
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
};

export default ParticleCanvas;
