'use client';

/**
 * HilosBoard — the "Hilos" (story threads) right-panel tab: the campaign's
 * tramas (story arcs) with their child pistas, key places, factions, clock
 * beats, plus a "Ver en el mapa" toggle that paints the trama's narrative web
 * on the sector map. The in-app live version of the campaign's
 * _MAPA_DE_HILOS.md cheat-sheet.
 *
 * Pure and props-driven (mirrors LeadsBoard): the page passes the scanned
 * tramas, the focused trama id, a focus toggle and a place-name resolver.
 * Tramas group by rol (principal, then secundaria, then ambiental) with a rol
 * color accent shared with the map ThreadLayer (TRAMA_ROL_COLOR), so the tab
 * and the painted web match.
 *
 * Test hooks: data-hilos-panel, data-hilo-id, data-hilo-focus (the map toggle,
 * highlighted when focusTramaId === id), data-hilo-pista.
 */

import type { Trama } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TRAMA_ROL_COLOR } from '@/lib/world/threads';
import { Clock, MapPin, Star, Users } from 'lucide-react';

const ROL_ORDER: Trama['rol'][] = ['principal', 'secundaria', 'ambiental'];

const ROL_LABEL: Record<Trama['rol'], string> = {
  principal: 'Principal',
  secundaria: 'Secundaria',
  ambiental: 'Ambiental',
};

const ESTADO_TRAMA_LABEL: Record<Trama['estadoTrama'], string> = {
  latente: 'Latente',
  activa: 'Activa',
  cerrada: 'Cerrada',
};

const ESTADO_TRAMA_CLASS: Record<Trama['estadoTrama'], string> = {
  latente: 'border-transparent bg-muted text-muted-foreground',
  activa: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cerrada: 'border-transparent bg-muted text-muted-foreground line-through',
};

const ESTADO_PISTA_LABEL: Record<string, string> = {
  rumor: 'Rumor',
  activa: 'Activa',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
  fallida: 'Fallida',
};

interface HilosBoardProps {
  tramas: Trama[];
  /** Currently painted trama; drives the "Ver en el mapa" active state. */
  focusTramaId: string | null;
  /** Toggle the map web for a trama (page wires the uiStore focusTrama). */
  onFocusTrama: (id: string) => void;
  /** Resolves a lugar id to its display name (falls back to the id). */
  placeNombre?: (id: string) => string | undefined;
}

export function HilosBoard({ tramas, focusTramaId, onFocusTrama, placeNombre }: HilosBoardProps) {
  const groups = ROL_ORDER.map((rol) => ({
    rol,
    tramas: tramas.filter((t) => t.rol === rol),
  })).filter((g) => g.tramas.length > 0);

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-hilos-panel>
      {tramas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay tramas en este mundo.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group.rol} data-hilos-group={group.rol}>
              <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {ROL_LABEL[group.rol]}
              </p>
              <div className="space-y-2">
                {group.tramas.map((trama) => (
                  <TramaCard
                    key={trama.id}
                    trama={trama}
                    focused={focusTramaId === trama.id}
                    onFocusTrama={onFocusTrama}
                    placeNombre={placeNombre}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface TramaCardProps {
  trama: Trama;
  focused: boolean;
  onFocusTrama: (id: string) => void;
  placeNombre?: (id: string) => string | undefined;
}

function TramaCard({ trama, focused, onFocusTrama, placeNombre }: TramaCardProps) {
  const accent = TRAMA_ROL_COLOR[trama.rol];
  const hasBody = trama.body.trim().length > 0;
  const nombre = (id: string) => placeNombre?.(id) ?? id;

  return (
    <div
      data-hilo-id={trama.id}
      className="rounded-md border-l-4 border border-l-current bg-card p-3"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{trama.nombre}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge className={ESTADO_TRAMA_CLASS[trama.estadoTrama]}>
              {ESTADO_TRAMA_LABEL[trama.estadoTrama]}
            </Badge>
            {trama.reloj && (
              <span
                data-hilo-reloj
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                <Clock className="size-3 shrink-0" aria-hidden />
                {trama.reloj.actual}/{trama.reloj.max}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant={focused ? 'secondary' : 'outline'}
          size="sm"
          data-hilo-focus={trama.id}
          aria-pressed={focused}
          onClick={() => onFocusTrama(trama.id)}
          className="min-h-11 shrink-0 px-2 text-xs"
          title="Pintar la trama en el mapa del sector"
        >
          <MapPin className="size-3.5" aria-hidden />
          {focused ? 'En el mapa' : 'Ver en el mapa'}
        </Button>
      </div>

      {trama.estado && trama.estado.trim().length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{trama.estado}</p>
      )}

      {trama.pistas.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {trama.pistas.map((pista) => (
            <li
              key={pista.id}
              data-hilo-pista={pista.id}
              className="flex items-start gap-1.5 text-xs"
            >
              {pista.accionable === true && (
                <Star
                  className="mt-0.5 size-3 shrink-0 fill-amber-400 text-amber-400"
                  aria-label="Accionable"
                />
              )}
              <span className="min-w-0 flex-1 break-words">
                {pista.nombre}
                {pista.donde && (
                  <span className="text-muted-foreground"> · en {nombre(pista.donde)}</span>
                )}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                {ESTADO_PISTA_LABEL[pista.estadoPista] ?? pista.estadoPista}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {(trama.lugaresClave.length > 0 || trama.facciones.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {trama.lugaresClave.map((id) => (
            <span
              key={`lugar-${id}`}
              data-hilo-lugar={id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <MapPin className="size-3 shrink-0" aria-hidden />
              {nombre(id)}
            </span>
          ))}
          {trama.facciones.map((id) => (
            <span
              key={`faccion-${id}`}
              data-hilo-faccion={id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <Users className="size-3 shrink-0" aria-hidden />
              {nombre(id)}
            </span>
          ))}
        </div>
      )}

      {hasBody && (
        <div className="mt-2 border-t pt-2">
          <MarkdownViewer content={trama.body} className="prose-sm" />
        </div>
      )}
    </div>
  );
}
