'use client';

/**
 * LeadsBoard — full pistas board for the cockpit's right-panel "Pistas" tab
 * (M4; replaces the page-local LeadsListCard placeholder from M3).
 *
 * Pure and props-driven: the page passes the scanned pistas/tramas plus
 * diaMundo; transitions come back as (id, from, to) for the page to journal
 * via makeEntry.pista. Clicking a "donde" chip hands the lugar id back
 * through onSelectPlace (the page navigates the map).
 *
 * Filter tabs: Accionables (star) / Activas / Rumores / Cerradas, each with
 * a count. UNIFIED badge semantics (M2 verifier TODO): the Accionables tab
 * and every count use `accionable === true` ONLY — `accionable === 'manual'`
 * renders the "según GM" badge on its row but never counts as accionable.
 *
 * Rows group by trama (trama nombre as header, in the tramas prop order);
 * pistas without trama (or with a dangling trama id) land in a final
 * "Sueltas" group. Allowed one-tap transitions per estado come from the
 * exported PISTA_TRANSITIONS map (the M3 page replicated this locally — the
 * page should now import it from here).
 *
 * Test hooks kept from the M3 placeholder so its e2e selectors stay valid:
 * data-leads-panel, data-lead-id, data-lead-estado, data-lead-transition.
 * New: data-leads-tab on the filter tabs, data-lead-donde on the place chip.
 *
 * DETAIL VIEW: clicking a row body (data-lead-open) swaps the LIST for a
 * LeadDetail view (data-lead-detail) below the filter tabs — chips for
 * estado/donde/plazo, human-readable requisitos (`manual:` -> "Según GM: …";
 * condition-grammar strings verbatim in mono), the recompensa callout and
 * the pista BODY through MarkdownViewer (previously invisible to the GM).
 * Back button: data-lead-back. The detail state is local, so it clears when
 * the board unmounts (panel tab switch, entity selection — both flip
 * panelTab away from 'pistas') and explicitly on a filter-tab click. The
 * row's transition buttons and donde chip stopPropagation so they keep
 * working without opening the detail.
 */

import { useMemo, useState } from 'react';
import type { Lead, Trama } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Clock, Gift, MapPin, Star } from 'lucide-react';

/** Allowed one-tap estado transitions per current estado (plan Part A workflow). */
export const PISTA_TRANSITIONS: Record<Lead['estadoPista'], Lead['estadoPista'][]> = {
  rumor: ['activa'],
  activa: ['en_curso', 'fallida'],
  en_curso: ['resuelta', 'fallida'],
  resuelta: [],
  fallida: [],
};

export const PISTA_ESTADO_LABEL: Record<Lead['estadoPista'], string> = {
  rumor: 'Rumor',
  activa: 'Activa',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
  fallida: 'Fallida',
};

/** Estado chip color per estado (Badge className overrides). */
const ESTADO_CHIP_CLASS: Record<Lead['estadoPista'], string> = {
  rumor: 'border-transparent bg-muted text-muted-foreground',
  activa: 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300',
  en_curso: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300',
  resuelta: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  fallida: 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300',
};

const PISTA_ESTADO_ORDER: Record<Lead['estadoPista'], number> = {
  activa: 0,
  en_curso: 1,
  rumor: 2,
  resuelta: 3,
  fallida: 4,
};

export type LeadsFilter = 'accionables' | 'activas' | 'rumores' | 'cerradas';

const FILTERS: { id: LeadsFilter; label: string; empty: string; match: (pista: Lead) => boolean }[] = [
  {
    id: 'accionables',
    label: 'Accionables',
    empty: 'Nada accionable ahora mismo.',
    match: (pista) => pista.accionable === true,
  },
  {
    id: 'activas',
    label: 'Activas',
    empty: 'Sin pistas activas.',
    match: (pista) => pista.estadoPista === 'activa' || pista.estadoPista === 'en_curso',
  },
  {
    id: 'rumores',
    label: 'Rumores',
    empty: 'Sin rumores.',
    match: (pista) => pista.estadoPista === 'rumor',
  },
  {
    id: 'cerradas',
    label: 'Cerradas',
    empty: 'Sin pistas cerradas.',
    match: (pista) => pista.estadoPista === 'resuelta' || pista.estadoPista === 'fallida',
  },
];

interface LeadsBoardProps {
  pistas: Lead[];
  /** Grouping order + group headers; dangling/absent trama ids fall to "Sueltas". */
  tramas: Trama[];
  /** Current world day — plazo chips turn red once diaMundo > plazo. */
  diaMundo: number;
  /** Transitions are journaled: disabled (with a hint) until a session runs. */
  sessionActive: boolean;
  /** Re-render key: pista estado/accionable are mutated in place on the model. */
  modelRev?: number;
  onTransition: (id: string, from: Lead['estadoPista'], to: Lead['estadoPista']) => void;
  /** Click on the donde chip — the page navigates the map to the lugar. */
  onSelectPlace: (id: string) => void;
  /** Resolves a lugar id to its display name for the donde chip (falls back to the id). */
  placeNombre?: (id: string) => string | undefined;
}

interface LeadGroup {
  key: string;
  header: string;
  pistas: Lead[];
}

export function LeadsBoard({
  pistas,
  tramas,
  diaMundo,
  sessionActive,
  modelRev,
  onTransition,
  onSelectPlace,
  placeNombre,
}: LeadsBoardProps) {
  const [filter, setFilter] = useState<LeadsFilter>('accionables');
  // Open detail (null = list). Local on purpose: the board unmounts when the
  // GM leaves the Pistas tab or selects an entity, clearing it for free.
  const [detailId, setDetailId] = useState<string | null>(null);

  const counts = useMemo(() => {
    void modelRev;
    const result = {} as Record<LeadsFilter, number>;
    for (const f of FILTERS) result[f.id] = pistas.filter(f.match).length;
    return result;
  }, [pistas, modelRev]);

  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];

  // A stale id (re-scan replaced the pistas array) degrades to the list.
  const detailPista = detailId ? (pistas.find((p) => p.id === detailId) ?? null) : null;

  const groups = useMemo<LeadGroup[]>(() => {
    void modelRev;
    const matched = pistas.filter(activeFilter.match).sort((a, b) => {
      const accA = a.accionable === true ? 0 : 1;
      const accB = b.accionable === true ? 0 : 1;
      if (accA !== accB) return accA - accB;
      const orderDelta = PISTA_ESTADO_ORDER[a.estadoPista] - PISTA_ESTADO_ORDER[b.estadoPista];
      if (orderDelta !== 0) return orderDelta;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    const byTrama = new Map<string, Lead[]>();
    const sueltas: Lead[] = [];
    const tramaIds = new Set(tramas.map((trama) => trama.id));
    for (const pista of matched) {
      if (pista.trama && tramaIds.has(pista.trama)) {
        const bucket = byTrama.get(pista.trama);
        if (bucket) bucket.push(pista);
        else byTrama.set(pista.trama, [pista]);
      } else {
        sueltas.push(pista);
      }
    }
    const result: LeadGroup[] = [];
    for (const trama of tramas) {
      const bucket = byTrama.get(trama.id);
      if (bucket) result.push({ key: trama.id, header: trama.nombre, pistas: bucket });
    }
    if (sueltas.length > 0) result.push({ key: '__sueltas', header: 'Sueltas', pistas: sueltas });
    return result;
  }, [pistas, tramas, activeFilter, modelRev]);

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-leads-panel>
      <div
        role="tablist"
        aria-label="Filtro de pistas"
        className="flex shrink-0 gap-1 border-b bg-muted/40 p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            data-leads-tab={f.id}
            aria-selected={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setDetailId(null); // a different tab clears the open detail
            }}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs transition-colors ${
              filter === f.id
                ? 'bg-background font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.id === 'accionables' && (
              <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            )}
            <span className="truncate">{f.label}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {detailPista ? (
        <LeadDetail
          pista={detailPista}
          tramaNombre={
            detailPista.trama
              ? (tramas.find((t) => t.id === detailPista.trama)?.nombre ?? detailPista.trama)
              : undefined
          }
          diaMundo={diaMundo}
          onBack={() => setDetailId(null)}
          onSelectPlace={onSelectPlace}
          placeNombre={placeNombre}
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{activeFilter.empty}</p>
          ) : (
            groups.map((group) => (
              <div key={group.key} data-leads-group={group.key}>
                <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.header}
                </p>
                <div className="space-y-1">
                  {group.pistas.map((pista) => (
                    <LeadRow
                      key={pista.id}
                      pista={pista}
                      diaMundo={diaMundo}
                      sessionActive={sessionActive}
                      onOpen={setDetailId}
                      onTransition={onTransition}
                      onSelectPlace={onSelectPlace}
                      placeNombre={placeNombre}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

interface LeadRowProps {
  pista: Lead;
  diaMundo: number;
  sessionActive: boolean;
  /** Row-body click: open the detail view for this pista. */
  onOpen: (id: string) => void;
  onTransition: (id: string, from: Lead['estadoPista'], to: Lead['estadoPista']) => void;
  onSelectPlace: (id: string) => void;
  placeNombre?: (id: string) => string | undefined;
}

function LeadRow({
  pista,
  diaMundo,
  sessionActive,
  onOpen,
  onTransition,
  onSelectPlace,
  placeNombre,
}: LeadRowProps) {
  const vencida = pista.plazo !== undefined && diaMundo > pista.plazo;
  return (
    // The whole row body opens the detail; the interactive children below
    // (donde chip, transition buttons) stopPropagation to keep their own
    // behavior without triggering it.
    <div
      data-lead-id={pista.id}
      data-lead-estado={pista.estadoPista}
      data-lead-open
      role="button"
      tabIndex={0}
      onClick={() => onOpen(pista.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(pista.id);
        }
      }}
      className="cursor-pointer rounded-md border px-3 py-2 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start gap-2">
        {pista.accionable === true && (
          <Star
            className="mt-0.5 size-4 shrink-0 fill-amber-400 text-amber-400"
            aria-label="Accionable"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{pista.nombre}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {pista.donde && (
              <button
                type="button"
                data-lead-donde={pista.donde}
                onClick={(event) => {
                  event.stopPropagation(); // navigate, don't open the detail
                  onSelectPlace(pista.donde!);
                }}
                // before: pseudo extends the tap area to ~44px without inflating
                // the chip visually (M5 tap-target sweep).
                className="relative inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:bg-accent hover:text-foreground"
              >
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{placeNombre?.(pista.donde) ?? pista.donde}</span>
              </button>
            )}
            {pista.plazo !== undefined && (
              <span
                data-lead-plazo={pista.plazo}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  vencida
                    ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                    : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                <Clock className="size-3 shrink-0" aria-hidden />
                Día {pista.plazo}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={ESTADO_CHIP_CLASS[pista.estadoPista]}>
            {PISTA_ESTADO_LABEL[pista.estadoPista]}
          </Badge>
          {pista.accionable === 'manual' && (
            <Badge variant="outline" className="text-muted-foreground">
              según GM
            </Badge>
          )}
        </div>
      </div>
      {PISTA_TRANSITIONS[pista.estadoPista].length > 0 && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          {PISTA_TRANSITIONS[pista.estadoPista].map((to) => (
            <Button
              key={to}
              type="button"
              variant="outline"
              size="sm"
              data-lead-transition={to}
              disabled={!sessionActive}
              title={sessionActive ? undefined : 'Inicia sesión para registrar'}
              onClick={(event) => {
                event.stopPropagation(); // transition, don't open the detail
                onTransition(pista.id, pista.estadoPista, to);
              }}
              // min-h-11 = 44px tap target (M5 sweep) — these are the one-tap
              // transitions the GM hits mid-session on a tablet.
              className={`min-h-11 px-3 text-xs ${
                to === 'fallida' ? 'border-destructive/40 text-destructive' : ''
              }`}
            >
              {PISTA_ESTADO_LABEL[to]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** `manual: <texto>` requisito — never evaluated by the app, the GM decides. */
const MANUAL_REQUISITO = /^manual\s*:\s*/;

interface LeadDetailProps {
  pista: Lead;
  /** Display name of the pista's trama (raw id fallback); absent = suelta. */
  tramaNombre?: string;
  diaMundo: number;
  onBack: () => void;
  onSelectPlace: (id: string) => void;
  placeNombre?: (id: string) => string | undefined;
}

/**
 * Full pista view (replaces the list inside the Pistas tab): everything the
 * row shows PLUS the markdown body and recompensa the GM could not see
 * before. Requisitos render human-readable: `manual:` entries as
 * "Según GM: …", condition-grammar strings verbatim in mono.
 */
function LeadDetail({
  pista,
  tramaNombre,
  diaMundo,
  onBack,
  onSelectPlace,
  placeNombre,
}: LeadDetailProps) {
  const vencida = pista.plazo !== undefined && diaMundo > pista.plazo;
  const hasBody = pista.body.trim().length > 0;

  return (
    <div data-lead-detail={pista.id} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-lead-back
          onClick={onBack}
          className="min-h-11"
        >
          <ArrowLeft />
          Pistas
        </Button>
        {tramaNombre && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{tramaNombre}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex items-start gap-2">
          {pista.accionable === true && (
            <Star
              className="mt-0.5 size-4 shrink-0 fill-amber-400 text-amber-400"
              aria-label="Accionable"
            />
          )}
          <h3 className="min-w-0 flex-1 break-words text-base font-semibold">{pista.nombre}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={ESTADO_CHIP_CLASS[pista.estadoPista]}>
            {PISTA_ESTADO_LABEL[pista.estadoPista]}
          </Badge>
          {pista.accionable === 'manual' && (
            <Badge variant="outline" className="text-muted-foreground">
              según GM
            </Badge>
          )}
          {pista.donde && (
            <button
              type="button"
              data-lead-donde={pista.donde}
              onClick={() => onSelectPlace(pista.donde!)}
              className="relative inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:bg-accent hover:text-foreground"
            >
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{placeNombre?.(pista.donde) ?? pista.donde}</span>
            </button>
          )}
          {pista.plazo !== undefined && (
            <span
              data-lead-plazo={pista.plazo}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                vencida
                  ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              <Clock className="size-3 shrink-0" aria-hidden />
              Día {pista.plazo}
            </span>
          )}
        </div>

        {pista.requisitos.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Requisitos
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {pista.requisitos.map((req) => {
                const trimmed = req.trim();
                const manual = MANUAL_REQUISITO.test(trimmed);
                return (
                  <li key={req} className="break-words">
                    {manual ? (
                      <>Según GM: {trimmed.replace(MANUAL_REQUISITO, '')}</>
                    ) : (
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        {trimmed}
                      </code>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pista.recompensa && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
              <Gift className="size-3.5 shrink-0" aria-hidden />
              Recompensa
            </div>
            <p className="text-sm">{pista.recompensa}</p>
          </div>
        )}

        {hasBody && <MarkdownViewer content={pista.body} className="prose-sm" />}
      </div>
    </div>
  );
}
