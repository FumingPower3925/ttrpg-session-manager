'use client';

/**
 * ThreadLayer — the focused trama's narrative web painted on the sector map
 * (feature — Hilos de historia). Given the trama's sector-root nodes (already
 * in map pixels, from lib/world/threads.tramaThreadNodes), it draws:
 *   - a hub-and-spoke of soft colored lines from each node to the centroid
 *     (reads cleanly for any N; a single node draws no spokes, just its halo),
 *   - a colored halo ring at each node, and
 *   - a small trama-name label near the centroid.
 *
 * Pure SVG, rendered into SectorView's `threads` slot BEHIND the EntityNodes
 * (so halos back the glyphs and nothing here steals node clicks). The whole
 * group is pointer-events-none; strokes are non-scaling and the label
 * counter-scales to constant screen size (same convention as EntityNode /
 * RoutePreview labels).
 */

import { useMapScale } from './StarMap';

interface ThreadLayerProps {
  /** Sector-root nodes in map pixels; empty renders nothing. */
  nodes: { id: string; x: number; y: number }[];
  /** Rol accent color (shared TRAMA_ROL_COLOR map). */
  color: string;
  /** Trama name for the centroid label. */
  label?: string;
}

const HALO_RADIUS = 26;
const LABEL_HEIGHT = 20;

/** Width estimate for the 11px label: ~6.2px per glyph + padding. */
function pillWidth(label: string): number {
  return Math.max(40, Math.round(label.length * 6.2) + 18);
}

export function ThreadLayer({ nodes, color, label }: ThreadLayerProps) {
  const k = useMapScale();
  if (nodes.length === 0) return null;

  const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
  const width = label ? pillWidth(label) : 0;

  return (
    <g data-thread-layer className="pointer-events-none select-none">
      {/* Hub-and-spoke: a spoke from each node to the centroid. With a single
          node the centroid IS the node, so no visible line is drawn. */}
      {nodes.length > 1 &&
        nodes.map((node) => (
          <line
            key={`spoke-${node.id}`}
            x1={node.x}
            y1={node.y}
            x2={cx}
            y2={cy}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        ))}

      {/* Halo ring per node (backs the glyph). */}
      {nodes.map((node) => (
        <g key={`node-${node.id}`} data-thread-node={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r={HALO_RADIUS}
            fill={color}
            opacity={0.14}
          />
          <circle
            cx={node.x}
            cy={node.y}
            r={HALO_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        </g>
      ))}

      {/* Counter-scaled centroid label (constant screen size). */}
      {label && (
        <g transform={`translate(${cx} ${cy}) scale(${1 / k})`}>
          <rect
            x={-width / 2}
            y={-LABEL_HEIGHT / 2}
            width={width}
            height={LABEL_HEIGHT}
            rx={LABEL_HEIGHT / 2}
            className="fill-background"
            stroke={color}
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
      )}
    </g>
  );
}
