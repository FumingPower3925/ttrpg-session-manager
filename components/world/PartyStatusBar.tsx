'use client';

/**
 * PartyStatusBar — top cockpit band over the world view. M3 upgrade over the
 * M2 read-only layout (markup + data-attributes preserved): gauges are now
 * manifest-driven, and the right edge hosts the live session controls —
 * Iniciar/Terminar sesión (with confirm popover), elapsed timer, write-status
 * dot and the Reintentar chip on permission loss. Gauges stay read-only here;
 * edits happen in the QuickLogBar.
 *
 * All M3 props are optional with idle defaults so the component keeps
 * rendering (button disabled) until the page wires the session store in.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import { PartyState, SessionRuntime } from '@/types/world';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronRight, Coins, MapPin, Play, RotateCw, Square, Timer } from 'lucide-react';

const DEFAULT_MEDIDOR_NAMES = ['viveres', 'combustible', 'nave'];

const MEDIDOR_LABELS: Record<string, string> = {
  viveres: 'Víveres',
  combustible: 'Combustible',
  nave: 'Nave',
};

function medidorLabel(nombre: string): string {
  return MEDIDOR_LABELS[nombre] ?? nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

const WRITE_STATUS_TITLES: Record<SessionRuntime['writeStatus'], string> = {
  ok: 'Escritura al día',
  pending: 'Guardando cambios…',
  denied: 'Permisos de escritura perdidos',
};

const WRITE_STATUS_DOT: Record<SessionRuntime['writeStatus'], string> = {
  ok: 'bg-emerald-500',
  pending: 'bg-amber-500',
  denied: 'bg-destructive',
};

/** mm:ss under an hour, h:mm from there on. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

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
  /** Gauge names from the world manifest (order preserved). */
  medidorNames?: string[];
  /** Pips per gauge row. */
  medidoresMax?: number;
  /** True while a session records; flips the button to Terminar sesión. */
  sessionActive?: boolean;
  /** Missing handler keeps the Iniciar button disabled (unwired page). */
  onStartSession?: () => void;
  onEndSession?: () => void;
  /** Elapsed session time; the page owns the ticking interval. */
  sessionElapsedMs?: number;
  writeStatus?: SessionRuntime['writeStatus'];
  /** Re-request write permission; rendered as the red Reintentar chip when denied. */
  onRetryWrites?: () => void;
  /** Summary counts shown inside the Terminar confirm popover. */
  endSummaryPreview?: string;
}

export function PartyStatusBar({
  estado,
  fecha,
  locationName,
  locationPath,
  onLocationClick,
  medidorNames = DEFAULT_MEDIDOR_NAMES,
  medidoresMax = 5,
  sessionActive = false,
  onStartSession,
  onEndSession,
  sessionElapsedMs = 0,
  writeStatus = 'ok',
  onRetryWrites,
  endSummaryPreview,
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
                  // before: pseudo extends the tap area to ~44px without
                  // growing the compact bar (M5 tap-target sweep).
                  className={`relative max-w-44 truncate text-sm before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline ${
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

      {/* Medidores (read-only; edits live in the QuickLogBar) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {medidorNames.map((nombre) => (
          <GaugeRow
            key={nombre}
            name={nombre}
            label={medidorLabel(nombre)}
            value={estado.medidores[nombre] ?? 0}
            max={medidoresMax}
          />
        ))}
      </div>

      {/* Session controls */}
      <div className="ml-auto flex items-center gap-2">
        {sessionActive ? (
          <>
            <span
              data-session-timer
              className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground"
              title="Tiempo de sesión"
            >
              <Timer className="size-4" aria-hidden />
              {formatElapsed(sessionElapsedMs)}
            </span>
            <span
              data-write-status={writeStatus}
              role="status"
              title={WRITE_STATUS_TITLES[writeStatus]}
              className={`size-2 shrink-0 rounded-full ${WRITE_STATUS_DOT[writeStatus]}`}
            />
            {writeStatus === 'denied' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-session-retry
                onClick={onRetryWrites}
                // min-h-11 = 44px tap target (M5 sweep) — recovery must be easy.
                className="min-h-11 gap-1 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RotateCw className="size-3" aria-hidden />
                Reintentar
              </Button>
            )}
            <EndSessionButton onEndSession={onEndSession} endSummaryPreview={endSummaryPreview} />
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            data-session-start
            disabled={!onStartSession}
            onClick={onStartSession}
            className="min-h-11"
          >
            <Play />
            Iniciar sesión
          </Button>
        )}
      </div>
    </div>
  );
}

interface EndSessionButtonProps {
  onEndSession?: () => void;
  endSummaryPreview?: string;
}

/** "Terminar sesión" with an upward confirm popover (summary + Terminar/Cancelar). */
function EndSessionButton({ onEndSession, endSummaryPreview }: EndSessionButtonProps) {
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
        variant="outline"
        size="sm"
        data-session-end
        aria-expanded={confirmOpen}
        onClick={() => setConfirmOpen((open) => !open)}
        className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Square />
        Terminar sesión
      </Button>
      {confirmOpen && (
        <div
          data-session-end-confirm
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p className="text-sm font-medium">¿Terminar la sesión?</p>
          {endSummaryPreview && (
            <p className="mt-1 text-xs text-muted-foreground">{endSummaryPreview}</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-session-end-confirm-button
              onClick={() => {
                setConfirmOpen(false);
                onEndSession?.();
              }}
              className="min-h-11"
            >
              Terminar
            </Button>
          </div>
        </div>
      )}
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
