'use client';

/**
 * ScrollableTabsRow — a horizontally scrollable strip for the ActRunner tab
 * row. When the row overflows it shows a left/right scroll-arrow button on the
 * overflowing side (and a subtle edge fade) so the GM always knows there are
 * more tabs off-screen; the arrows disappear at each extreme. Overflow is
 * measured from the scroll container (scrollLeft / scrollWidth / clientWidth)
 * and re-measured on scroll and on resize (ResizeObserver on both the viewport
 * and its content), so it reacts to a narrowing act panel and to tabs mounting
 * or unmounting when the part changes.
 *
 * Purely presentational: the children (the real <TabsList> + triggers) keep
 * their radix wiring untouched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** How far one arrow click nudges the row, as a fraction of the viewport. */
const SCROLL_STEP_FRACTION = 0.8;
/** Sub-pixel slack so the extremes read as "at the edge", not "1px more". */
const EDGE_EPSILON = 2;

export function ScrollableTabsRow({ children }: { children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > EDGE_EPSILON);
    setCanRight(el.scrollLeft < maxScroll - EDGE_EPSILON);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Observe the content too: tabs appearing/disappearing changes scrollWidth
    // without a viewport resize.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure]);

  const scrollByStep = useCallback((direction: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * SCROLL_STEP_FRACTION, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative flex min-w-0 items-center">
      {canLeft && (
        <>
          <button
            type="button"
            data-tabs-scroll-left
            aria-label="Desplazar pestañas a la izquierda"
            onClick={() => scrollByStep(-1)}
            className="bg-background/90 hover:bg-muted absolute left-0 z-20 flex h-8 w-7 items-center justify-center rounded-md border shadow-sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* Edge fade hinting there is more to the left. */}
          <div className="from-background pointer-events-none absolute left-7 z-10 h-full w-6 bg-gradient-to-r to-transparent" />
        </>
      )}

      <div
        ref={viewportRef}
        data-tabs-scroll
        className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {canRight && (
        <>
          <div className="from-background pointer-events-none absolute right-7 z-10 h-full w-6 bg-gradient-to-l to-transparent" />
          <button
            type="button"
            data-tabs-scroll-right
            aria-label="Desplazar pestañas a la derecha"
            onClick={() => scrollByStep(1)}
            className="bg-background/90 hover:bg-muted absolute right-0 z-20 flex h-8 w-7 items-center justify-center rounded-md border shadow-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
