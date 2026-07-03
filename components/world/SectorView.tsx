'use client';

import { Conocimiento, PlaceEntity, SystemEntity } from '@/types/world';
import { EntityNode } from './EntityNode';
import { PartyMarker } from './PartyMarker';

/** Pixels per world coordinate unit (1 unit = 1 travel day, per manifest). */
export const WORLD_SCALE = 60;

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
  /** When false, `conocimiento: desconocido` entities are hidden (screen-share mode). */
  showUnknown: boolean;
  onSelect: (id: string) => void;
  onDrillIn: (id: string) => void;
}

export function SectorView({
  sistemas,
  deepSpace,
  selectedId,
  partyLocationId,
  leadsBadgeCounts,
  factionColor,
  showUnknown,
  onSelect,
  onDrillIn,
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
      {/* M4 slot: RoutePreview renders travel lines into this layer. */}
      <g data-layer="routes" />
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
