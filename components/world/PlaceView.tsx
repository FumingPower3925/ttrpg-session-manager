'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { PlaceEntity } from '@/types/world';
import { EntityNode } from './EntityNode';
import { PartyMarker } from './PartyMarker';
import { useMapScale } from './StarMap';

/** Central hub glyph radius (map units, scales with zoom like EntityNode glyphs). */
const HUB_RADIUS = 30;

/**
 * Half the map-unit extent of the local POI grid. A POI's `poi:{x,y}` runs
 * 0..100 on each axis; this maps it onto [-HALF_EXTENT, +HALF_EXTENT] around a
 * hub at (0,0), so {50,50} lands at the center. 220 keeps POIs in the same
 * ~110..250 band SystemView uses for its orbital rings, so the sistema -> place
 * tier transition feels spatially consistent.
 */
const HALF_EXTENT = 220;

/**
 * Radius of the dashed "sin ubicar" ring for POI-less children (no `poi:`
 * coords). Sits just OUTSIDE the diagonal reach of the placed POI grid
 * (√2·HALF_EXTENT ≈ 311) so unplaced children never overlap the placed
 * floor-plan region — the ring is a true outer boundary.
 */
const UNPLACED_RADIUS = Math.SQRT2 * HALF_EXTENT + 60;

/** Extra radius past the outermost content for labels + the party-marker pulse. */
const FIT_MARGIN = 50;

/** Map coords for a POI's 0..100 local coords, centered on the hub at (0,0). */
function poiToMap(poi: { x: number; y: number }): { x: number; y: number } {
  return {
    x: ((poi.x - 50) / 50) * HALF_EXTENT,
    y: ((poi.y - 50) / 50) * HALF_EXTENT,
  };
}

/**
 * Stable angular position for an unplaced child on the dashed outer ring,
 * derived from an FNV-1a 32-bit hash of the entity id mapped onto [0, 2π).
 * Same rationale as SystemView.angleForId: hashing the id (not array order)
 * keeps every node at the same angle across scans and sibling churn.
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

/**
 * Outermost content radius of a place view, for the page's fit-to-view math.
 * The hub sits at (0,0); placed POIs reach at most HALF_EXTENT along an axis
 * (and √2·HALF_EXTENT diagonally at the {0,0}/{100,100} corners). When any
 * child lacks `poi:` coords the dashed "sin ubicar" ring at UNPLACED_RADIUS
 * (which clears the diagonal reach) is the outermost content. Takes the max of
 * the applicable contributions so a mix of corner POIs + unplaced children is
 * never clipped.
 */
export function placeFitRadius(children: PlaceEntity[]): number {
  const hasUnplaced = children.some((lugar) => lugar.poi === undefined);
  // Diagonal reach of the placed POI grid ({0,0}/{100,100} corners). Always a
  // floor: the fit view must frame the full grid even with no placed children.
  const poiReach = Math.SQRT2 * HALF_EXTENT;
  const outermost = hasUnplaced ? Math.max(poiReach, UNPLACED_RADIUS) : poiReach;
  return outermost + FIT_MARGIN;
}

interface PlacedNode {
  lugar: PlaceEntity;
  x: number;
  y: number;
}

interface PlaceViewProps {
  /** The lugar whose interior (Plano) is being rendered as the hub. */
  place: PlaceEntity;
  /** The lugares whose `en === place.id` (direct children only). */
  children: PlaceEntity[];
  selectedId: string | null;
  /** Entity id where the party is; marker renders if it is the place or a POI child. */
  partyLocationId: string | null;
  /** Actionable-leads count per entity id (amber badge when > 0). */
  leadsBadgeCounts: Map<string, number>;
  /** Dominant-faction ring color per entity id; undefined = no ring. */
  factionColor: (id: string) => string | undefined;
  /** When false, `conocimiento: desconocido` entities are hidden (screen-share mode). */
  showUnknown: boolean;
  onSelect: (id: string) => void;
  /** Drill into a POI that itself has children (nested list/plano). */
  onDrillIn: (id: string) => void;
  /** Back out to the system tier (double-click on the central hub). */
  onBack: () => void;
}

/**
 * PlaceView — the third SPATIAL map tier (the "Plano"): a place's interior
 * floor-plan. A central hub glyph stands for the place itself; its child
 * lugares carrying local `poi:{x,y}` coords (0..100) render as EntityNodes at
 * their mapped positions, mirroring SystemView's node treatment (knowledge
 * styling, faction ring, leads badge, drill-in). Children WITHOUT `poi:` coords
 * are not lost — they sit on a dashed "sin ubicar" outer ring, angle-hashed
 * like SystemView's unranked places.
 *
 * The page renders this only for a place that HAS at least one poi-coord child
 * (a plano-eligible place); places without any land in SiteList instead. A
 * double-click on the hub backs out to the system tier.
 */
export function PlaceView({
  place,
  children,
  selectedId,
  partyLocationId,
  leadsBadgeCounts,
  factionColor,
  showUnknown,
  onSelect,
  onDrillIn,
  onBack,
}: PlaceViewProps) {
  const k = useMapScale();

  const visible = showUnknown
    ? children
    : children.filter((lugar) => lugar.conocimiento !== 'desconocido');

  const placed = visible.filter((lugar) => lugar.poi !== undefined);
  const unplaced = visible.filter((lugar) => lugar.poi === undefined);

  const nodes: PlacedNode[] = [
    ...placed.map((lugar) => {
      const { x, y } = poiToMap(lugar.poi!);
      return { lugar, x, y };
    }),
    ...unplaced.map((lugar) => {
      const angle = angleForId(lugar.id);
      return {
        lugar,
        x: Math.cos(angle) * UNPLACED_RADIUS,
        y: Math.sin(angle) * UNPLACED_RADIUS,
      };
    }),
  ];

  const partyNode =
    partyLocationId === null ? undefined : nodes.find((node) => node.lugar.id === partyLocationId);
  const partyAtHub = partyLocationId === place.id;

  const hubGradientId = `plano-glow-${place.id}`;
  const hubLabelY = Math.max(HUB_RADIUS * k, 12) + 16;

  const handleHubClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect(place.id);
  };

  const handleHubDoubleClick = (event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onBack();
  };

  return (
    <g data-tier="place">
      <defs>
        <radialGradient id={hubGradientId}>
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.9} />
          <stop offset="55%" stopColor="var(--primary)" stopOpacity={0.55} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Dashed "sin ubicar" ring: only when some child lacks poi coords. */}
      {unplaced.length > 0 && (
        <circle
          data-plano-ring="sin-ubicar"
          r={UNPLACED_RADIUS}
          className="fill-none stroke-border"
          strokeWidth={1}
          strokeDasharray="6 6"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Central hub: click selects the place, double-click backs out to the system. */}
      <g
        data-entity-id={place.id}
        data-knowledge={place.conocimiento}
        className="cursor-pointer"
        onClick={handleHubClick}
        onDoubleClick={handleHubDoubleClick}
      >
        {selectedId === place.id && (
          <circle
            r={HUB_RADIUS + 8}
            className="fill-none stroke-ring"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle r={HUB_RADIUS} fill={`url(#${hubGradientId})`} />
        <g transform={`scale(${1 / k})`} className="pointer-events-none select-none">
          <text
            y={hubLabelY}
            textAnchor="middle"
            paintOrder="stroke"
            strokeLinejoin="round"
            strokeWidth={3}
            className="fill-foreground stroke-background text-[12px] font-medium"
          >
            {place.nombre}
          </text>
        </g>
      </g>

      {(partyAtHub || partyNode) && (
        <PartyMarker x={partyAtHub ? 0 : partyNode!.x} y={partyAtHub ? 0 : partyNode!.y} />
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
