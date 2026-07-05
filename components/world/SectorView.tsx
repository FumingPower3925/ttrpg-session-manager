'use client';

import type { ReactNode } from 'react';
import { Conocimiento, PlaceEntity, SystemEntity } from '@/types/world';
import type { NodeAffordances } from '@/lib/world/shops';
import { WORLD_SCALE } from '@/lib/world/constants';
import { EntityNode } from './EntityNode';
import { PartyMarker } from './PartyMarker';

/**
 * Pixels per world coordinate unit (1 unit = 1 travel day, per manifest).
 * Canonical value lives in lib/world/constants.ts (so pure geometry helpers
 * can use it without pulling in this React component); re-exported here for
 * the existing SectorView consumers.
 */
export { WORLD_SCALE };

interface SectorNode {
  id: string;
  nombre: string;
  tipo: string;
  conocimiento: Conocimiento;
  x: number;
  y: number;
  /** `acceso: portal` (deep-space lugares only) renders the bracket glyph. */
  portal?: boolean;
}

interface SectorViewProps {
  sistemas: SystemEntity[];
  /** Deep-space places with own `coordenadas` (nodos, bolsillos, puntos...). */
  deepSpace: PlaceEntity[];
  selectedId: string | null;
  /** Entity id where the party is; the marker renders if that entity is on this tier. */
  partyLocationId: string | null;
  /** Actionable-leads count per entity id (amber badge when > 0). */
  leadsBadgeCounts: Map<string, number>;
  /** Dominant-faction ring color per entity id; undefined = no ring. */
  factionColor: (id: string) => string | undefined;
  /** Semantic affordance badges (shop/info) per entity id; undefined = none. */
  nodeIconsFor: (id: string) => NodeAffordances | undefined;
  /** When false, `conocimiento: desconocido` entities are hidden (screen-share mode). */
  showUnknown: boolean;
  onSelect: (id: string) => void;
  onDrillIn: (id: string) => void;
  /** M4 slot: RoutePreview content rendered into the routes layer. */
  routes?: ReactNode;
  /**
   * Story-threads slot ("Hilos" feature): a ThreadLayer overlay painting the
   * focused trama's narrative web. Rendered BEHIND the EntityNodes so the node
   * glyphs stay clickable and the halos sit under them.
   */
  threads?: ReactNode;
}

export function SectorView({
  sistemas,
  deepSpace,
  selectedId,
  partyLocationId,
  leadsBadgeCounts,
  factionColor,
  nodeIconsFor,
  showUnknown,
  onSelect,
  onDrillIn,
  routes,
  threads,
}: SectorViewProps) {
  const nodes: SectorNode[] = [
    ...sistemas.map((sistema) => ({
      id: sistema.id,
      nombre: sistema.nombre,
      tipo: sistema.tipo,
      conocimiento: sistema.conocimiento,
      x: sistema.coordenadas.x * WORLD_SCALE,
      y: sistema.coordenadas.y * WORLD_SCALE,
    })),
    ...deepSpace.flatMap((lugar) =>
      lugar.coordenadas
        ? [
            {
              id: lugar.id,
              nombre: lugar.nombre,
              tipo: lugar.tipo,
              conocimiento: lugar.conocimiento,
              x: lugar.coordenadas.x * WORLD_SCALE,
              y: lugar.coordenadas.y * WORLD_SCALE,
              portal: lugar.acceso === 'portal',
            },
          ]
        : []
    ),
  ];

  const visible = showUnknown
    ? nodes
    : nodes.filter((node) => node.conocimiento !== 'desconocido');

  const partyNode = partyLocationId
    ? nodes.find((node) => node.id === partyLocationId)
    : undefined;

  return (
    <>
      {/* Hilos slot: the focused trama's thread web sits UNDER the nodes so
          halos back the glyphs and never steal their clicks. */}
      <g data-layer="threads">{threads}</g>
      {/* M4 slot: RoutePreview renders travel lines into this layer. */}
      <g data-layer="routes">{routes}</g>
      {partyNode && <PartyMarker x={partyNode.x} y={partyNode.y} />}
      {visible.map((node) => (
        <EntityNode
          key={node.id}
          id={node.id}
          nombre={node.nombre}
          tipo={node.tipo}
          conocimiento={node.conocimiento}
          selected={node.id === selectedId}
          faccionColor={factionColor(node.id)}
          leadsCount={leadsBadgeCounts.get(node.id)}
          affordances={nodeIconsFor(node.id)}
          onSelect={onSelect}
          onDrillIn={onDrillIn}
          x={node.x}
          y={node.y}
          shape={node.portal ? 'diamond' : undefined}
          portal={node.portal}
        />
      ))}
    </>
  );
}
