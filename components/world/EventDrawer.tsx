'use client';

/**
 * EventDrawer — bottom sheet showing a drawn world event (M4).
 *
 * Pure and props-driven: the page (via eventEngine) hands in the draw
 * ({ tableNombre, event }); the drawer renders the event and hands back
 * intents — onApplyEffect converts an `:::efecto` line to a journal entry
 * (makeEntry lives with the caller), onOutcome journals the resolution,
 * onRedraw asks the engine for another weighted draw.
 *
 * Rendering route for `cuerpo` (documented per the M4 task): ActPanels
 * (components/play/ActPanels.tsx) does NOT export its internal block
 * renderers (ReadAloud/GmNote/ActionCard are module-private; only ActPanels
 * itself is exported), and modifying it is off-limits. So the cuerpo is
 * parsed with the EXISTING parseAct from lib/actFormat.ts and rendered here
 * with local callouts that mirror the ActPanels look one-for-one:
 *   - :::leer  -> border-l-4 border-l-primary bg-primary/5 box
 *   - :::info  -> border-l-4 border-l-muted-foreground/40 bg-muted/30 box
 *   - :::gm    -> dashed border bg-muted/25 note
 *   - :::accion-> rounded card with Dice5 name + field list
 *   - :::recurso -> muted chip
 * `:::efecto` blocks are NOT an actFormat type (parseAct would render their
 * lines as prose), so they are stripped from the cuerpo before parsing —
 * the effects arrive pre-parsed in event.efectos and render as buttons.
 *
 * Bottom sheet: fixed bottom panel + translate-y transition, no new deps.
 * Test hooks: data-event-drawer (data-state open|closed), per-effect
 * data-event-effect-N (+ data-event-effect={N}), data-event-outcome on the
 * three outcome buttons (Complicación first expands the nota input; its
 * confirm button carries data-event-outcome-confirm), data-event-redraw.
 *
 * draw === null while OPEN renders the empty state (data-event-empty): no
 * applicable table / empty pool — the button that opened the drawer stays
 * enabled by design so the GM discovers why here.
 */

import { useEffect, useMemo, useState } from 'react';
import { parseAct } from '@/lib/actFormat';
import type { ActBlock } from '@/lib/actFormat';
import type { EventEffect, WorldEvent } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Check,
  Dice5,
  Dices,
  Image as ImageIcon,
  Music,
  ScrollText,
  StickyNote,
  TriangleAlert,
  X,
} from 'lucide-react';

export type EventOutcome = 'resuelto' | 'ignorado' | 'complicacion';

export interface EventDrawerDraw {
  /** Display name of the table the event was drawn from. */
  tableNombre: string;
  event: WorldEvent;
}

interface EventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current draw; null renders an empty (closed) sheet. */
  draw: EventDrawerDraw | null;
  /** Ask the engine for another weighted draw (shown only when canRedraw). */
  onRedraw: () => void;
  /** Journal the resolution; nota only accompanies 'complicacion'. */
  onOutcome: (outcome: EventOutcome, nota?: string) => void;
  /** Convert one `:::efecto` line into a journal entry (caller owns makeEntry). */
  onApplyEffect: (effect: EventEffect) => void;
  /** Indexes into draw.event.efectos already applied (check + disabled). */
  appliedEffects: number[];
  canRedraw: boolean;
}

/** `:::efecto` is not an actFormat block type — remove it before parseAct. */
function stripEfectoBlocks(cuerpo: string): string {
  return cuerpo.replace(/^:::efecto[^\n]*$[\s\S]*?^:::[ \t]*$/gm, '').trim();
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Split an efecto value on its first `|`: machine part + free comment. */
function splitComentario(value: string): { main: string; comentario?: string } {
  const idx = value.indexOf('|');
  if (idx === -1) return { main: value.trim() };
  const comentario = value.slice(idx + 1).trim();
  return { main: value.slice(0, idx).trim(), comentario: comentario || undefined };
}

/**
 * Humanized one-tap button label per the M4 spec:
 * gasto 100 -> "-100 créditos" · medidor "combustible -1" -> "Combustible -1"
 * · sabe "nodo_central rumoreado" -> "Sabe: nodo_central rumoreado" ·
 * pista "id estado" -> "Pista: id → estado" · nota -> "Nota: …".
 * Unknown keys degrade to "Clave: valor" (never hides a line).
 */
export function effectLabel(effect: EventEffect): string {
  const { main } = splitComentario(effect.value);
  switch (effect.key) {
    case 'gasto':
      return `-${main} créditos`;
    case 'ganancia':
      return `+${main} créditos`;
    case 'medidor': {
      const match = main.match(/^(\S+)\s+([+-]?\d+)$/);
      if (!match) return `Medidor: ${main}`;
      const delta = Number(match[2]);
      return `${capitalize(match[1])} ${delta >= 0 ? '+' : ''}${delta}`;
    }
    case 'sabe':
      return `Sabe: ${main}`;
    case 'pista': {
      const match = main.match(/^(\S+)\s+(\S+)$/);
      return match ? `Pista: ${match[1]} → ${match[2]}` : `Pista: ${main}`;
    }
    case 'nota':
      return `Nota: ${main}`;
    default:
      return `${capitalize(effect.key)}: ${main}`;
  }
}

// ── Act-block callouts (mirror the ActPanels module-private renderers) ──────

function Md({ children, className = '' }: { children: string; className?: string }) {
  return <MarkdownViewer content={children} className={`prose-sm ${className}`} />;
}

function ReadAloudBox({ block }: { block: ActBlock }) {
  const isInfo = block.type === 'info';
  return (
    <div
      className={`rounded-lg border-l-4 p-3 ${
        isInfo ? 'border-l-muted-foreground/40 bg-muted/30' : 'border-l-primary bg-primary/5'
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <ScrollText className="h-3 w-3" aria-hidden />
        {isInfo ? 'Si preguntan' : 'Leer en voz alta'}
      </div>
      <Md>{block.body}</Md>
    </div>
  );
}

function GmNoteBox({ block }: { block: ActBlock }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/25 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3 w-3" aria-hidden /> Guía GM
      </div>
      <Md className="text-muted-foreground">{block.body}</Md>
    </div>
  );
}

function ActionCardBox({ block }: { block: ActBlock }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
      {block.name && (
        <div className="flex items-center gap-1.5 font-semibold">
          <Dice5 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{block.name}</span>
        </div>
      )}
      {block.fields && block.fields.length > 0 ? (
        <dl className="space-y-1.5">
          {block.fields.map((field, i) => (
            <div key={i} className="grid grid-cols-[5.5rem_1fr] gap-x-2">
              <dt className="pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {field.key}
              </dt>
              <dd className="leading-snug">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Md>{block.body}</Md>
      )}
    </div>
  );
}

function ResourceChipBox({ block }: { block: ActBlock }) {
  const isMusic = block.attrs.tipo === 'musica';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
      {isMusic ? <Music className="h-3 w-3" aria-hidden /> : <ImageIcon className="h-3 w-3" aria-hidden />}
      {block.body}
    </span>
  );
}

function BlockView({ block }: { block: ActBlock }) {
  switch (block.type) {
    case 'gm':
      return <GmNoteBox block={block} />;
    case 'accion':
      return <ActionCardBox block={block} />;
    case 'recurso':
      return <ResourceChipBox block={block} />;
    default:
      return <ReadAloudBox block={block} />;
  }
}

/** Event cuerpo through parseAct: preface, act-scoped blocks, then sections in order. */
function EventBody({ cuerpo }: { cuerpo: string }) {
  const model = useMemo(() => parseAct(stripEfectoBlocks(cuerpo)), [cuerpo]);
  return (
    <div className="space-y-3">
      {model.preface && <Md className="text-muted-foreground">{model.preface}</Md>}
      {model.actBlocks.map((block, i) => (
        <BlockView key={`b-${i}`} block={block} />
      ))}
      {model.sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <h4 className="text-sm font-semibold">{section.title}</h4>
          {section.content.map((item, i) => {
            if (item.kind === 'heading') {
              return (
                <h5 key={i} className="text-sm font-medium text-muted-foreground">
                  {item.text}
                </h5>
              );
            }
            if (item.kind === 'prose') {
              return (
                <Md key={i} className="text-muted-foreground">
                  {item.text}
                </Md>
              );
            }
            return <BlockView key={i} block={item.block} />;
          })}
        </section>
      ))}
    </div>
  );
}

// ── The drawer ──────────────────────────────────────────────────────────────

export function EventDrawer({
  open,
  onOpenChange,
  draw,
  onRedraw,
  onOutcome,
  onApplyEffect,
  appliedEffects,
  canRedraw,
}: EventDrawerProps) {
  const [complicacionOpen, setComplicacionOpen] = useState(false);
  const [nota, setNota] = useState('');

  // Fresh outcome state per draw (and whenever the sheet reopens).
  const eventId = draw?.event.id ?? null;
  useEffect(() => {
    setComplicacionOpen(false);
    setNota('');
  }, [eventId, open]);

  // Escape closes (the sheet is modal-ish but keeps the page interactive).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const resolve = (outcome: EventOutcome, outcomeNota?: string) => {
    onOutcome(outcome, outcomeNota);
    onOpenChange(false);
  };

  return (
    <>
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        data-event-drawer
        data-state={open ? 'open' : 'closed'}
        role="dialog"
        aria-modal="true"
        aria-label="Evento"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75vh] w-full max-w-3xl transform-gpu flex-col rounded-t-xl border border-b-0 bg-background shadow-lg transition-transform duration-300 ${
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        {draw === null ? (
          <div data-event-empty className="flex flex-col gap-3 px-4 py-6">
            <p className="text-sm text-muted-foreground">
              Sin tablas de eventos aplicables aquí.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-start gap-2 border-b px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{draw.event.titulo}</h3>
                  <Badge variant="secondary" data-event-table>
                    {draw.tableNombre}
                  </Badge>
                  {draw.event.etiquetas.map((etiqueta) => (
                    <Badge key={etiqueta} variant="outline" className="text-muted-foreground">
                      {etiqueta}
                    </Badge>
                  ))}
                </div>
                {canRedraw && (
                  <button
                    type="button"
                    data-event-redraw
                    onClick={onRedraw}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <Dices className="size-3.5" aria-hidden />
                    Otra tirada
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar evento"
                onClick={() => onOpenChange(false)}
                className="shrink-0"
              >
                <X />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <EventBody cuerpo={draw.event.cuerpo} />

              {draw.event.efectos.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Efectos
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {draw.event.efectos.map((efecto, index) => {
                      const applied = appliedEffects.includes(index);
                      const { comentario } = splitComentario(efecto.value);
                      return (
                        <Button
                          key={index}
                          type="button"
                          variant={applied ? 'secondary' : 'outline'}
                          size="sm"
                          disabled={applied}
                          title={comentario}
                          data-event-effect={index}
                          {...{ [`data-event-effect-${index}`]: 'true' }}
                          onClick={() => onApplyEffect(efecto)}
                        >
                          {applied && <Check className="text-emerald-600 dark:text-emerald-400" />}
                          {effectLabel(efecto)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <footer className="border-t px-4 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  data-event-outcome="resuelto"
                  onClick={() => resolve('resuelto')}
                >
                  Resuelto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-event-outcome="ignorado"
                  onClick={() => resolve('ignorado')}
                >
                  Ignorado
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-event-outcome="complicacion"
                  aria-expanded={complicacionOpen}
                  onClick={() => setComplicacionOpen((prev) => !prev)}
                  className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                >
                  <TriangleAlert aria-hidden />
                  Complicación
                </Button>
              </div>
              {complicacionOpen && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={nota}
                    onChange={(event) => setNota(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        resolve('complicacion', nota.trim() || undefined);
                      }
                    }}
                    placeholder="¿Qué se complica?"
                    aria-label="Nota de la complicación"
                    autoFocus
                    data-event-complicacion-nota
                  />
                  <Button
                    type="button"
                    variant="outline"
                    data-event-outcome-confirm="complicacion"
                    onClick={() => resolve('complicacion', nota.trim() || undefined)}
                    className="shrink-0"
                  >
                    Confirmar
                  </Button>
                </div>
              )}
            </footer>
          </>
        )}
      </div>
    </>
  );
}
