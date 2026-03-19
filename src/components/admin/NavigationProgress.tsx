'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function NavigationProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const previousPathname = useRef(pathname);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const complete = useCallback(() => {
    cleanup();
    setProgress(100);
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 400);
  }, [cleanup]);

  const start = useCallback(() => {
    cleanup();
    setLoading(true);
    setProgress(15);

    let current = 15;
    intervalRef.current = setInterval(() => {
      current += Math.random() * 12 + 2;
      if (current >= 85) {
        current = 85;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
      setProgress(current);
    }, 400);
  }, [cleanup]);

  // Complete the bar when the pathname changes
  useEffect(() => {
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname;
      if (loading) {
        complete();
      }
    }
  }, [pathname, loading, complete]);

  // Listen for admin link clicks via event delegation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/admin')) return;
      if (href === pathname || href + '/' === pathname) return;

      start();
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
      cleanup();
    };
  }, [pathname, start, cleanup]);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-[#E8E3DA]/50">
      <div
        className="h-full bg-[#3D8A80] shadow-[0_0_8px_rgba(61,138,128,0.4)]"
        style={{
          width: `${progress}%`,
          transition: progress === 0
            ? 'none'
            : progress === 100
              ? 'width 200ms ease-out'
              : 'width 400ms ease-out',
        }}
      />
    </div>
  );
}
