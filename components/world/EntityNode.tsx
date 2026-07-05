'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { MessageCircle, ShoppingCart } from 'lucide-react';
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
  /**
   * Semantic affordance badges above the node so the GM can scan a map and tell
   * shops / info spots apart at a glance. Only pass for conocido/visitado nodes
   * (the page gates on knowledge) — never reveal on ghost/rumor nodes.
   */
  affordances?: { shop?: boolean; info?: boolean };
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
  affordances,
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

  // Affordance badges: small colored discs with a lucide icon, centered ABOVE
  // the node (label is below, amber leads badge is top-right — no overlap).
  const affordanceBadges = [
    affordances?.shop
      ? {
          key: 'shop',
          Icon: ShoppingCart,
          discClass: 'fill-emerald-500 stroke-background',
        }
      : null,
    affordances?.info
      ? {
          key: 'info',
          Icon: MessageCircle,
          discClass: 'fill-sky-500 stroke-background',
        }
      : null,
  ].filter((badge): badge is NonNullable<typeof badge> => badge !== null);
  const AFFORDANCE_DISC_R = 8;
  const AFFORDANCE_ICON = 11;
  const AFFORDANCE_GAP = 3;
  const affordanceStep = AFFORDANCE_DISC_R * 2 + AFFORDANCE_GAP;
  // Center the row of discs above the glyph, clear of the top ring/badge.
  const affordanceY = -(Math.max(screenRadius, 12) + AFFORDANCE_DISC_R + 6);
  const affordanceStartX = -((affordanceBadges.length - 1) * affordanceStep) / 2;

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
      {/*
       * Invisible screen-size hit disk (M3): at low zoom the painted glyph
       * shrinks to a few pixels while the (pointer-events-none) label keeps
       * its screen size, leaving a dead gap between them where clicks fall
       * through to the map. This keeps the whole glyph+label block one big
       * (~48px) tap target — plan Part B target-size requirement.
       */}
      <g transform={`scale(${1 / k})`}>
        <circle r={Math.max(24, labelY)} className="fill-transparent" stroke="none" />
      </g>
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
        {affordanceBadges.map((badge, index) => {
          const cx = affordanceStartX + index * affordanceStep;
          const { Icon } = badge;
          return (
            <g
              key={badge.key}
              data-node-icon={badge.key}
              transform={`translate(${cx} ${affordanceY})`}
            >
              <circle
                r={AFFORDANCE_DISC_R}
                className={badge.discClass}
                strokeWidth={1.5}
              />
              <Icon
                width={AFFORDANCE_ICON}
                height={AFFORDANCE_ICON}
                x={-AFFORDANCE_ICON / 2}
                y={-AFFORDANCE_ICON / 2}
                className="stroke-white"
                strokeWidth={2}
                aria-hidden
              />
            </g>
          );
        })}
      </g>
    </g>
  );
}
