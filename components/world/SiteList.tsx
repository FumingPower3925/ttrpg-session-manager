'use client';

/**
 * SiteList — non-spatial third map tier (plan Part B): the sites inside a
 * lugar rendered as a list panel instead of coordinates. Each row shows
 * knowledge, services and actionable-lead signals; selecting a row opens it
 * in the EntityPanel (wiring belongs to the page, not this component).
 */

import { Conocimiento, Lead, PlaceEntity } from '@/types/world';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Anchor,
  ArrowLeft,
  Briefcase,
  ChevronRight,
  EyeOff,
  Fuel,
  HeartPulse,
  Home,
  Info,
  LucideIcon,
  Music,
  Play,
  ShoppingCart,
  Star,
  Wrench,
} from 'lucide-react';

const CONOCIMIENTO_LABEL: Record<Conocimiento, string> = {
  desconocido: 'Desconocido',
  rumoreado: 'Rumoreado',
  conocido: 'Conocido',
  visitado: 'Visitado',
};

/** Closed `servicios:` vocabulary -> icon; out-of-vocab values render as text. */
const SERVICIO_ICONS: Record<string, LucideIcon> = {
  repostaje: Fuel,
  mercado: ShoppingCart,
  medico: HeartPulse,
  taller: Wrench,
  astillero: Anchor,
  trabajo: Briefcase,
  informacion: Info,
  ocio: Music,
  refugio: Home,
  contrabando: EyeOff,
};

interface SiteListProps {
  /** The lugar whose interior is being listed. */
  lugar: PlaceEntity;
  /** Child sites of `lugar` (`en:` inverse), pre-resolved by the page. */
  sites: PlaceEntity[];
  /** Pistas whose `donde` is this lugar or one of its sites. */
  leads: Lead[];
  partyLocationId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  /** Opens the ActRunner for a playable row (M5); rows without `playable` never offer it. */
  onPlay?: (id: string) => void;
}

export function SiteList({
  lugar,
  sites,
  leads,
  partyLocationId,
  onSelect,
  onBack,
  onPlay,
}: SiteListProps) {
  const actionableAt = new Set(
    leads.filter((lead) => lead.accionable === true && lead.donde).map((lead) => lead.donde as string)
  );

  const sorted = [...sites].sort((a, b) => {
    const orbitaA = a.orbita ?? Number.POSITIVE_INFINITY;
    const orbitaB = b.orbita ?? Number.POSITIVE_INFINITY;
    if (orbitaA !== orbitaB) return orbitaA - orbitaB;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-site-list={lugar.id}>
      <CardHeader className="border-b py-4">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {/* size-11 = 44px tap target (M5 sweep). */}
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver" className="size-11">
            <ArrowLeft />
          </Button>
          <span className="min-w-0 truncate">{lugar.nombre}</span>
          {actionableAt.has(lugar.id) && (
            <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Pista accionable" />
          )}
          {partyLocationId === lugar.id && <Badge className="shrink-0">Estáis aquí</Badge>}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{lugar.tipo}</Badge>
          <Badge variant="outline">{CONOCIMIENTO_LABEL[lugar.conocimiento]}</Badge>
        </div>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="py-3">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin lugares detallados — solo prosa del GM.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map((site) => (
                <li key={site.id}>
                  <SiteRow
                    site={site}
                    actionable={actionableAt.has(site.id)}
                    partyHere={site.id === partyLocationId}
                    onSelect={onSelect}
                    onPlay={onPlay}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

interface SiteRowProps {
  site: PlaceEntity;
  actionable: boolean;
  partyHere: boolean;
  onSelect: (id: string) => void;
  onPlay?: (id: string) => void;
}

// The select surface and the Jugar affordance are SIBLING buttons inside a
// styled row container (a button cannot nest another button).
function SiteRow({ site, actionable, partyHere, onSelect, onPlay }: SiteRowProps) {
  return (
    <div
      className={`flex w-full items-center rounded-md border transition-colors hover:bg-accent ${
        site.conocimiento === 'desconocido' ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        data-site-id={site.id}
        data-knowledge={site.conocimiento}
        onClick={() => onSelect(site.id)}
        className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium">{site.nombre}</span>
            {actionable && (
              <Star
                className="size-3.5 shrink-0 fill-amber-400 text-amber-500"
                aria-label="Pista accionable"
              />
            )}
            {partyHere && <Badge className="shrink-0">Estáis aquí</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary">{site.tipo}</Badge>
            <Badge variant="outline">{CONOCIMIENTO_LABEL[site.conocimiento]}</Badge>
            {site.servicios.length > 0 && (
              <span className="ml-1 flex items-center gap-1.5 text-muted-foreground">
                {site.servicios.map((servicio) => {
                  const Icon = SERVICIO_ICONS[servicio];
                  return Icon ? (
                    <span key={servicio} title={servicio} className="inline-flex">
                      <Icon className="size-3.5" aria-label={servicio} />
                    </span>
                  ) : (
                    <Badge key={servicio} variant="outline" className="text-muted-foreground">
                      {servicio}
                    </Badge>
                  );
                })}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {onPlay && site.playable && (
        <Button
          variant="ghost"
          size="icon"
          // size-11 = 44px tap target (M5 sweep).
          className="mr-1 size-11 shrink-0"
          data-play-site={site.id}
          aria-label={`Jugar ${site.nombre}`}
          title="Jugar"
          onClick={() => onPlay(site.id)}
        >
          <Play />
        </Button>
      )}
    </div>
  );
}
