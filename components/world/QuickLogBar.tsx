'use client';

/**
 * QuickLogBar — bottom cockpit action band (M3, plan Part B). Eight large
 * one-tap buttons; every logging path is at most 2 interactions. Pure and
 * props-driven: the page owns the store and passes callbacks. Disabled as a
 * whole until the session is active.
 *
 * Popovers (créditos amounts, medidor pips) are hand-rolled (relative anchor +
 * absolute panel opening upward) instead of ui/dropdown-menu because the
 * créditos panel embeds a free-text input and Radix menus fight keyboard
 * focus inside items.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Apple,
  Coins,
  Fuel,
  Gauge,
  LucideIcon,
  MapPin,
  Rocket,
  StickyNote,
  Target,
  Zap,
} from 'lucide-react';

const DISABLED_TITLE = 'Inicia sesión para registrar';
const MEDIDOR_MAX = 5;

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

interface QuickLogBarProps {
  /** False until "Iniciar sesión": every button disabled with a hint tooltip. */
  enabled: boolean;
  creditos: number;
  /** Current gauge values keyed by manifest name. */
  medidores: Record<string, number>;
  /** Gauge names from the world manifest (order preserved). */
  medidorNames: string[];
  /** Opens the MoverDialog (page-owned). */
  onMover: () => void;
  /** Signed credit delta, already confirmed by the GM. */
  onCreditos: (delta: number) => void;
  /** Absolute new value 0-5 for the named gauge. */
  onMedidor: (nombre: string, to: number) => void;
  /** Opens the leads tab/dialog (page-owned). */
  onPista: () => void;
  /**
   * Opens the estancia EventDrawer (page-owned). Enabled whenever the session
   * runs — with no applicable tables the drawer shows its empty state instead
   * of disabling the button (the GM discovers why there).
   */
  onEvento: () => void;
  /** Freeform note text (non-empty, trimmed). */
  onNota: (text: string) => void;
}

export function QuickLogBar({
  enabled,
  creditos,
  medidores,
  medidorNames,
  onMover,
  onCreditos,
  onMedidor,
  onPista,
  onEvento,
  onNota,
}: QuickLogBarProps) {
  /** Which popover is open: 'creditos' | medidor name | null. */
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaText, setNotaText] = useState('');
  const notaInputRef = useRef<HTMLInputElement>(null);

  // Collapse everything when the session ends.
  useEffect(() => {
    if (!enabled) {
      setOpenPopover(null);
      setNotaOpen(false);
    }
  }, [enabled]);

  // "n" focuses the nota input when enabled and no other input holds focus.
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setNotaOpen(true);
      // Focus after the conditional input mounts (autoFocus covers first open;
      // this covers "already open but blurred").
      requestAnimationFrame(() => notaInputRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  const submitNota = () => {
    const text = notaText.trim();
    if (text) onNota(text);
    setNotaText('');
    setNotaOpen(false);
  };

  const handleNotaKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitNota();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setNotaOpen(false);
    }
  };

  return (
    <div
      data-quicklog-bar
      className="flex flex-wrap items-stretch gap-2 border-t bg-background px-3 py-2"
    >
      <ActionButton
        id="mover"
        icon={MapPin}
        label="Mover"
        enabled={enabled}
        onClick={() => {
          setOpenPopover(null);
          onMover();
        }}
      />

      {/* ± Créditos: amount popover (fixed deltas + custom, negative allowed). */}
      <PopoverAnchor
        open={openPopover === 'creditos'}
        onClose={() => setOpenPopover(null)}
        panel={
          <CreditosPanel
            onDelta={(delta) => {
              onCreditos(delta);
              setOpenPopover(null);
            }}
          />
        }
      >
        <ActionButton
          id="creditos"
          icon={Coins}
          label="± Créditos"
          sub={`${creditos.toLocaleString('es-ES')} cr`}
          enabled={enabled}
          active={openPopover === 'creditos'}
          onClick={() => setOpenPopover(openPopover === 'creditos' ? null : 'creditos')}
        />
      </PopoverAnchor>

      {/* One gauge button per manifest medidor: 6-pip (0-5) popover. */}
      {medidorNames.map((nombre) => {
        const value = clampPip(medidores[nombre] ?? 0);
        return (
          <PopoverAnchor
            key={nombre}
            open={openPopover === nombre}
            onClose={() => setOpenPopover(null)}
            panel={
              <PipRow
                nombre={nombre}
                current={value}
                onPick={(to) => {
                  onMedidor(nombre, to);
                  setOpenPopover(null);
                }}
              />
            }
          >
            <ActionButton
              id={nombre}
              icon={MEDIDOR_ICONS[nombre] ?? Gauge}
              label={medidorLabel(nombre)}
              sub={`${value}/${MEDIDOR_MAX}`}
              enabled={enabled}
              active={openPopover === nombre}
              onClick={() => setOpenPopover(openPopover === nombre ? null : nombre)}
            />
          </PopoverAnchor>
        );
      })}

      <ActionButton
        id="pista"
        icon={Target}
        label="Pista"
        enabled={enabled}
        onClick={() => {
          setOpenPopover(null);
          onPista();
        }}
      />

      <ActionButton
        id="evento"
        icon={Zap}
        label="Evento"
        enabled={enabled}
        onClick={() => {
          setOpenPopover(null);
          onEvento();
        }}
      />

      {/* Nota: inline expanding input (Enter registra, Escape pliega). */}
      {notaOpen && enabled ? (
        <div className="flex min-h-12 min-w-48 flex-[2] items-center gap-1.5 rounded-md border px-2">
          <StickyNote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            ref={notaInputRef}
            data-quicklog-nota-input
            autoFocus
            value={notaText}
            onChange={(event) => setNotaText(event.target.value)}
            onKeyDown={handleNotaKeyDown}
            placeholder="Nota rápida… (Enter registra)"
            className="h-8 border-none bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-label="Nota rápida"
          />
        </div>
      ) : (
        <ActionButton
          id="nota"
          icon={StickyNote}
          label="Nota"
          sub={enabled ? 'n' : undefined}
          enabled={enabled}
          onClick={() => {
            setOpenPopover(null);
            setNotaOpen(true);
          }}
        />
      )}
    </div>
  );
}

function clampPip(value: number): number {
  return Math.max(0, Math.min(Math.round(value), MEDIDOR_MAX));
}

// ── Building blocks ──────────────────────────────────────────────────────────

interface ActionButtonProps {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Small secondary line (current value / shortcut hint). */
  sub?: string;
  enabled: boolean;
  active?: boolean;
  disabledTitle?: string;
  onClick: () => void;
}

/** Large (min-h-12) vertical icon+label button; disabled state keeps its tooltip. */
function ActionButton({
  id,
  icon: Icon,
  label,
  sub,
  enabled,
  active = false,
  disabledTitle = DISABLED_TITLE,
  onClick,
}: ActionButtonProps) {
  const button = (
    <Button
      type="button"
      variant="outline"
      data-quicklog={id}
      disabled={!enabled}
      aria-expanded={active || undefined}
      onClick={onClick}
      className={`h-auto min-h-12 w-full flex-col gap-0.5 px-2 py-1.5 ${
        active ? 'bg-accent text-accent-foreground' : ''
      }`}
    >
      <Icon aria-hidden />
      <span className="text-xs leading-none">{label}</span>
      {sub !== undefined && (
        <span className="text-[10px] leading-none text-muted-foreground">{sub}</span>
      )}
    </Button>
  );

  if (enabled) return <div className="min-w-0 flex-1 basis-20">{button}</div>;
  // Button's disabled style sets pointer-events-none; the wrapper keeps the hint.
  return (
    <div className="min-w-0 flex-1 basis-20" title={disabledTitle}>
      {button}
    </div>
  );
}

interface PopoverAnchorProps {
  open: boolean;
  onClose: () => void;
  panel: ReactNode;
  children: ReactNode;
}

/** Relative anchor whose panel opens upward; closes on outside click or Escape. */
function PopoverAnchor({ open, onClose, panel, children }: PopoverAnchorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
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
    <div ref={containerRef} className="relative flex min-w-0 flex-1 basis-20">
      {children}
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
          {panel}
        </div>
      )}
    </div>
  );
}

const CREDIT_DELTAS = [10, 50, 100, -10, -50, -100];

function CreditosPanel({ onDelta }: { onDelta: (delta: number) => void }) {
  const [custom, setCustom] = useState('');

  const submitCustom = () => {
    const amount = Number.parseInt(custom, 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    onDelta(amount);
    setCustom('');
  };

  return (
    <div className="w-44 space-y-2" data-quicklog-creditos-menu>
      <div className="grid grid-cols-3 gap-1">
        {CREDIT_DELTAS.map((delta) => (
          <Button
            key={delta}
            type="button"
            variant={delta > 0 ? 'secondary' : 'outline'}
            size="sm"
            data-quicklog-delta={delta}
            onClick={() => onDelta(delta)}
            // h-11 = 44px tap target (M5 sweep).
            className={`h-11 tabular-nums ${delta < 0 ? 'text-destructive' : ''}`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </Button>
        ))}
      </div>
      <Input
        data-quicklog-creditos-custom
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitCustom();
          }
        }}
        placeholder="Cantidad… (−400)"
        inputMode="numeric"
        className="h-8"
        aria-label="Cantidad de créditos"
      />
    </div>
  );
}

interface PipRowProps {
  nombre: string;
  current: number;
  onPick: (to: number) => void;
}

/** Six pips 0..5; tapping one commits the new gauge value immediately. */
function PipRow({ nombre, current, onPick }: PipRowProps) {
  return (
    <div className="flex items-center gap-1" data-quicklog-pips={nombre}>
      {Array.from({ length: MEDIDOR_MAX + 1 }, (_, value) => (
        <button
          key={value}
          type="button"
          data-quicklog-pip={value}
          aria-pressed={value === current}
          onClick={() => onPick(value)}
          // size-11 = 44px tap target (M5 sweep).
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
