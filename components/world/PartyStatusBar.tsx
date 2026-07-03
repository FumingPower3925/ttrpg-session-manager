'use client';

/**
 * PartyStatusBar — top cockpit band over the world view. READ-ONLY in M2:
 * the layout already reserves every interaction slot (breadcrumb taps work;
 * credits popover, gauge taps and the session button arrive in M3, which
 * only swaps handlers in — no re-layout).
 */

import { Fragment } from 'react';
import { PartyState } from '@/types/world';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronRight, Coins, MapPin, Play } from 'lucide-react';

const GAUGES: { key: string; label: string }[] = [
  { key: 'viveres', label: 'Víveres' },
  { key: 'combustible', label: 'Combustible' },
  { key: 'nave', label: 'Nave' },
];

interface PartyStatusBarProps {
  /** Party state from estado/grupo.md; null renders the slim hint bar. */
  estado: PartyState | null;
  /** Preformatted in-world date (page derives it from dia_mundo + manifest calendar). */
  fecha: string;
  /** Current location display name; fallback when no breadcrumb chain resolves. */
  locationName: string | null;
  /** Breadcrumb chain root -> current; each crumb taps through to the map. */
  locationPath: { id: string; label: string }[];
  onLocationClick: (id: string) => void;
  /** Pips per gauge row. */
  medidoresMax?: number;
}

export function PartyStatusBar({
  estado,
  fecha,
  locationName,
  locationPath,
  onLocationClick,
  medidoresMax = 5,
}: PartyStatusBarProps) {
  if (!estado) {
    return (
      <div
        data-party-bar
        className="flex min-h-9 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
      >
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span>
          Sin <code className="rounded bg-muted px-1">estado/grupo.md</code> — no hay datos del
          grupo.
        </span>
      </div>
    );
  }

  return (
    <div
      data-party-bar
      className="flex min-h-12 flex-wrap items-center gap-x-5 gap-y-1 border-b bg-background px-3 py-1.5"
    >
      {/* Ubicación */}
      <div className="flex min-w-0 items-center gap-1.5">
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {locationPath.length > 0 ? (
          <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-0.5">
            {locationPath.map((crumb, index) => (
              <Fragment key={crumb.id}>
                {index > 0 && (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={() => onLocationClick(crumb.id)}
                  className={`max-w-44 truncate text-sm hover:underline ${
                    index === locationPath.length - 1
                      ? 'font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {crumb.label}
                </button>
              </Fragment>
            ))}
          </nav>
        ) : (
          <span className="truncate text-sm font-medium">
            {locationName ?? 'Ubicación desconocida'}
          </span>
        )}
      </div>

      {/* Fecha */}
      <div className="flex items-center gap-1.5 text-sm">
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{fecha}</span>
        <span className="text-muted-foreground" data-dia={estado.diaMundo}>
          · día {estado.diaMundo}
        </span>
      </div>

      {/* Créditos */}
      <div className="flex items-center gap-1.5 text-sm">
        <Coins className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium tabular-nums" data-creditos={estado.creditos}>
          {estado.creditos.toLocaleString('es-ES')}
        </span>
        <span className="text-xs text-muted-foreground">cr</span>
      </div>

      {/* Medidores */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {GAUGES.map((gauge) => (
          <GaugeRow
            key={gauge.key}
            name={gauge.key}
            label={gauge.label}
            value={estado.medidores[gauge.key] ?? 0}
            max={medidoresMax}
          />
        ))}
      </div>

      {/* M3 slot: Iniciar/Terminar sesión + timer + write-status dot. */}
      <span className="ml-auto" title="Disponible en M3">
        <Button variant="outline" size="sm" disabled>
          <Play />
          Iniciar sesión
        </Button>
      </span>
    </div>
  );
}

interface GaugeRowProps {
  name: string;
  label: string;
  value: number;
  max: number;
}

/** 5-pip gauge row: filled/hollow pips, amber at <=2, destructive at <=1. */
function GaugeRow({ name, label, value, max }: GaugeRowProps) {
  const clamped = Math.max(0, Math.min(Math.round(value), max));
  const labelClass =
    clamped <= 1 ? 'text-destructive' : clamped <= 2 ? 'text-amber-500' : 'text-muted-foreground';
  const filledClass =
    clamped <= 1 ? 'bg-destructive' : clamped <= 2 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div
      className="flex items-center gap-1.5"
      data-medidor={name}
      data-valor={clamped}
      title={`${label}: ${clamped}/${max}`}
    >
      <span className={`text-xs font-medium ${labelClass}`}>{label}</span>
      <div className="flex items-center gap-0.5" role="meter" aria-label={label} aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={max}>
        {Array.from({ length: max }, (_, index) => (
          <span
            key={index}
            className={`size-2 rounded-full ${
              index < clamped ? filledClass : 'border border-muted-foreground/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
