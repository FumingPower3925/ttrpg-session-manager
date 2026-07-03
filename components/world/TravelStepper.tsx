'use client';

/**
 * TravelStepper — in-travel banner (M4): the cockpit's top strip while the
 * party is en route ("Día 2 de 3 — rumbo a X"). Pure and props-driven; the
 * page owns the day loop (per-day date + consumption entries), the event
 * draw (EventDrawer) and the arrival. Cancel aborts the remaining days —
 * nothing further is logged.
 */

import { Button } from '@/components/ui/button';
import { Dices, FastForward, MoveRight, Rocket, X } from 'lucide-react';

interface TravelStepperProps {
  /** Current travel day, 1-based. */
  dia: number;
  totalDias: number;
  destinoName: string;
  /** Open the EventDrawer with the travel-context tables. */
  onDrawEvent: () => void;
  /** Advance one day (page journals date + consumption; last day = arrival). */
  onNextDay: () => void;
  /** Fast-forward the remaining days without event draws. */
  onResolveRest: () => void;
  /** Abort the remaining days; nothing further is logged. */
  onCancel: () => void;
  /** True when no event table applies to the current context. */
  eventDisabled: boolean;
}

export function TravelStepper({
  dia,
  totalDias,
  destinoName,
  onDrawEvent,
  onNextDay,
  onResolveRest,
  onCancel,
  eventDisabled,
}: TravelStepperProps) {
  const progress = totalDias > 0 ? Math.min(Math.max(dia / totalDias, 0), 1) : 0;

  return (
    <div
      data-travel-stepper
      data-dia={dia}
      data-total-dias={totalDias}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-primary/30 bg-primary/5 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Rocket className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-sm">
          <span className="font-medium tabular-nums">
            Día {dia} de {totalDias}
          </span>
          <span className="text-muted-foreground"> — rumbo a {destinoName}</span>
        </span>
      </div>

      <div
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-primary/15"
        role="progressbar"
        aria-label="Progreso del viaje"
        aria-valuenow={dia}
        aria-valuemin={0}
        aria-valuemax={totalDias}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* min-h-11 = 44px tap targets on the per-day loop (M5 sweep). */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-travel-event
          disabled={eventDisabled}
          title={eventDisabled ? 'No hay tablas de eventos aplicables' : undefined}
          onClick={onDrawEvent}
          className="min-h-11"
        >
          <Dices />
          Tirar evento de viaje
        </Button>
        <Button type="button" size="sm" data-travel-next onClick={onNextDay} className="min-h-11">
          <MoveRight />
          Continuar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-travel-rest
          onClick={onResolveRest}
          className="min-h-11"
        >
          <FastForward />
          Resolver resto sin eventos
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-travel-cancel
          onClick={onCancel}
          className="min-h-11 text-muted-foreground"
        >
          <X />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
