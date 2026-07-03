'use client';

/**
 * RoutePreview — dashed animated route line + midpoint label pill for the
 * sector tier (M4). Pure SVG: the page renders it into SectorView's
 * `<g data-layer="routes">` slot with endpoints already in map pixels
 * (world coords × WORLD_SCALE) and the current zoom `k`, so the pill
 * counter-scales to constant screen size (same convention as EntityNode
 * labels). Either endpoint null = nothing to draw yet.
 */

interface RoutePreviewProps {
  /** Route endpoints in map pixels; null hides the preview. */
  fromXY: { x: number; y: number } | null;
  toXY: { x: number; y: number } | null;
  /** Pill text, e.g. "3 días · −1 combustible". */
  label: string;
  /** Current map zoom; the pill renders at 1/k (constant screen size). */
  k: number;
}

const PILL_HEIGHT = 22;

/** Width estimate for the 11px label: ~6.2px per glyph + padding. */
function pillWidth(label: string): number {
  return Math.max(48, Math.round(label.length * 6.2) + 20);
}

export function RoutePreview({ fromXY, toXY, label, k }: RoutePreviewProps) {
  if (!fromXY || !toXY) return null;

  const midX = (fromXY.x + toXY.x) / 2;
  const midY = (fromXY.y + toXY.y) / 2;
  const width = pillWidth(label);

  return (
    <g data-route-preview className="pointer-events-none">
      {/* Dash cycle is 8+6=14, so offsetting to -14 loops seamlessly. */}
      <style>{'@keyframes route-preview-dash { to { stroke-dashoffset: -14; } }'}</style>
      <line
        x1={fromXY.x}
        y1={fromXY.y}
        x2={toXY.x}
        y2={toXY.y}
        className="stroke-primary"
        strokeWidth={2}
        strokeDasharray="8 6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
        style={{ animation: 'route-preview-dash 0.8s linear infinite' }}
      />
      {/* Counter-scaled midpoint pill (constant screen size). */}
      <g transform={`translate(${midX} ${midY}) scale(${1 / k})`} className="select-none">
        <rect
          x={-width / 2}
          y={-PILL_HEIGHT / 2}
          width={width}
          height={PILL_HEIGHT}
          rx={PILL_HEIGHT / 2}
          className="fill-background stroke-primary"
          strokeWidth={1.5}
        />
        <text
          y={3.5}
          textAnchor="middle"
          className="fill-foreground text-[11px] font-medium"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
