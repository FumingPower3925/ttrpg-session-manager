'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react';

/** Viewport applied to the map content: `translate(x, y) scale(k)`. */
export interface MapViewport {
  x: number;
  y: number;
  k: number;
}

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;
/** Pixels the pointer must travel before a press becomes a pan (protects node clicks). */
const DRAG_THRESHOLD_PX = 4;
/** Quiet period after the last wheel tick before the zoom gesture counts as finished. */
const WHEEL_SETTLE_MS = 250;
/** Wheel delta → zoom factor sensitivity. */
const WHEEL_ZOOM_SPEED = 0.002;

const MapScaleContext = createContext(1);

/**
 * Current zoom factor `k` of the enclosing StarMap. Map children (EntityNode)
 * counter-scale labels/badges by `1/k` so text stays a constant screen size.
 *
 * Tradeoff: the `<g>` transform is applied imperatively via `setAttribute`
 * during gestures (60fps pan/zoom with zero React re-renders), but the
 * counter-scale needs React, so `k` is mirrored into state at most once per
 * animation frame while zooming. Labels may trail the geometry by one frame
 * mid-zoom; panning never triggers a re-render at all.
 */
export function useMapScale(): number {
  return useContext(MapScaleContext);
}

interface StarMapProps {
  /** The tier view (SVG content), e.g. `<SectorView />`. */
  children: ReactNode;
  viewport?: MapViewport;
  /** Called once per finished gesture (pointer released / wheel settled). */
  onViewportChange?: (viewport: MapViewport) => void;
  breadcrumb: BreadcrumbItem[];
  /** Whether `conocimiento: desconocido` entities render (ghosted) or hide. */
  showUnknown: boolean;
  onToggleUnknown: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Optional extra overlay content (top-center), e.g. a tier hint. */
  header?: ReactNode;
}

/** Subtle repeating star field — pure CSS, theme-aware, no images. */
const STARFIELD_STYLE: CSSProperties = {
  backgroundImage: [
    'radial-gradient(1px 1px at 22% 31%, color-mix(in oklab, var(--foreground) 55%, transparent), transparent)',
    'radial-gradient(1px 1px at 64% 78%, color-mix(in oklab, var(--foreground) 40%, transparent), transparent)',
    'radial-gradient(1.5px 1.5px at 83% 12%, color-mix(in oklab, var(--foreground) 30%, transparent), transparent)',
    'radial-gradient(1px 1px at 41% 57%, color-mix(in oklab, var(--foreground) 22%, transparent), transparent)',
  ].join(', '),
  backgroundSize: '210px 210px, 290px 290px, 370px 370px, 450px 450px',
};

function toTransform(viewport: MapViewport): string {
  return `translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`;
}

interface DragState {
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  /** True once the drag threshold was crossed and the pointer is captured. */
  active: boolean;
}

export function StarMap({
  children,
  viewport,
  onViewportChange,
  breadcrumb,
  showUnknown,
  onToggleUnknown,
  collapsed,
  onToggleCollapsed,
  header,
}: StarMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const viewRef = useRef<MapViewport>(viewport ? { ...viewport } : { x: 0, y: 0, k: 1 });
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const wheelEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportChangeRef = useRef(onViewportChange);

  // React only tracks k, for the label counter-scale (see useMapScale docs).
  const [k, setK] = useState(viewRef.current.k);

  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const applyTransform = useCallback(() => {
    gRef.current?.setAttribute('transform', toTransform(viewRef.current));
  }, []);

  /** Mirror k into React state at most once per animation frame. */
  const scheduleScaleSync = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setK(viewRef.current.k);
    });
  }, []);

  const emitViewportChange = useCallback(() => {
    viewportChangeRef.current?.({ ...viewRef.current });
  }, []);

  // Adopt an externally-provided viewport (e.g. restored persistence, tier change).
  useEffect(() => {
    if (!viewport) return;
    const current = viewRef.current;
    if (viewport.x === current.x && viewport.y === current.y && viewport.k === current.k) return;
    viewRef.current = { ...viewport };
    applyTransform();
    setK(viewport.k);
  }, [viewport, applyTransform]);

  // Wheel zoom-to-cursor. Native listener: React delegates wheel as passive,
  // so preventDefault() (needed to stop page scroll) only works here.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const view = viewRef.current;
      const nextK = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, view.k * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED))
      );
      // Keep the world point under the cursor fixed while k changes.
      view.x = cursorX - ((cursorX - view.x) / view.k) * nextK;
      view.y = cursorY - ((cursorY - view.y) / view.k) * nextK;
      view.k = nextK;
      applyTransform();
      scheduleScaleSync();
      if (wheelEndRef.current !== null) clearTimeout(wheelEndRef.current);
      wheelEndRef.current = setTimeout(() => {
        wheelEndRef.current = null;
        viewportChangeRef.current?.({ ...viewRef.current });
      }, WHEEL_SETTLE_MS);
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [collapsed, applyTransform, scheduleScaleSync]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (wheelEndRef.current !== null) clearTimeout(wheelEndRef.current);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      // Button released outside the map — abandon the press.
      dragRef.current = null;
      return;
    }
    if (!drag.active) {
      const travelled = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      // Capture only once panning starts, so plain clicks keep targeting nodes.
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.active = true;
    }
    viewRef.current.x += event.clientX - drag.lastX;
    viewRef.current.y += event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    applyTransform();
  };

  const handlePointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.active) emitViewportChange();
  };

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
        <Breadcrumbs items={breadcrumb} />
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            title="Expandir mapa"
            aria-label="Expandir mapa"
          >
            <Maximize2 />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg border bg-background"
      style={STARFIELD_STYLE}
    >
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        role="application"
        aria-label="Mapa del sector"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <g ref={gRef} transform={toTransform(viewRef.current)}>
          <MapScaleContext.Provider value={k}>{children}</MapScaleContext.Provider>
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex items-center rounded-md border bg-background/80 px-2 py-1 backdrop-blur-sm">
          <Breadcrumbs items={breadcrumb} />
        </div>
        {header && <div className="pointer-events-auto">{header}</div>}
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border bg-background/80 p-1 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleUnknown}
            title={showUnknown ? 'Ocultar entidades desconocidas' : 'Mostrar entidades desconocidas'}
            aria-label={
              showUnknown ? 'Ocultar entidades desconocidas' : 'Mostrar entidades desconocidas'
            }
            aria-pressed={showUnknown}
          >
            {showUnknown ? <Eye /> : <EyeOff />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            title="Plegar mapa"
            aria-label="Plegar mapa"
          >
            <Minimize2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Ruta del mapa" className="flex items-center gap-0.5 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-0.5">
            {index > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </button>
            ) : (
              <span className={`px-1 py-0.5 ${isLast ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
