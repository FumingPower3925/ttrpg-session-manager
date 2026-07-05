'use client';

/**
 * ActRunnerPartyStrip — a compact party-state band for the fullscreen ActRunner.
 *
 * The play overlay hides the cockpit (PartyStatusBar + QuickLogBar), so while a
 * GM runs an act they lose sight of credits/gauges and can't spend/adjust for
 * the supply & repair beats that live INSIDE acts (e.g. porto_verne acto1
 * "Suministros y muelle" + "Reparar el casco"). This strip mirrors the cockpit
 * essentials — créditos (± popover) and the manifest gauges (0–5 pip popover) —
 * plus a Tienda button — so those beats run without leaving the scene. Every
 * adjustment flows through the SAME page callbacks as the QuickLogBar
 * (onCreditos / onMedidor → partyStore log → journal), so it stays recorded.
 *
 * Read-out is always visible; adjustments are session-gated (`enabled`).
 * Popovers open DOWNWARD (the strip sits under the header, unlike the
 * bottom-anchored QuickLogBar whose popovers open upward).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Apple, Coins, Fuel, Gauge, LucideIcon, Rocket, ShoppingCart } from 'lucide-react';

const MEDIDOR_MAX = 5;
const DISABLED_TITLE = 'Inicia sesión para registrar';
const CREDIT_DELTAS = [10, 50, 100, -10, -50, -100];

const MEDIDOR_ICONS: Record<string, LucideIcon> = {
  viveres: Apple,
  combustible: Fuel,
  nave: Rocket,
};
const MEDIDOR_LABELS: Record<string, string> = {
  viveres: 'Víveres',
  combustible: 'Combustible',
  nave: 'Nave',
};

function medidorLabel(nombre: string): string {
  return MEDIDOR_LABELS[nombre] ?? nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function clampPip(value: number): number {
  return Math.max(0, Math.min(Math.round(value), MEDIDOR_MAX));
}

interface ActRunnerPartyStripProps {
  creditos: number;
  medidores: Record<string, number>;
  medidorNames: string[];
  /** Session active → adjustments allowed. Read-out shows regardless. */
  enabled: boolean;
  /** Signed credit delta (already GM-confirmed). */
  onCreditos: (delta: number) => void;
  /** Absolute new value 0-5 for the named gauge. */
  onMedidor: (nombre: string, to: number) => void;
  /** Shops at this place; 0 hides the Tienda button. */
  shopCount: number;
  onOpenShops: () => void;
}

export function ActRunnerPartyStrip({
  creditos,
  medidores,
  medidorNames,
  enabled,
  onCreditos,
  onMedidor,
  shopCount,
  onOpenShops,
}: ActRunnerPartyStripProps) {
  // Which popover is open: 'creditos' | medidor name | null.
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) setOpen(null);
  }, [enabled]);

  return (
    <div
      data-act-party-strip
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-4 py-1.5"
    >
      {/* Créditos */}
      <Anchor
        open={open === 'creditos'}
        onClose={() => setOpen(null)}
        panel={
          <CreditosPanel
            onDelta={(delta) => {
              onCreditos(delta);
              setOpen(null);
            }}
          />
        }
      >
        <button
          type="button"
          data-strip-creditos
          disabled={!enabled}
          aria-expanded={open === 'creditos' || undefined}
          title={enabled ? undefined : DISABLED_TITLE}
          onClick={() => setOpen(open === 'creditos' ? null : 'creditos')}
          className={`flex min-h-9 items-center gap-1.5 rounded-md border px-2 text-sm transition-colors disabled:opacity-60 ${
            open === 'creditos' ? 'bg-accent' : 'hover:bg-accent/50'
          }`}
        >
          <Coins className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium tabular-nums" data-strip-creditos-value={creditos}>
            {creditos.toLocaleString('es-ES')}
          </span>
          <span className="text-xs text-muted-foreground">cr</span>
        </button>
      </Anchor>

      {/* Medidores */}
      {medidorNames.map((nombre) => {
        const value = clampPip(medidores[nombre] ?? 0);
        const Icon = MEDIDOR_ICONS[nombre] ?? Gauge;
        const tone =
          value <= 1 ? 'text-destructive' : value <= 2 ? 'text-amber-500' : 'text-muted-foreground';
        return (
          <Anchor
            key={nombre}
            open={open === nombre}
            onClose={() => setOpen(null)}
            panel={
              <PipRow
                nombre={nombre}
                current={value}
                onPick={(to) => {
                  onMedidor(nombre, to);
                  setOpen(null);
                }}
              />
            }
          >
            <button
              type="button"
              data-strip-medidor={nombre}
              data-valor={value}
              disabled={!enabled}
              aria-expanded={open === nombre || undefined}
              title={enabled ? undefined : DISABLED_TITLE}
              onClick={() => setOpen(open === nombre ? null : nombre)}
              className={`flex min-h-9 items-center gap-1.5 rounded-md border px-2 text-sm transition-colors disabled:opacity-60 ${
                open === nombre ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden />
              <span className="text-xs font-medium">{medidorLabel(nombre)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {value}/{MEDIDOR_MAX}
              </span>
            </button>
          </Anchor>
        );
      })}

      {shopCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-strip-tienda
          onClick={onOpenShops}
          className="ml-auto min-h-9"
        >
          <ShoppingCart />
          {shopCount > 1 ? `Tiendas (${shopCount})` : 'Tienda'}
        </Button>
      )}
    </div>
  );
}

interface AnchorProps {
  open: boolean;
  onClose: () => void;
  panel: ReactNode;
  children: ReactNode;
}

/** Relative anchor whose panel opens downward; closes on outside click / Escape. */
function Anchor({ open, onClose, panel, children }: AnchorProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {children}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
          {panel}
        </div>
      )}
    </div>
  );
}

function CreditosPanel({ onDelta }: { onDelta: (delta: number) => void }) {
  const [custom, setCustom] = useState('');
  const submitCustom = () => {
    const amount = Number.parseInt(custom.replace(/−/g, '-'), 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    onDelta(amount);
    setCustom('');
  };
  return (
    <div className="w-44 space-y-2" data-strip-creditos-menu>
      <div className="grid grid-cols-3 gap-1">
        {CREDIT_DELTAS.map((delta) => (
          <Button
            key={delta}
            type="button"
            variant={delta > 0 ? 'secondary' : 'outline'}
            size="sm"
            data-strip-delta={delta}
            onClick={() => onDelta(delta)}
            className={`h-11 tabular-nums ${delta < 0 ? 'text-destructive' : ''}`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </Button>
        ))}
      </div>
      <Input
        data-strip-creditos-custom
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitCustom();
          }
        }}
        placeholder="Cantidad… (-400)"
        inputMode="numeric"
        className="h-8"
        aria-label="Cantidad de créditos"
      />
    </div>
  );
}

function PipRow({
  nombre,
  current,
  onPick,
}: {
  nombre: string;
  current: number;
  onPick: (to: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" data-strip-pips={nombre}>
      {Array.from({ length: MEDIDOR_MAX + 1 }, (_, value) => (
        <button
          key={value}
          type="button"
          data-strip-pip={value}
          aria-pressed={value === current}
          onClick={() => onPick(value)}
          className={`flex size-11 items-center justify-center rounded-full border text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground ${
            value === current
              ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              : value < current
                ? 'border-primary/50'
                : 'border-muted-foreground/40 text-muted-foreground'
          }`}
          title={`${medidorLabel(nombre)}: ${value}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
