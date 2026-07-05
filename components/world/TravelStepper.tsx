'use client';

/**
 * TravelStepper — in-travel banner (M4): the cockpit's top strip while the
 * party is en route ("Día 2 de 3 — rumbo a X"). Pure and props-driven; the
 * page owns the day loop (per-day date + consumption entries), the event
 * draw (EventDrawer) and the arrival. Cancel aborts the remaining days —
 * nothing further is logged — behind a small confirm popover: it sits next
 * to "Resolver resto" and a misclick would silently abort the trip.
 */

import { useEffect, useRef, useState } from 'react';
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
  // Day `dia` is ABOUT to be traveled: the bar fills with completed days.
  const progress = totalDias > 0 ? Math.min(Math.max((dia - 1) / totalDias, 0), 1) : 0;

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
        aria-valuenow={dia - 1}
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
        <CancelTravelButton destinoName={destinoName} onCancel={onCancel} />
      </div>
    </div>
  );
}

/** "Cancelar" behind a confirm popover (same pattern as Terminar sesión). */
function CancelTravelButton({
  destinoName,
  onCancel,
}: {
  destinoName: string;
  onCancel: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setConfirmOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmOpen]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-travel-cancel
        aria-expanded={confirmOpen}
        onClick={() => setConfirmOpen((open) => !open)}
        className="min-h-11 text-muted-foreground"
      >
        <X />
        Cancelar
      </Button>
      {confirmOpen && (
        <div
          data-travel-cancel-confirm-popover
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p className="text-sm font-medium">¿Cancelar el viaje a {destinoName}?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            El grupo mantiene su posición; los días ya avanzados no se devuelven.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              className="min-h-11"
            >
              Seguir viajando
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-travel-cancel-confirm
              onClick={() => {
                setConfirmOpen(false);
                onCancel();
              }}
              className="min-h-11"
            >
              Cancelar viaje
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
