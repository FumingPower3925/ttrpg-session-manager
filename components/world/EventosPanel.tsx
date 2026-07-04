'use client';

/**
 * EventosPanel — the "En curso" right-panel tab (feature 1).
 *
 * Pure and props-driven: the page derives the ongoing (parked) events from the
 * live session journal (deriveOngoing over session.entries + model.tablas) and
 * hands them here. Each row surfaces a parked event — a fight that started, a
 * negotiation in progress — the GM can REOPEN to apply more efectos or pick a
 * final outcome (which drops it from this list).
 *
 * Row contract (test hooks): the row carries data-ongoing-event="<tabla>#<id>"
 * and data-ongoing-open; clicking it calls onReopen(tabla, id). An optional
 * onResolveQuick renders a small "Resolver" shortcut (data-ongoing-resolve)
 * that closes the thread without reopening the drawer. Empty state renders
 * data-eventos-empty with a Spanish hint.
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, Swords } from 'lucide-react';
import type { OngoingEvent } from '@/lib/world/ongoingEvents';

export interface EventosPanelProps {
  eventos: OngoingEvent[];
  /** Reopen the parked event in the EventDrawer (apply more / final outcome). */
  onReopen: (tabla: string, id: string) => void;
  /** Optional one-tap resolution shortcut (closes the thread, no drawer). */
  onResolveQuick?: (tabla: string, id: string) => void;
}

export function EventosPanel({ eventos, onReopen, onResolveQuick }: EventosPanelProps) {
  if (eventos.length === 0) {
    return (
      <div
        data-eventos-panel
        data-eventos-empty
        className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card py-10 text-center"
      >
        <Swords className="size-6 text-muted-foreground" aria-hidden />
        <p className="px-4 text-sm text-muted-foreground">Sin eventos en curso.</p>
      </div>
    );
  }

  return (
    <div data-eventos-panel className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border bg-card">
      <ul className="divide-y">
        {eventos.map((evento) => (
          <li key={`${evento.tabla}#${evento.id}`}>
            <div className="flex items-start gap-2 px-3 py-2">
              {/* The row body opens the event; a corner action closes it. */}
              <button
                type="button"
                data-ongoing-event={`${evento.tabla}#${evento.id}`}
                data-ongoing-open
                onClick={() => onReopen(evento.tabla, evento.id)}
                className="min-h-11 flex-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{evento.titulo}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {evento.tablaNombre}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  {evento.hora}
                </div>
              </button>
              {onResolveQuick && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Resolver ${evento.titulo}`}
                  title="Resolver"
                  data-ongoing-resolve={`${evento.tabla}#${evento.id}`}
                  onClick={() => onResolveQuick(evento.tabla, evento.id)}
                  className="size-11 shrink-0"
                >
                  <Check className="text-emerald-600 dark:text-emerald-400" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
