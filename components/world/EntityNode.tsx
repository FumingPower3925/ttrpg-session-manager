'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { Conocimiento } from '@/types/world';
import { useMapScale } from './StarMap';

/** Node glyph radius in world units (scales with zoom; labels/badges do not). */
const NODE_RADIUS = 10;

const DIAMOND_PATH = `M 0 ${-NODE_RADIUS} L ${NODE_RADIUS} 0 L 0 ${NODE_RADIUS} L ${-NODE_RADIUS} 0 Z`;

/** Radius of the portal bracket arcs (between the faction ring and the selection ring). */
const PORTAL_RADIUS = NODE_RADIUS + 6;

function portalArc(startDeg: number, endDeg: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const x = (PORTAL_RADIUS * Math.cos(rad)).toFixed(2);
    const y = (PORTAL_RADIUS * Math.sin(rad)).toFixed(2);
    return `${x} ${y}`;
  };
  // Spans stay under 180°, so large-arc is always 0; sweep 1 follows increasing angle.
  return `M ${point(startDeg)} A ${PORTAL_RADIUS} ${PORTAL_RADIUS} 0 0 1 ${point(endDeg)}`;
}

/**
 * Portal glyph (`acceso: portal`): two bracket arcs framing the node, with
 * ring gaps at the top and bottom — reads as "step through here", and the
 * gaps keep it distinct from the (closed) faction and selection rings.
 */
const PORTAL_ARCS = [portalArc(115, 245), portalArc(-65, 65)];

/**
 * Knowledge visual encoding (plan Part B):
 * desconocido = 15%-opacity ghost, outline only · rumoreado = dashed, no fill,
 * muted label · conocido = solid stroke, hollow · visitado = filled.
 */
const SHAPE_CLASS: Record<Conocimiento, string> = {
  desconocido: 'fill-none stroke-foreground',
  rumoreado: 'fill-none stroke-foreground',
  conocido: 'fill-background stroke-foreground',
  visitado: 'fill-primary stroke-primary',
};

const LABEL_CLASS: Record<Conocimiento, string> = {
  desconocido: 'fill-muted-foreground',
  rumoreado: 'fill-muted-foreground',
  conocido: 'fill-foreground',
  visitado: 'fill-foreground',
};

interface EntityNodeProps {
  id: string;
  nombre: string;
  tipo: string;
  conocimiento: Conocimiento;
  selected: boolean;
  /** Dominant-faction ring color; undefined = no ring. */
  faccionColor?: string;
  /** Actionable-leads count; > 0 renders the amber badge. */
  leadsCount?: number;
  onSelect: (id: string) => void;
  onDrillIn: (id: string) => void;
  x: number;
  y: number;
  /** Defaults to diamond for tipo nodo/bolsillo, circle otherwise. */
  shape?: 'circle' | 'diamond';
  /** `acceso: portal` marker: bracket arcs overlay around the node. */
  portal?: boolean;
}

export function EntityNode({
  id,
  nombre,
  tipo,
  conocimiento,
  selected,
  faccionColor,
  leadsCount,
  onSelect,
  onDrillIn,
  x,
  y,
  shape,
  portal,
}: EntityNodeProps) {
  const k = useMapScale();
  const resolvedShape = shape ?? (tipo === 'nodo' || tipo === 'bolsillo' ? 'diamond' : 'circle');
  const shapeClass = SHAPE_CLASS[conocimiento];
  const dashArray = conocimiento === 'rumoreado' ? '4 3' : undefined;

  // Label/badge live in a counter-scaled (1/k) group, so their offsets are in
  // screen pixels and must account for the on-screen size of the glyph (r·k).
  const screenRadius = NODE_RADIUS * k;
  const labelY = Math.max(screenRadius, 12) + 14;
  const badgeOffset = Math.max(screenRadius * 0.8, 10);

  const handleClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect(id);
  };

  const handleDoubleClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onDrillIn(id);
  };

  return (
    <g
      data-entity-id={id}
      data-knowledge={conocimiento}
      transform={`translate(${x} ${y})`}
      opacity={conocimiento === 'desconocido' ? 0.15 : 1}
      className="cursor-pointer"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {selected && (
        <circle
          r={NODE_RADIUS + 8}
          className="fill-none stroke-ring"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {faccionColor && (
        <circle
          r={NODE_RADIUS + 4}
          fill="none"
          stroke={faccionColor}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {portal && (
        <g data-portal="true">
          {PORTAL_ARCS.map((d) => (
            <path
              key={d}
              d={d}
              className="fill-none stroke-foreground"
              strokeWidth={1.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />
          ))}
        </g>
      )}
      {resolvedShape === 'circle' ? (
        <circle
          r={NODE_RADIUS}
          className={shapeClass}
          strokeWidth={2}
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <path
          d={DIAMOND_PATH}
          className={shapeClass}
          strokeWidth={2}
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Counter-scaled overlay: constant screen-size label + leads badge. */}
      <g transform={`scale(${1 / k})`} className="pointer-events-none select-none">
        <text
          y={labelY}
          textAnchor="middle"
          paintOrder="stroke"
          strokeLinejoin="round"
          strokeWidth={3}
          className={`${LABEL_CLASS[conocimiento]} stroke-background text-[11px]`}
        >
          {nombre}
        </text>
        {leadsCount !== undefined && leadsCount > 0 && (
          <g transform={`translate(${badgeOffset} ${-badgeOffset})`}>
            <circle r={8} className="fill-amber-500 stroke-background" strokeWidth={1.5} />
            <text
              y={3}
              textAnchor="middle"
              className="fill-amber-950 text-[10px] font-semibold"
            >
              {leadsCount}
            </text>
          </g>
        )}
      </g>
    </g>
  );
}
