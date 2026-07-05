'use client';

/**
 * TravelDialog — route confirmation before travel mode starts (M4). Pure and
 * props-driven: the page computes the plan + per-day schedule
 * (lib/world/travel.ts) and handles the confirm (journal `rumbo`, arm the
 * TravelStepper); this dialog only presents it:
 *   - legs list (endpoint names + días per leg) and totals,
 *   - consumption preview as current→after pip rows (same pip language as
 *     the PartyStatusBar gauges; the "after" value clamps at 0),
 *   - red banners for plan.warnings — the confirm button stays enabled as a
 *     GM override ("Viajar igualmente", gauges clamp at 0) — each carrying
 *     the exact depletion day derived from the schedule ("Se agota el día X
 *     de Y", data-travel-agotamiento-<gauge>),
 *   - portal variant: no route calculable, confirm becomes "Registrar
 *     llegada manualmente",
 *   - no active session: the plan stays previewable (routes without a
 *     session are legit) but the confirm disables with a hint row.
 * plan === null (no computable route) renders a hint with confirm disabled.
 */

import { TravelPlan } from '@/types/world';
import { WARN_COMBUSTIBLE, WARN_VIVERES } from '@/lib/world/travel';
import type { TravelDayConsumption } from '@/lib/world/travel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, MoveRight, Play, Sparkles, TriangleAlert } from 'lucide-react';

const MEDIDOR_LABELS: Record<string, string> = {
  combustible: 'Combustible',
  viveres: 'Víveres',
};

function diasLabel(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`;
}

interface TravelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plan from computeTravelPlan; null = no computable route (confirm disabled). */
  plan: TravelPlan | null;
  /** Per-day consumption (travelDaySchedule) — backs the depletion-day hints. */
  schedule?: TravelDayConsumption[];
  /** False = viewer mode: plan previewable, confirm disabled with a hint. */
  sessionActive?: boolean;
  fromName: string;
  toName: string;
  /** Current gauges (0-5) backing the current→after preview rows. */
  medidores: Record<string, number>;
  onConfirm: () => void;
  /**
   * Optional display-name resolver for intermediate leg endpoints (sector
   * roots). Defaults to fromName/toName for the trip endpoints and the raw
   * id for anything in between.
   */
  nameFor?: (id: string) => string;
}

/** First 1-based trip day whose cumulative consumption exceeds `current`, or null. */
function depletionDay(
  schedule: TravelDayConsumption[],
  gauge: keyof TravelDayConsumption,
  current: number
): number | null {
  let acc = 0;
  for (let day = 1; day <= schedule.length; day++) {
    acc += schedule[day - 1][gauge];
    if (acc > current) return day;
  }
  return null;
}

export function TravelDialog({
  open,
  onOpenChange,
  plan,
  schedule = [],
  sessionActive = true,
  fromName,
  toName,
  medidores,
  onConfirm,
  nameFor,
}: TravelDialogProps) {
  const resolveName = (id: string): string => {
    if (nameFor) return nameFor(id);
    if (plan && plan.legs.length > 0) {
      if (id === plan.legs[0].fromId) return fromName;
      if (id === plan.legs[plan.legs.length - 1].toId) return toName;
    }
    return id;
  };

  const confirmLabel = plan?.portal
    ? 'Registrar llegada manualmente'
    : plan && plan.warnings.length > 0
      ? 'Viajar igualmente'
      : 'Viajar';

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-travel-dialog>
        <DialogHeader>
          <DialogTitle>
            Viajar: {fromName} <MoveRight className="inline size-4" aria-hidden /> {toName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Ruta propuesta con días y consumo estimado. Confirmar inicia el viaje por etapas.
          </DialogDescription>
        </DialogHeader>

        {plan === null ? (
          <p className="py-4 text-sm text-muted-foreground">
            No se puede calcular una ruta hasta este destino.
          </p>
        ) : plan.portal ? (
          <div
            data-travel-portal
            className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-medium">
                Este destino se alcanza por portal — sin ruta calculable.
              </p>
              <p className="mt-1 text-muted-foreground">
                Sin días de viaje ni consumo estimado: el GM registra la llegada manualmente.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Legs */}
            <ol className="space-y-1" data-travel-legs>
              {plan.legs.map((leg, index) => (
                <li
                  key={`${leg.fromId}-${leg.toId}`}
                  data-travel-leg={index}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {resolveName(leg.fromId)}{' '}
                    <MoveRight className="inline size-3.5 text-muted-foreground" aria-hidden />{' '}
                    {resolveName(leg.toId)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {diasLabel(leg.dias)}
                  </span>
                </li>
              ))}
            </ol>

            {/* Totals */}
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              <span data-travel-total-dias={plan.totalDias}>
                Total: {diasLabel(plan.totalDias)}
                {plan.totalCombustible > 0 && ` · −${plan.totalCombustible} combustible`}
                {plan.totalViveres > 0 && ` · −${plan.totalViveres} víveres`}
              </span>
            </p>

            {/* Consumption preview (current -> after; clamps at 0) */}
            <div className="space-y-1.5">
              <PipRow
                name="combustible"
                current={medidores['combustible'] ?? 0}
                delta={plan.totalCombustible}
              />
              <PipRow
                name="viveres"
                current={medidores['viveres'] ?? 0}
                delta={plan.totalViveres}
              />
            </div>

            {/* Insufficiency warnings — confirm stays enabled (GM override),
                each with the exact schedule-derived depletion day. */}
            {plan.warnings.map((warning) => {
              const gauge =
                warning === WARN_COMBUSTIBLE
                  ? ('combustible' as const)
                  : warning === WARN_VIVERES
                    ? ('viveres' as const)
                    : null;
              const agotamiento =
                gauge !== null ? depletionDay(schedule, gauge, medidores[gauge] ?? 0) : null;
              return (
                <div
                  key={warning}
                  data-travel-warning
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    {warning}
                  </div>
                  {gauge !== null && agotamiento !== null && (
                    <p
                      className="mt-0.5 pl-6 text-xs text-destructive/90"
                      {...{ [`data-travel-agotamiento-${gauge}`]: agotamiento }}
                    >
                      {gauge === 'viveres' ? 'Se agotan' : 'Se agota'} el día {agotamiento} de{' '}
                      {plan.totalDias} del viaje.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Viewer mode: previewing routes is legit, travelling records — hint
            instead of the old confirm-then-reject dance. */}
        {plan !== null && !sessionActive && (
          <div
            data-travel-session-hint
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            <Play className="size-4 shrink-0" aria-hidden />
            Inicia la sesión para poder viajar.
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-travel-confirm
            disabled={plan === null || !sessionActive}
            variant={plan && plan.warnings.length > 0 ? 'destructive' : 'default'}
            onClick={handleConfirm}
            className="min-h-11"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PipRowProps {
  name: string;
  /** Current gauge value (0-5). */
  current: number;
  /** Proposed consumption; "after" clamps at 0. */
  delta: number;
  max?: number;
}

/**
 * Current→after gauge preview: kept pips filled, consumed pips destructive,
 * the rest hollow — same visual language as the PartyStatusBar gauge rows.
 */
function PipRow({ name, current, delta, max = 5 }: PipRowProps) {
  const clamped = Math.max(0, Math.min(Math.round(current), max));
  const after = Math.max(0, clamped - delta);
  const label = MEDIDOR_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div
      className="flex items-center gap-2"
      data-travel-medidor={name}
      data-antes={clamped}
      data-despues={after}
    >
      <span className="w-24 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, index) => (
          <span
            key={index}
            className={`size-2 rounded-full ${
              index < after
                ? 'bg-primary'
                : index < clamped
                  ? 'bg-destructive/70'
                  : 'border border-muted-foreground/40'
            }`}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {clamped} → {after}
      </span>
    </div>
  );
}
