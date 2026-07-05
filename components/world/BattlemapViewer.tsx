'use client';

/**
 * BattlemapViewer — PLAYER-SAFE fullscreen battlemap viewer for /world.
 *
 * Like FullscreenImage, the GM projects this to the players' shared screen, so
 * it NEVER renders the filename/title (a spoiler leak). Unlike FullscreenImage,
 * a battlemap is meant to be interacted with at the table, so it adds:
 *   - PAN (pointer drag) + ZOOM (wheel, clamped) of the map.
 *   - A toggleable, adjustable square GRID OVERLAY that pans/zooms WITH the map.
 *
 * Player-safety replicated from FullscreenImage: the ref-counted
 * html[data-projecting] flag (so background sonner toasts stay CSS-hidden while
 * projecting) and close on Escape or the close affordance. The GM controls
 * (grid toggle, cell +/-, close) DO show — a battlemap's grid is meant to be
 * seen — but they carry no title text and stay tiny/cornered.
 *
 * Caller owns the object-URL lifecycle (like FullscreenImage's imageUrl prop).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Grid3x3, Minus, Plus, X } from 'lucide-react';

interface BattlemapViewerProps {
  /** Resolved object URL (the caller owns the URL lifecycle/revocation). */
  imageUrl: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.1;

const MIN_CELL = 10;
const MAX_CELL = 400;
const CELL_STEP = 5;
const DEFAULT_CELL = 50;

/** Pixels the pointer must travel before a press counts as a pan (not a click). */
const DRAG_THRESHOLD_PX = 3;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

interface Viewport {
  x: number;
  y: number;
  k: number;
}

export function BattlemapViewer({ imageUrl, onClose }: BattlemapViewerProps) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [gridOn, setGridOn] = useState(false);
  const [cellSize, setCellSize] = useState(DEFAULT_CELL);
  // Grid offset in IMAGE space (pans/zooms with the map because it lives inside
  // the same transformed layer). Alt-drag nudges it to align the grid to art.
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });

  const contentRef = useRef<HTMLDivElement>(null);

  // Escape closes (window-level, mirrors FullscreenImage).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // PLAYER-SAFETY: ref-counted html[data-projecting] so background toasts stay
  // hidden while a map is on the shared screen (see FullscreenImage.tsx).
  useEffect(() => {
    const root = document.documentElement;
    const next = Number(root.dataset.projectingCount ?? '0') + 1;
    root.dataset.projectingCount = String(next);
    root.setAttribute('data-projecting', 'true');
    return () => {
      const left = Number(root.dataset.projectingCount ?? '1') - 1;
      if (left <= 0) {
        root.removeAttribute('data-projecting');
        delete root.dataset.projectingCount;
      } else {
        root.dataset.projectingCount = String(left);
      }
    };
  }, []);

  // Wheel zoom-to-cursor. Native non-passive listener so preventDefault sticks
  // (React delegates wheel as passive). Self-contained StarMap-style math.
  useEffect(() => {
    const el = contentRef.current?.parentElement;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setViewport((v) => {
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const nextK = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
        const ratio = nextK / v.k;
        // Keep the point under the cursor fixed while scaling.
        return {
          k: nextK,
          x: px - (px - v.x) * ratio,
          y: py - (py - v.y) * ratio,
        };
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    grid: boolean;
  } | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Alt/Shift drag nudges the GRID OFFSET; a plain drag pans the map.
      const grid = event.altKey || event.shiftKey;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: grid ? gridOffset.x : viewport.x,
        originY: grid ? gridOffset.y : viewport.y,
        moved: false,
        grid,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [viewport.x, viewport.y, gridOffset.x, gridOffset.y]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      if (drag.grid) {
        // Grid offset lives in image space -> divide screen delta by zoom.
        setViewport((v) => {
          setGridOffset({
            x: drag.originX + dx / v.k,
            y: drag.originY + dy / v.k,
          });
          return v;
        });
      } else {
        setViewport((v) => ({ ...v, x: drag.originX + dx, y: drag.originY + dy }));
      }
    },
    []
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }, []);

  const adjustCell = useCallback((delta: number) => {
    setCellSize((c) => clamp(c + delta, MIN_CELL, MAX_CELL));
  }, []);

  const patternId = 'battlemap-grid-pattern';

  return (
    <div
      data-battlemap-viewer
      className="fixed inset-0 z-[200] overflow-hidden bg-black"
    >
      {/* Map surface: pan/zoom happens here; the transformed layer holds both
          the image and the grid so they move together. touch-none keeps the
          browser from stealing drags for scroll/zoom gestures. */}
      <div
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
          }}
        >
          {/* Plain <img>: object URLs need no next/image; alt stays empty on
              purpose — no text may reach the shared screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="block max-w-none select-none"
          />
        </div>

        {/* GRID OVERLAY: a full-viewport SVG whose pattern carries the SAME
            pan/zoom as the image (scale k, translate = viewport + gridOffset*k),
            so cells stay locked to the art. Kept OUTSIDE the transformed layer
            so it always tiles the whole screen regardless of the image's
            intrinsic size (a huge or not-yet-decoded map still shows a grid). */}
        {gridOn && (
          <svg
            data-battlemap-grid
            className="pointer-events-none absolute inset-0 h-full w-full"
            width="100%"
            height="100%"
          >
            <defs>
              <pattern
                id={patternId}
                width={cellSize}
                height={cellSize}
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${viewport.x + gridOffset.x * viewport.k}, ${
                  viewport.y + gridOffset.y * viewport.k
                }) scale(${viewport.k})`}
              >
                {/* Double stroke (dark under, light over) so lines read on any
                    art — light or dark. Vector, so crisp at any zoom. */}
                <path
                  d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
                  fill="none"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={2}
                />
                <path
                  d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        )}
      </div>

      {/* GM controls: tiny, cornered, semi-transparent. No title text. */}
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/50 p-1 backdrop-blur-sm">
        <button
          type="button"
          data-battlemap-grid-toggle
          aria-pressed={gridOn}
          aria-label={gridOn ? 'Ocultar cuadrícula' : 'Mostrar cuadrícula'}
          onClick={() => setGridOn((on) => !on)}
          className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
            gridOn ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/15'
          }`}
        >
          <Grid3x3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-battlemap-cell-dec
          aria-label="Reducir tamaño de celda"
          disabled={!gridOn}
          onClick={() => adjustCell(-CELL_STEP)}
          className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/15 disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-battlemap-cell-inc
          aria-label="Aumentar tamaño de celda"
          disabled={!gridOn}
          onClick={() => adjustCell(CELL_STEP)}
          className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/15 disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-battlemap-close
          aria-label="Cerrar mapa"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
