'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { PlaceEntity, SystemEntity } from '@/types/world';
import { EntityNode } from './EntityNode';
import { PartyMarker } from './PartyMarker';
import { useMapScale } from './StarMap';

/** Central star glyph radius (map units, scales with zoom like EntityNode glyphs). */
const STAR_RADIUS = 36;
/** Radius of the innermost orbital ring. */
const FIRST_RING_RADIUS = 110;
/** Radial distance between consecutive orbital rings. */
const RING_STEP = 70;

/**
 * Stable angular position for a place on its ring, derived from an FNV-1a
 * 32-bit hash of the entity id mapped onto [0, 2π). Hashing the id (rather
 * than using array order) keeps every node at the same angle across scans,
 * renames of siblings, and added/removed files — the map never "shuffles".
 */
function angleForId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 0 coerces to uint32; divide by 2^32 for a stable fraction of the circle.
  return ((hash >>> 0) / 0x100000000) * 2 * Math.PI;
}

/** Extra radius past the outermost ring for labels + the party-marker pulse. */
const FIT_MARGIN = 50;

/**
 * Outermost content radius of a system view, for the page's fit-to-view math.
 * Mirrors the ring layout below: one ring per distinct `orbita` plus the
 * dashed outer ring when any place lacks one; an empty system is just the
 * star, padded to the first ring.
 */
export function systemFitRadius(children: PlaceEntity[]): number {
  const orbitas = new Set(
    children
      .map((lugar) => lugar.orbita)
      .filter((orbita): orbita is number => orbita !== undefined)
  );
  const hasUnranked = children.some((lugar) => lugar.orbita === undefined);
  const ringCount = orbitas.size + (hasUnranked ? 1 : 0);
  const outermost =
    ringCount === 0 ? FIRST_RING_RADIUS : FIRST_RING_RADIUS + (ringCount - 1) * RING_STEP;
  return outermost + FIT_MARGIN;
}

interface PlacedNode {
  lugar: PlaceEntity;
  x: number;
  y: number;
}

interface SystemViewProps {
  sistema: SystemEntity;
  /** The lugares whose `en === sistema.id` (direct children only). */
  children: PlaceEntity[];
  selectedId: string | null;
  /** Entity id where the party is; marker renders if it is the sistema or a child. */
  partyLocationId: string | null;
  /** Actionable-leads count per entity id (amber badge when > 0). */
  leadsBadgeCounts: Map<string, number>;
  /** Dominant-faction ring color per entity id; undefined = no ring. */
  factionColor: (id: string) => string | undefined;
  /** When false, `conocimiento: desconocido` entities are hidden (screen-share mode). */
  showUnknown: boolean;
  onSelect: (id: string) => void;
  /** Drill into a place whose children form a site list (tier 3). */
  onDrillIn: (id: string) => void;
  /** Back out to the sector tier (double-click on the central star). */
  onBack: () => void;
}

export function SystemView({
  sistema,
  children,
  selectedId,
  partyLocationId,
  leadsBadgeCounts,
  factionColor,
  showUnknown,
  onSelect,
  onDrillIn,
  onBack,
}: SystemViewProps) {
  const k = useMapScale();

  const visible = showUnknown
    ? children
    : children.filter((lugar) => lugar.conocimiento !== 'desconocido');

  // One ring per distinct orbita value, sorted ascending: orbita N is an
  // ORDERING, not a distance — ring index sets the radius.
  const orbitas = [...new Set(
    visible
      .map((lugar) => lugar.orbita)
      .filter((orbita): orbita is number => orbita !== undefined)
  )].sort((a, b) => a - b);
  const ringRadius = new Map(
    orbitas.map((orbita, index) => [orbita, FIRST_RING_RADIUS + index * RING_STEP])
  );

  // Places without orbita share an extra outermost ring, drawn dashed.
  const unranked = visible.filter((lugar) => lugar.orbita === undefined);
  const outerRadius = FIRST_RING_RADIUS + orbitas.length * RING_STEP;

  const nodes: PlacedNode[] = visible.map((lugar) => {
    const radius = lugar.orbita !== undefined ? ringRadius.get(lugar.orbita)! : outerRadius;
    const angle = angleForId(lugar.id);
    return {
      lugar,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const partyNode =
    partyLocationId === null ? undefined : nodes.find((node) => node.lugar.id === partyLocationId);
  const partyAtStar = partyLocationId === sistema.id;

  const starGradientId = `star-glow-${sistema.id}`;
  const starLabelY = Math.max(STAR_RADIUS * k, 12) + 16;

  const handleStarClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect(sistema.id);
  };

  const handleStarDoubleClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onBack();
  };

  return (
    <g data-tier="system">
      <defs>
        <radialGradient id={starGradientId}>
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.95} />
          <stop offset="45%" stopColor="var(--primary)" stopOpacity={0.75} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Orbital rings (drawn first, under everything). */}
      {orbitas.map((orbita) => (
        <circle
          key={orbita}
          data-orbit-ring={orbita}
          r={ringRadius.get(orbita)}
          className="fill-none stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {unranked.length > 0 && (
        <circle
          data-orbit-ring="sin-orbita"
          r={outerRadius}
          className="fill-none stroke-border"
          strokeWidth={1}
          strokeDasharray="6 6"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Central star: click selects the sistema, double-click backs out to the sector. */}
      <g
        data-entity-id={sistema.id}
        data-knowledge={sistema.conocimiento}
        className="cursor-pointer"
        onClick={handleStarClick}
        onDoubleClick={handleStarDoubleClick}
      >
        {selectedId === sistema.id && (
          <circle
            r={STAR_RADIUS + 8}
            className="fill-none stroke-ring"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle r={STAR_RADIUS} fill={`url(#${starGradientId})`} />
        <g transform={`scale(${1 / k})`} className="pointer-events-none select-none">
          <text
            y={starLabelY}
            textAnchor="middle"
            paintOrder="stroke"
            strokeLinejoin="round"
            strokeWidth={3}
            className="fill-foreground stroke-background text-[12px] font-medium"
          >
            {sistema.nombre}
          </text>
        </g>
      </g>

      {(partyAtStar || partyNode) && (
        <PartyMarker x={partyAtStar ? 0 : partyNode!.x} y={partyAtStar ? 0 : partyNode!.y} />
      )}

      {nodes.map(({ lugar, x, y }) => (
        <EntityNode
          key={lugar.id}
          id={lugar.id}
          nombre={lugar.nombre}
          tipo={lugar.tipo}
          conocimiento={lugar.conocimiento}
          selected={lugar.id === selectedId}
          faccionColor={factionColor(lugar.id)}
          leadsCount={leadsBadgeCounts.get(lugar.id)}
          onSelect={onSelect}
          onDrillIn={onDrillIn}
          x={x}
          y={y}
          shape={lugar.acceso === 'portal' ? 'diamond' : undefined}
          portal={lugar.acceso === 'portal'}
        />
      ))}
    </g>
  );
}
