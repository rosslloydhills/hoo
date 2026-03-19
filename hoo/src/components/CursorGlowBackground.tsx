'use client';

import { useEffect, useRef } from 'react';

export function CursorGlowBackground({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let nextX = window.innerWidth * 0.5;
    let nextY = window.innerHeight * 0.22;

    const apply = () => {
      rafId = null;
      el.style.setProperty('--glow-x', `${nextX}px`);
      el.style.setProperty('--glow-y', `${nextY}px`);
    };

    const onPointerMove = (e: PointerEvent) => {
      nextX = e.clientX;
      nextY = e.clientY;
      if (rafId == null) rafId = window.requestAnimationFrame(apply);
    };

    el.addEventListener('pointermove', onPointerMove, { passive: true });
    apply();

    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={rootRef} className="hoo-glowRoot">
      {children}
    </div>
  );
}

