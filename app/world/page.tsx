'use client';

/**
 * /world — world viewer (M1) + drill-in, party readout, search & deep link
 * (M2) + session recorder cockpit (M3).
 *
 * Folder entry paths (all end in the same open-and-scan path):
 *   - stored handle still granted  -> scan immediately on mount
 *   - stored handle needs a gesture -> "Reconectar carpeta" button
 *   - nothing stored               -> "Seleccionar carpeta de campaña" button
 *   - e2e seam: window.__ttrpgWorldTest.openFromOPFS() feeds the OPFS root
 *     handle through the same path (contract in e2e/helpers/opfs.ts)
 *
 * The page root always carries data-world-status={idle|scanning|ready|error}.
 *
 * M2 tier wiring:
 *   - sector -> system: dblclick a sistema node (or Entrar in its panel).
 *   - system -> SiteList: dblclick a place with children (or Entrar). The
 *     SiteList renders as a right-panel card next to the EntityPanel while
 *     the map stays on its spatial tier behind it — tier 3 is non-spatial by
 *     design (plan Part B). Back pops SiteList -> system -> sector.
 *   - Search (Cmd/Ctrl+K) and ?e= deep links navigate via tierTargetFor().
 *   - Tier changes recompute a fit-to-content viewport (instant, no tween).
 *
 * M3 recorder wiring (plan Part B "Write path" + "Cockpit"):
 *   - "Iniciar sesión" requests readwrite on the mundo/ handle (one prompt,
 *     gesture-scoped), builds the JournalWriter (write surface enforced in
 *     the writer: mundo/diario/ + mundo/estado/ only) and arms partyStore.
 *   - partyStore.log() is the single mutation entry point; every quick-log
 *     action here builds the entry via makeEntry and fires a sonner toast.
 *   - Live in-session world changes (llegada knowledge bumps, pista estado)
 *     mutate the scanned model IN MEMORY via the scanner's own helpers
 *     (applyLlegadaConocimiento / deriveLeadActionability) and re-render
 *     through the `modelRev` counter — knowledge never lowers, so an undone
 *     llegada keeps its bump (same semantics as the scan-time journal
 *     overlay); an undone pista transition IS reverted. Files re-derive from
 *     the unprocessed journal on reload.
 *   - Crash mirror: partyStore's SessionMirror (sessionStorage) -> recovery
 *     banner; `sesion_activa: true` without a mirror -> stale-lock notice
 *     (plan Part A anti-conflict protocol).
 *
 * M4 travel + events wiring (plan Part B "Travel" + "Cockpit"):
 *   - Selecting a spatial non-current entity offers "Viajar aquí" (EntityPanel
 *     actions) and — when origin/destination resolve to DIFFERENT sector roots
 *     with coordinates and the plan is not portal — a RoutePreview line on the
 *     sector tier (system tier renders no routes layer; preview also hides
 *     while a trip is running).
 *   - Confirming the TravelDialog (active session required — the confirm is
 *     disabled with a hint row until "Iniciar sesión") journals `rumbo` and
 *     arms the TravelStepper.
 *     CONSUMPTION SCHEDULE (economy redesign): travelDaySchedule() burns each
 *     sector leg's combustible at combustible_cada_dias boundaries inside that
 *     leg (remainder on the leg's last day) and charges 1 víveres on every
 *     dia_mundo that is a multiple of viveres_cada_dias — CALENDAR-anchored,
 *     so the same route costs ±1 ration depending on the departure phase and
 *     the dialog previews the exact number. Per-day amounts sum exactly to
 *     the plan totals, so stepping == "Resolver resto". Gauges clamp at 0
 *     (GM override); the clamped medidor entry is what gets journaled, and a
 *     tick meeting an ALREADY-EMPTY gauge journals a deficit nota (hambre /
 *     a la deriva) + warning toast with a "Tirar evento" action instead of a
 *     no-op `medidor 0->0` line.
 *   - DESCANSO: the QuickLogBar «Descansar» button advances dia_mundo outside
 *     travel (stepper owns days mid-trip) — one `descanso` entry plus the
 *     calendar víveres ticks via the same consumption path. Undoing a
 *     descanso therefore takes two undos (tick first) — same as travel-day
 *     pairs.
 *   - REGION OF ROUTE for travel event draws: the CondContext anchors on the
 *     ORIGIN until the sector leg completes (dia <= sectorLegEndDay), then on
 *     the DESTINATION — ubicacion itself only changes at arrival. Intra-system
 *     trips have no sector leg, so the anchor stays on the origin (same root).
 *   - CANCEL SEMANTICS: cancelling mid-travel stops the stepper and journals
 *     ONLY a nota ("Viaje interrumpido hacia X en dia N"); ubicacion stays at
 *     the origin, already-stepped days stay elapsed, and the `rumbo` field
 *     stays set in estado until the next llegada clears it — there is no
 *     rumbo-clearing entry type by design; the agent reconciles from the nota.
 *   - UNDO IS DISABLED WHILE A TRIP RUNS (canUndo requires travel === null):
 *     the TravelRun day counter/schedule are component state the replay-undo
 *     cannot revert, so a mid-travel undo would desync stepper vs journal
 *     (consumption already charged for a day the store no longer counts).
 *     The escape hatch is Cancelar (position kept), then undo normally.
 *   - PORTAL plans skip rumbo/days entirely: confirm journals the llegada
 *     immediately (comentario "por portal") and applies the knowledge bump.
 *   - Event `:::efecto` lines convert to journal entries against CURRENT party
 *     state (gasto/ganancia direct; medidor deltas clamp 0..5; sabe also bumps
 *     the in-memory conocimiento — never lowering — and pista mutates
 *     estadoPista like a manual transition). Unparseable/unknown effects
 *     degrade to a nota entry so nothing is silently lost. Redraw is allowed
 *     once per drawer opening and journals nothing by itself.
 *   - rederiveLeads(): every pista/medidor/creditos/llegada/sabe mutation (and
 *     undo) re-runs deriveLeadActionability over ALL pistas with a live
 *     CondContext, then bumps modelRev.
 *
 * M5 ActRunner wiring (plan Part B "Cockpit" — scripted acts):
 *   - "Jugar" appears in the EntityPanel actions and on SiteList rows when the
 *     entity carries `playable` (a ready SessionConfig scanned from its
 *     lugares/<id>/ folder, paths prefixed mundo/lugares/<id>/). The button
 *     mounts the fullscreen ActRunner overlay (data-act-runner) over the
 *     cockpit, fed with the worldStore fs manager.
 *   - JOURNALING: opening with an active session logs a nota
 *     "Acto iniciado: <partName> @ <placeName>" (first visible part); closing
 *     logs "Acto cerrado: ..." with the part the GM actually ended on
 *     (tracked via onActChange in a ref — part switches inside the runner are
 *     not journaled themselves). No session = the runner just opens: viewing
 *     prep is legit without recording.
 *   - Closing unmounts the overlay; the runner's own unmount effect fades the
 *     audio out and releases it (see components/world/ActRunner.tsx).
 *
 * M5 polish — UI persistence + efecto hardening:
 *   - The uiStore slice (tier/focus/siteList/selection/panelTab/mapCollapsed/
 *     showUnknown) mirrors to sessionStorage (key world.ui.v1, see
 *     lib/world/stores.ts) so a reload lands where the GM was. ?e= deep-link
 *     navigation is SKIPPED when the restored selection already equals the
 *     param: the URL is rewritten from the live selection, so after a reload
 *     it merely duplicates the persisted slice and recomputing the tier
 *     target would stomp the restored placement — a pasted/shared link (no
 *     matching slice) still navigates. Stale persisted ids after a re-scan
 *     degrade like stale store ids always did (invalid focus -> sector tier,
 *     missing selection -> empty panel).
 *   - Map viewports: StarMap commits the transform once per FINISHED gesture
 *     (pointer released / wheel settled) through onViewportChange; the page
 *     remembers that commit per tier key ('sector' | 'system:<id>') in the
 *     same persisted slice, and the fit-to-content effect prefers a
 *     remembered viewport over computing a fit. Mid-gesture transforms stay
 *     in StarMap's refs — ephemeral by design.
 *   - medidor `:::efecto` hardening (M4 TODO): a gauge name missing from
 *     manifest.medidores degrades to a nota entry ("Efecto no aplicado:
 *     medidor desconocido <nombre>") + warning toast instead of silently
 *     creating an invisible gauge no widget renders.
 *
 * SCAN-OVERLAY ASYMMETRY (M4 decision — documented, not a bug):
 *   worldScanner.overlayUnprocessedJournals re-derives ONLY knowledge (sabe)
 *   and location knowledge (llegada) from journals with procesado: false.
 *   Pista estado transitions are intentionally NOT overlaid: a pista moved
 *   live during a session REVERTS to its file estado on reload until the
 *   agent maintenance loop processes the journal — so PROTOCOLO.md (M6) must
 *   instruct the agent to process pista entries promptly after each session.
 *   Whether the scanner should also overlay pista transitions is an M6
 *   decision; do not "fix" it here.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { FileSystemManager } from '@/lib/fileSystem';
import { loadStoredDirHandle, reconnectDirHandle, rememberDirHandle } from '@/lib/dirHandle';
import {
  clearSessionMirror,
  readSessionMirror,
  usePartyStore,
  useUiStore,
  useWorldStore,
} from '@/lib/world/stores';
import type { SessionMirror } from '@/lib/world/stores';
import { defaultPartyState, formatFecha, serializePartyState } from '@/lib/world/partyState';
import { JournalWriter } from '@/lib/world/journalWriter';
import {
  makeEntry,
  parseInicioFinPayload,
  parseLlegadaPayload,
  parsePistaPayload,
} from '@/lib/world/logEntries';
import {
  applyLlegadaConocimiento,
  deriveLeadActionability,
} from '@/lib/world/worldScanner';
import { buildCondContext } from '@/lib/world/conditions';
import { applicableTables, drawEvent } from '@/lib/world/eventEngine';
import {
  computeTravelPlan,
  sectorLegEndDay,
  travelDaySchedule,
  viveresTicksBetween,
} from '@/lib/world/travel';
import type { TravelDayConsumption } from '@/lib/world/travel';
import {
  CONOCIMIENTOS,
  ENTITY_DIRS,
  ESTADOS_PISTA,
  PARTY_STATE_FILE,
  WORLD_DIR,
} from '@/lib/world/constants';
import { buildWorldSearchIndex } from '@/lib/world/worldSearch';
import { readEntityFromUrl, writeEntityToUrl } from '@/lib/world/deepLink';
import {
  ancestryChain,
  childNodeWithin,
  sectorNodeFor,
  tierTargetFor,
} from '@/lib/world/worldNav';
import { StarMap, useMapScale } from '@/components/world/StarMap';
import type { BreadcrumbItem, MapViewport } from '@/components/world/StarMap';
import { SectorView, WORLD_SCALE } from '@/components/world/SectorView';
import { SystemView, systemFitRadius } from '@/components/world/SystemView';
import { SiteList } from '@/components/world/SiteList';
import { PartyStatusBar } from '@/components/world/PartyStatusBar';
import { EntityPanel } from '@/components/world/EntityPanel';
import type { EntityPanelEntity, EntityPanelLead } from '@/components/world/EntityPanel';
import { DiagnosticsPanel } from '@/components/world/DiagnosticsPanel';
import { WorldSearchDialog } from '@/components/world/WorldSearchDialog';
import { QuickLogBar } from '@/components/world/QuickLogBar';
import { MoverDialog } from '@/components/world/MoverDialog';
import type { MoverDialogLugar } from '@/components/world/MoverDialog';
import { JournalPanel } from '@/components/world/JournalPanel';
import { SessionRecoveryBanner } from '@/components/world/SessionRecoveryBanner';
import { LeadsBoard } from '@/components/world/LeadsBoard';
import { EventDrawer } from '@/components/world/EventDrawer';
import type { EventOutcome } from '@/components/world/EventDrawer';
import { TravelDialog } from '@/components/world/TravelDialog';
import { TravelStepper } from '@/components/world/TravelStepper';
import { RoutePreview } from '@/components/world/RoutePreview';
import { ActRunner } from '@/components/world/ActRunner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type {
  Conocimiento,
  EventEffect,
  EventTable,
  FactionPresence,
  JournalDay,
  JournalEntry,
  Lead,
  PartyState,
  PlaceEntity,
  SystemEntity,
  TravelPlan,
  WorldEntityBase,
  WorldEvent,
  WorldModel,
} from '@/types/world';
import { FolderOpen, Globe, Lock, Play, RefreshCw, Rocket, TriangleAlert } from 'lucide-react';

interface TtrpgWorldTestHook {
  openFromOPFS: () => Promise<void>;
}

type WorldTestWindow = Window & { __ttrpgWorldTest?: TtrpgWorldTestHook };

/** How the page lets the user open a folder while no world is loaded. */
type EntryMode = 'checking' | 'select' | 'reconnect';

/** The only estado path the app ever writes (inside the allowed surface). */
const ESTADO_PATH = `${WORLD_DIR}/${ENTITY_DIRS.estado}/${PARTY_STATE_FILE}`;

/** Small stable palette for faction rings, picked by hashing the faction id. */
const FACTION_PALETTE = [
  '#f59e0b', // amber
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb7185', // rose
  '#facc15', // yellow
] as const;

const NIVEL_RANK: Record<FactionPresence['nivel'], number> = {
  dominante: 3,
  fuerte: 2,
  presente: 1,
  encubierta: 0,
};

const MEDIDOR_LABELS: Record<string, string> = {
  viveres: 'Víveres',
  combustible: 'Combustible',
  nave: 'Nave',
};

function medidorLabel(nombre: string): string {
  return MEDIDOR_LABELS[nombre] ?? nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Local YYYY-MM-DD (journal fecha_real is the GM's wall-clock day). */
function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Every scanned lugar carries `servicios` — cheap PlaceEntity type guard. */
function isPlace(entity: WorldEntityBase | undefined): entity is PlaceEntity {
  return entity !== undefined && 'servicios' in entity;
}

function toPanelLead(pista: Lead): EntityPanelLead {
  return {
    id: pista.id,
    nombre: pista.nombre,
    estadoPista: pista.estadoPista,
    accionable: pista.accionable,
  };
}

// ── M4 travel + events module helpers ────────────────────────────────────────

/** A running trip (armed by the TravelDialog confirm, driven by the stepper). */
interface TravelRun {
  plan: TravelPlan;
  destinoId: string;
  destinoName: string;
  /** 1-based day ABOUT to be traveled ("Día N de total"). */
  dia: number;
  /** Per-day consumption (index dia-1); see travelDaySchedule docs. */
  schedule: TravelDayConsumption[];
  /** Last 1-based day of the sector leg — event anchor switches after it. */
  sectorEndDay: number;
}

interface RoutePreviewData {
  fromXY: { x: number; y: number };
  toXY: { x: number; y: number };
  label: string;
}

/**
 * Bridges the page-computed preview data to RoutePreview, which needs the
 * LIVE zoom k. Must render inside StarMap's children (MapScaleContext).
 */
function RouteLayer({ data }: { data: RoutePreviewData | null }) {
  const k = useMapScale();
  if (!data) return null;
  return <RoutePreview fromXY={data.fromXY} toXY={data.toXY} label={data.label} k={k} />;
}

/** Split an efecto value on its first `|`: machine part + free comment. */
function splitEffectValue(value: string): { main: string; comentario?: string } {
  const idx = value.indexOf('|');
  if (idx === -1) return { main: value.trim() };
  const comentario = value.slice(idx + 1).trim();
  return { main: value.slice(0, idx).trim(), comentario: comentario || undefined };
}

/** Raises an entity's conocimiento to at least `nivel` in memory — never lowers. */
function bumpConocimientoInMemory(
  entity: WorldEntityBase | undefined,
  nivel: Conocimiento
): void {
  if (!entity) return;
  if (CONOCIMIENTOS.indexOf(nivel) > CONOCIMIENTOS.indexOf(entity.conocimiento)) {
    entity.conocimiento = nivel;
  }
}

function diasLabel(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`;
}

export default function WorldPage() {
  const status = useWorldStore((s) => s.status);
  const model = useWorldStore((s) => s.model);
  const worldFs = useWorldStore((s) => s.fs);
  const scanProgress = useWorldStore((s) => s.scanProgress);
  const worldError = useWorldStore((s) => s.error);

  const tier = useUiStore((s) => s.tier);
  const focusSystemId = useUiStore((s) => s.focusSystemId);
  const siteListId = useUiStore((s) => s.siteListId);
  const selectedEntityId = useUiStore((s) => s.selectedEntityId);
  const showUnknown = useUiStore((s) => s.showUnknown);
  const mapCollapsed = useUiStore((s) => s.mapCollapsed);
  const panelTab = useUiStore((s) => s.panelTab);
  const uiActions = useUiStore((s) => s.actions);

  // Live party fields — hydrated from estado/grupo.md, mutated only via log().
  const diaMundo = usePartyStore((s) => s.diaMundo);
  const ubicacion = usePartyStore((s) => s.ubicacion);
  const rumbo = usePartyStore((s) => s.rumbo);
  const creditos = usePartyStore((s) => s.creditos);
  const medidores = usePartyStore((s) => s.medidores);
  const session = usePartyStore((s) => s.session);

  const [entry, setEntry] = useState<EntryMode>('checking');
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | undefined>(undefined);
  // ?e= read once at first render, BEFORE the URL-writing effect can clear it.
  const [initialDeepLink] = useState(() => readEntityFromUrl());

  // M3 cockpit state.
  const [moverOpen, setMoverOpen] = useState(false);
  const [pendingMirror, setPendingMirror] = useState<SessionMirror | null>(null);
  const [lockDismissed, setLockDismissed] = useState(false);
  const [sesionNum, setSesionNum] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // The scanned model is mutated in place for live overlays (knowledge bumps,
  // pista transitions); bumping this counter re-renders the derived views.
  const [modelRev, setModelRev] = useState(0);
  const touchModel = useCallback(() => setModelRev((rev) => rev + 1), []);

  // M4 travel + events state.
  const [travelDialog, setTravelDialog] = useState<{
    targetId: string;
    plan: TravelPlan | null;
    /** Per-day consumption for the plan, computed at dialog-open time. */
    schedule: TravelDayConsumption[];
  } | null>(null);
  const [travel, setTravel] = useState<TravelRun | null>(null);
  // Ref twins for closures that outlive a render (toast actions, deficit hook).
  const travelStateRef = useRef<TravelRun | null>(null);
  useEffect(() => {
    travelStateRef.current = travel;
  }, [travel]);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventDraw, setEventDraw] = useState<{ table: EventTable; event: WorldEvent } | null>(
    null
  );
  const [eventApplied, setEventApplied] = useState<number[]>([]);
  const [eventDrawCount, setEventDrawCount] = useState(0);
  // M5: place whose ActRunner overlay is open (null = closed) + the part the
  // GM is currently on (for the "Acto cerrado" nota — see module doc M5).
  const [actPlaceId, setActPlaceId] = useState<string | null>(null);
  const actPartNameRef = useRef<string | null>(null);
  /** Contexto + place anchor of the current drawer opening (redraw reuses them). */
  const eventSourceRef = useRef<{ contexto: 'viaje' | 'estancia'; anchorId: string | null }>({
    contexto: 'estancia',
    anchorId: null,
  });

  /**
   * M4: re-derives `accionable` for ALL pistas against a LIVE CondContext
   * (current partyStore numbers + ubicacion ancestry) and bumps modelRev.
   * Cheap (pure loops over the scanned pistas) — called after every
   * pista/medidor/creditos/llegada/sabe mutation and after undo.
   */
  const rederiveLeads = useCallback(() => {
    const currentModel = useWorldStore.getState().model;
    if (!currentModel) return;
    const party = usePartyStore.getState();
    deriveLeadActionability(
      currentModel,
      currentModel.pistas,
      [],
      buildCondContext(currentModel, party, party.ubicacion)
    );
    setModelRev((rev) => rev + 1);
  }, []);

  const mapWrapRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef<{
    model: WorldModel | null;
    tier: 'sector' | 'system';
    focus: string | null;
  }>({ model: null, tier: 'sector', focus: null });
  const deepLinkDoneRef = useRef(false);
  const journalWriterRef = useRef<JournalWriter | null>(null);
  /** Journals created in THIS app lifetime (model.diario is scan-frozen) — keeps sesion numbering fresh. */
  const extraDiarioRef = useRef<JournalDay[]>([]);

  /** The single open-and-scan path: picker, reconnect and the OPFS test hook all land here. */
  const openWorld = useCallback(async (handle: FileSystemDirectoryHandle) => {
    await useWorldStore.getState().actions.scan(handle);
    const scanned = useWorldStore.getState().model;
    // Hydrate the live party fields from estado/grupo.md (no-op mid-session).
    if (scanned) usePartyStore.getState().actions.hydrate(scanned);
  }, []);

  // Stored-handle bootstrap: granted -> scan now; prompt -> offer reconnect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadStoredDirHandle();
      if (cancelled) return;
      if (stored.status === 'granted') {
        setEntry('select');
        void openWorld(stored.handle);
      } else if (stored.status === 'prompt') {
        setPendingHandle(stored.handle);
        setEntry('reconnect');
      } else {
        setEntry('select');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openWorld]);

  // e2e OPFS seam (contract: e2e/helpers/opfs.ts). Playwright cannot drive
  // showDirectoryPicker; OPFS provides a real handle without prompts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const testWindow = window as WorldTestWindow;
    testWindow.__ttrpgWorldTest = {
      openFromOPFS: async () => {
        const handle = await navigator.storage.getDirectory();
        await openWorld(handle);
      },
    };
    return () => {
      delete testWindow.__ttrpgWorldTest;
    };
  }, [openWorld]);

  const handleSelectFolder = useCallback(async () => {
    try {
      const manager = new FileSystemManager();
      const handle = await manager.selectFolder('read');
      await rememberDirHandle(handle);
      setPendingHandle(null);
      setEntry('select');
      await openWorld(handle);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Error selecting campaign folder:', error);
    }
  }, [openWorld]);

  const handleReconnect = useCallback(async () => {
    if (!pendingHandle) return;
    const handle = await reconnectDirHandle(pendingHandle);
    if (!handle) {
      // Permission denied — keep offering the button, but say why it did nothing.
      toast.error('Permiso denegado al reconectar — vuelve a intentarlo o elige otra carpeta');
      return;
    }
    setPendingHandle(null);
    setEntry('select');
    await openWorld(handle);
  }, [pendingHandle, openWorld]);

  // ── Tier navigation ───────────────────────────────────────────────────────

  /** Select an entity AND move the map to where it lives (search/deep-link/breadcrumb). */
  const navigateToEntity = useCallback((id: string) => {
    const currentModel = useWorldStore.getState().model;
    const actions = useUiStore.getState().actions;
    if (!currentModel || !currentModel.entidades.has(id)) return;
    actions.selectEntity(id);
    actions.setPanelTab('entidad');
    const target = tierTargetFor(currentModel, id);
    if (!target) return; // non-spatial entity — selection is enough
    if (target.tier === 'system' && target.focusSystemId) {
      actions.focusSystem(target.focusSystemId);
    } else {
      actions.backToSector();
    }
    if (target.siteListId) actions.openSiteList(target.siteListId);
  }, []);

  /** Drill INTO an entity (dblclick / Entrar): sistema -> system tier; place with children -> its SiteList. */
  const enterEntity = useCallback((id: string) => {
    const currentModel = useWorldStore.getState().model;
    const actions = useUiStore.getState().actions;
    if (!currentModel) return;
    const entity = currentModel.entidades.get(id);
    if (!entity) return;
    actions.selectEntity(id);
    actions.setPanelTab('entidad');
    if (entity.tipo === 'sistema') {
      actions.focusSystem(id);
      return;
    }
    if ((currentModel.childrenOf.get(id)?.length ?? 0) > 0) {
      // Make sure the spatial tier behind the list matches the place first.
      const target = tierTargetFor(currentModel, id);
      if (target?.tier === 'system' && target.focusSystemId) {
        actions.focusSystem(target.focusSystemId);
      } else if (target) {
        actions.backToSector();
      }
      actions.openSiteList(id);
    }
  }, []);

  /** Plain selection (map/list click): also brings the Entidad tab forward. */
  const selectEntity = useCallback(
    (id: string | null) => {
      uiActions.selectEntity(id);
      if (id !== null) uiActions.setPanelTab('entidad');
    },
    [uiActions]
  );

  // ── M3: session lifecycle ─────────────────────────────────────────────────

  /**
   * Readwrite on the mundo/ handle, requested from a user gesture (one
   * prompt). OPFS handles report 'granted' from queryPermission, so e2e never
   * prompts.
   */
  const ensureWriteAccess = useCallback(async (): Promise<boolean> => {
    const fsm = useWorldStore.getState().fs;
    const root = fsm?.getDirectoryHandle();
    if (!fsm || !root) return false;
    try {
      const mundoHandle = await root.getDirectoryHandle(WORLD_DIR);
      // Handles without the permission API (e.g. OPFS on some engines) are
      // always writable — Chromium's OPFS reports 'granted' anyway.
      if (typeof mundoHandle.queryPermission !== 'function') return true;
      if ((await fsm.queryWritePermission(mundoHandle)) === 'granted') return true;
      return (await fsm.requestWritePermission(mundoHandle)) === 'granted';
    } catch (error) {
      console.error('No se pudo obtener permiso de escritura sobre mundo/:', error);
      return false;
    }
  }, []);

  /**
   * Wires the partyStore deps ONCE per page lifetime: a JournalWriter over
   * fs.writeTextFile (surface-checked inside the writer) plus the estado
   * closure bound to the constant ESTADO_PATH — the app writes nowhere else.
   * The fs manager is resolved at call time so a re-scan never leaves the
   * writer holding a stale handle.
   */
  const wireSessionDeps = useCallback((): JournalWriter => {
    if (!journalWriterRef.current) {
      const writeFile = (path: string, content: string): Promise<void> => {
        const fsm = useWorldStore.getState().fs;
        if (!fsm) return Promise.reject(new Error('No hay carpeta de campaña abierta'));
        return fsm.writeTextFile(path, content);
      };
      const writer = new JournalWriter({ writeFile });
      journalWriterRef.current = writer;
      usePartyStore.getState().actions.setDeps({
        writeEstado: (text) => writeFile(ESTADO_PATH, text),
        journal: writer,
        now: () => new Date(),
      });
    }
    return journalWriterRef.current;
  }, []);

  const handleStartSession = useCallback(async () => {
    const currentModel = useWorldStore.getState().model;
    if (!currentModel) return;
    if (!(await ensureWriteAccess())) {
      toast.error('Permisos de escritura denegados — no se pudo iniciar la sesión');
      return;
    }
    wireSessionDeps();
    const day = usePartyStore
      .getState()
      .actions.startSession([...currentModel.diario, ...extraDiarioRef.current], localToday());
    if (!day) {
      toast.error('No se pudo iniciar la sesión');
      return;
    }
    extraDiarioRef.current.push(day);
    setSesionNum(day.sesion);
    toast.success(`Sesión ${day.sesion} iniciada`);
  }, [ensureWriteAccess, wireSessionDeps]);

  const handleEndSession = useCallback(async () => {
    const summary = await usePartyStore.getState().actions.endSession();
    if (!summary) {
      toast.error('No se pudo cerrar la sesión — revisa los permisos de escritura y reintenta');
      return;
    }
    // Keep the scanned estado coherent with the closed session (in memory:
    // the forced estado write already persisted sesion_activa: false).
    const currentModel = useWorldStore.getState().model;
    if (currentModel?.estadoGrupo) currentModel.estadoGrupo.sesionActiva = false;
    const totalMin = Math.floor(summary.durationMs / 60000);
    const viajes = summary.counts.llegada ?? 0;
    const pistasCount = summary.counts.pista ?? 0;
    const net = summary.netCreditos;
    toast.success(
      `Sesión ${sesionNum ?? '—'} terminada — ${Math.floor(totalMin / 60)}h ${totalMin % 60}m · ` +
        `${viajes} ${viajes === 1 ? 'viaje' : 'viajes'} · ${net >= 0 ? '+' : ''}${net} cr · ` +
        `${pistasCount} ${pistasCount === 1 ? 'pista' : 'pistas'}`
    );
  }, [sesionNum]);

  /** Denied writes need a fresh gesture-scoped permission before retrying. */
  const handleRetryWrites = useCallback(async () => {
    if (!(await ensureWriteAccess())) {
      toast.error('Permisos de escritura denegados');
      return;
    }
    usePartyStore.getState().actions.retryWrites();
  }, [ensureWriteAccess]);

  // Elapsed-session ticker: 1s interval only while a session runs.
  useEffect(() => {
    if (!session.active) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.active]);

  const sessionElapsedMs =
    session.active && session.startedAt !== null ? Math.max(0, nowMs - session.startedAt) : 0;

  // Flush the debounced estado write on pagehide/tab-hide while ready.
  useEffect(() => {
    if (status !== 'ready') return;
    return usePartyStore.getState().actions.bindLifecycleFlush();
  }, [status]);

  // ── M3: crash recovery + stale estado lock ────────────────────────────────

  useEffect(() => {
    if (status !== 'ready' || !model) return;
    if (usePartyStore.getState().session.active) return;
    setPendingMirror(readSessionMirror());
    setLockDismissed(false);
  }, [status, model]);

  // A live session owns (and keeps refreshing) the mirror — no banner then,
  // and none after the session ends (endSession clears the mirror).
  useEffect(() => {
    if (session.active) setPendingMirror(null);
  }, [session.active]);

  const handleRecoverSession = useCallback(async () => {
    const mirror = pendingMirror;
    const currentModel = useWorldStore.getState().model;
    if (!mirror || !currentModel) return;
    if (!(await ensureWriteAccess())) {
      toast.error('Permisos de escritura denegados — no se pudo recuperar la sesión');
      return;
    }
    wireSessionDeps();
    usePartyStore.getState().actions.recoverSession(mirror, currentModel);
    setSesionNum(mirror.sesion);
    setPendingMirror(null);
    toast.success(`Sesión ${mirror.sesion} recuperada`);
  }, [pendingMirror, ensureWriteAccess, wireSessionDeps]);

  const handleDiscardMirror = useCallback(() => {
    clearSessionMirror();
    setPendingMirror(null);
  }, []);

  /**
   * Plan Part A anti-conflict protocol: `sesion_activa: true` on disk with no
   * mirror = a crashed session on another device (or an unflushed lock) — the
   * agent refuses maintenance until the GM clears it.
   */
  const staleLockVisible =
    status === 'ready' &&
    !!model?.estadoGrupo?.sesionActiva &&
    !session.active &&
    pendingMirror === null &&
    !lockDismissed;

  const handleMarkLockClosed = useCallback(async () => {
    const currentModel = useWorldStore.getState().model;
    const fsm = useWorldStore.getState().fs;
    const estado = currentModel?.estadoGrupo;
    if (!estado || !fsm) return;
    if (!(await ensureWriteAccess())) {
      toast.error('Permisos de escritura denegados');
      return;
    }
    try {
      await fsm.writeTextFile(
        ESTADO_PATH,
        serializePartyState({ ...estado, sesionActiva: false }, new Date().toISOString())
      );
      estado.sesionActiva = false;
      setLockDismissed(true);
      toast.success('Sesión marcada como cerrada en estado/grupo.md');
    } catch (error) {
      console.error('No se pudo cerrar el bloqueo de sesión:', error);
      toast.error('No se pudo escribir estado/grupo.md');
    }
  }, [ensureWriteAccess]);

  // ── M3: quick-log actions (partyStore.log is the single mutation point) ───

  const handleUndo = useCallback(() => {
    const currentModel = useWorldStore.getState().model;
    const removed = usePartyStore.getState().actions.undoLast();
    if (!removed) return;
    // Party fields revert via snapshot replay inside the store. The pista
    // overlay is reverted here; knowledge bumps from an undone llegada stay
    // raised on purpose (knowledge never lowers — scanner semantics).
    if (removed.tipo === 'pista' && currentModel) {
      const parsed = parsePistaPayload(removed.payload);
      const pista = parsed ? currentModel.pistas.find((p) => p.id === parsed.id) : undefined;
      if (
        pista &&
        parsed &&
        (ESTADOS_PISTA as readonly string[]).includes(parsed.from)
      ) {
        pista.estadoPista = parsed.from as Lead['estadoPista'];
      }
    }
    // rederiveLeads reads the store AFTER undoLast, so the replay-reverted
    // numbers apply to every requisito (not only the undone pista's).
    rederiveLeads();
    toast.success(`Última entrada deshecha (${removed.tipo})`);
  }, [rederiveLeads]);

  /**
   * Sonner action for quick-log success toasts: undo where the eyes are,
   * without the Diario tab detour. Undo stays BLOCKED mid-travel (same rule
   * as the Diario button — see the canUndo comment below), read via the ref
   * because the toast can outlive the render that created it.
   */
  const undoToastAction = useMemo(
    () => ({
      label: 'Deshacer',
      onClick: () => {
        if (travelStateRef.current !== null) return;
        handleUndo();
      },
    }),
    [handleUndo]
  );

  const handleCreditos = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      const logged = usePartyStore
        .getState()
        .actions.log(delta < 0 ? makeEntry.gasto(-delta) : makeEntry.ganancia(delta));
      if (!logged) return;
      rederiveLeads(); // requisitos like creditos>=N track the live balance
      toast.success(`${delta > 0 ? '+' : ''}${delta} créditos anotados`, {
        action: undoToastAction,
      });
    },
    [rederiveLeads, undoToastAction]
  );

  const handleMedidor = useCallback(
    (nombre: string, to: number) => {
      const store = usePartyStore.getState();
      const from = store.medidores[nombre] ?? 0;
      if (from === to) return;
      if (!store.actions.log(makeEntry.medidor(nombre, from, to))) return;
      rederiveLeads();
      toast.success(`${medidorLabel(nombre)} ${from} → ${to}`, { action: undoToastAction });
    },
    [rederiveLeads, undoToastAction]
  );

  const handleNota = useCallback((text: string) => {
    if (!usePartyStore.getState().actions.log(makeEntry.nota(text))) return;
    toast.success('Nota registrada');
  }, []);

  const handleMove = useCallback(
    (id: string) => {
      const currentModel = useWorldStore.getState().model;
      const store = usePartyStore.getState();
      if (!currentModel) return;
      if (!store.actions.log(makeEntry.llegada(id, store.diaMundo))) return;
      // In-memory knowledge bump — reuses the scanner's journal-overlay rule
      // (applyLlegadaConocimiento): destination ≥ visitado, `en:` ancestors
      // ≥ conocido. The files are updated later by the agent from the journal.
      applyLlegadaConocimiento(currentModel, id);
      rederiveLeads(); // llegada moves the ctx anchor AND unlocks donde-based pistas
      navigateToEntity(id);
      toast.success(`Llegada: ${currentModel.entidades.get(id)?.nombre ?? id}`, {
        action: undoToastAction,
      });
    },
    [navigateToEntity, rederiveLeads, undoToastAction]
  );

  const handlePistaTransition = useCallback(
    (pista: Lead, to: Lead['estadoPista']) => {
      const currentModel = useWorldStore.getState().model;
      if (!currentModel) return;
      const from = pista.estadoPista;
      if (!usePartyStore.getState().actions.log(makeEntry.pista(pista.id, from, to))) return;
      pista.estadoPista = to;
      // Full re-derive: other pistas may gate on pista:<id>:<estado> conditions.
      rederiveLeads();
      toast.success(
        `Pista «${pista.nombre}»: ${from.replace('_', ' ')} → ${to.replace('_', ' ')}`,
        { action: undoToastAction }
      );
    },
    [rederiveLeads, undoToastAction]
  );

  // ── M4: event drawer (openers first — the travel deficit hook uses them) ──

  /** Weighted draw over the tables applicable at `anchorId` for `contexto`. */
  const drawFromTables = useCallback(
    (
      contexto: 'viaje' | 'estancia',
      anchorId: string | null
    ): { table: EventTable; event: WorldEvent } | null => {
      const currentModel = useWorldStore.getState().model;
      if (!currentModel) return null;
      const party = usePartyStore.getState();
      const ctx = buildCondContext(currentModel, party, anchorId);
      const tables = applicableTables(currentModel.tablas, contexto, ctx.regionActual);
      return drawEvent(tables, ctx, Math.random);
    },
    []
  );

  const openEventDrawer = useCallback(
    (contexto: 'viaje' | 'estancia', anchorId: string | null) => {
      eventSourceRef.current = { contexto, anchorId };
      setEventDraw(drawFromTables(contexto, anchorId));
      setEventApplied([]);
      setEventDrawCount(1);
      setEventOpen(true);
    },
    [drawFromTables]
  );

  // ── M4: travel flow ───────────────────────────────────────────────────────

  /** Arrival shared by the stepper paths + portal confirm: llegada entry, knowledge bump, navigate. */
  const arriveAt = useCallback(
    (destinoId: string, comentario?: string) => {
      const currentModel = useWorldStore.getState().model;
      const store = usePartyStore.getState();
      if (!currentModel) return;
      if (!store.actions.log(makeEntry.llegada(destinoId, store.diaMundo, comentario))) return;
      applyLlegadaConocimiento(currentModel, destinoId);
      setTravel(null);
      navigateToEntity(destinoId);
      rederiveLeads();
      toast.success(`Llegada: ${currentModel.entidades.get(destinoId)?.nombre ?? destinoId}`);
    },
    [navigateToEntity, rederiveLeads]
  );

  /**
   * One clamped medidor entry (0..5); logging the clamp IS the GM override
   * record. A tick that meets an ALREADY-EMPTY gauge journals a deficit nota
   * instead of a no-op `medidor 0->0` line, and surfaces a warning toast with
   * a «Tirar evento» action (the viaje/estancia tables are the complication
   * source — the GM resolves and logs via `:::efecto`).
   */
  const logGaugeConsumption = useCallback(
    (nombre: string, amount: number, comentario?: string) => {
      if (amount <= 0) return;
      const store = usePartyStore.getState();
      const from = store.medidores[nombre] ?? 0;
      const to = Math.max(0, from - amount);
      if (from > 0) {
        store.actions.log(makeEntry.medidor(nombre, from, to, comentario));
      }
      if (amount <= from) return;
      // Deficit: the gauge cannot cover the tick(s) — complication hook.
      const dia = store.diaMundo;
      const texto =
        nombre === 'viveres'
          ? `Sin víveres desde el día ${dia} — el grupo pasa hambre; complicación pendiente`
          : nombre === 'combustible'
            ? `Sin combustible el día ${dia} — la nave queda a la deriva; complicación pendiente`
            : `Sin ${nombre} el día ${dia} — complicación pendiente`;
      if (!store.actions.log(makeEntry.nota(texto))) return;
      toast.warning(texto, {
        action: {
          label: 'Tirar evento',
          onClick: () => {
            const run = travelStateRef.current;
            const loc = usePartyStore.getState().ubicacion;
            if (run) {
              openEventDrawer('viaje', run.dia <= run.sectorEndDay ? loc : run.destinoId);
            } else {
              openEventDrawer('estancia', loc);
            }
          },
        },
      });
    },
    [openEventDrawer]
  );

  /**
   * «Descansar»: advances dia_mundo OUTSIDE travel (the stepper owns day
   * advancement mid-trip — the QuickLogBar button is disabled then). One
   * `descanso` entry + the calendar víveres ticks through the shared
   * consumption path, then re-derive (plazo / dia>=N requisitos).
   */
  const handleDescanso = useCallback(
    (dias: number) => {
      const currentModel = useWorldStore.getState().model;
      const store = usePartyStore.getState();
      if (dias <= 0 || !currentModel || !store.session.active) return;
      if (travelStateRef.current !== null) return;
      const d0 = store.diaMundo;
      if (!store.actions.log(makeEntry.descanso(dias))) return;
      const ticks = viveresTicksBetween(
        d0,
        d0 + dias,
        currentModel.manifest.viaje.viveresCadaDias
      );
      logGaugeConsumption('viveres', ticks, 'consumo de víveres');
      rederiveLeads();
      toast.success(`Descanso de ${diasLabel(dias)} — día ${d0 + dias}`);
    },
    [logGaugeConsumption, rederiveLeads]
  );

  /** "Viajar aquí": snapshot the target + plan/schedule at click time and open the dialog. */
  const handleOpenTravelDialog = useCallback(() => {
    const currentModel = useWorldStore.getState().model;
    const party = usePartyStore.getState();
    const targetId = useUiStore.getState().selectedEntityId;
    if (!currentModel || !party.ubicacion || !targetId) return;
    const plan = computeTravelPlan(party.ubicacion, targetId, currentModel, {
      medidores: party.medidores,
      diaMundo: party.diaMundo,
    });
    setTravelDialog({
      targetId,
      plan,
      schedule:
        plan && !plan.portal
          ? travelDaySchedule(plan, currentModel.manifest.viaje, party.diaMundo)
          : [],
    });
  }, []);

  const handleTravelConfirm = useCallback(() => {
    const dialog = travelDialog;
    const currentModel = useWorldStore.getState().model;
    if (!dialog || !dialog.plan || !currentModel) return;
    const store = usePartyStore.getState();
    if (!store.session.active) {
      toast.error('Inicia sesión para viajar');
      return;
    }
    const destinoName = currentModel.entidades.get(dialog.targetId)?.nombre ?? dialog.targetId;
    if (dialog.plan.portal) {
      // Portal: manual arrival, no rumbo/days/consumption (plan Part A).
      arriveAt(dialog.targetId, 'por portal');
      return;
    }
    const plan = dialog.plan;
    if (
      !store.actions.log(
        makeEntry.rumbo(dialog.targetId, plan.totalDias, store.diaMundo + plan.totalDias)
      )
    ) {
      return;
    }
    if (plan.totalDias <= 0) {
      // Degenerate 0-day plan (coincident roots): arrive immediately.
      arriveAt(dialog.targetId);
      return;
    }
    setTravel({
      plan,
      destinoId: dialog.targetId,
      destinoName,
      dia: 1,
      // Computed at dialog-open time with the same diaMundo the plan used —
      // dialog preview and stepper ticks always agree.
      schedule: dialog.schedule,
      sectorEndDay: sectorLegEndDay(plan, currentModel),
    });
    toast.success(`Rumbo a ${destinoName} — ${diasLabel(plan.totalDias)}`);
  }, [travelDialog, arriveAt]);

  /** Continuar: journal the day + its scheduled consumption; last day = arrival. */
  const handleTravelNext = useCallback(() => {
    const run = travel;
    if (!run) return;
    const store = usePartyStore.getState();
    if (!store.actions.log(makeEntry.dia(store.diaMundo, store.diaMundo + 1))) return;
    const consumo = run.schedule[run.dia - 1];
    if (consumo) {
      logGaugeConsumption('combustible', consumo.combustible, 'consumo de combustible');
      logGaugeConsumption('viveres', consumo.viveres, 'consumo de víveres');
    }
    if (run.dia >= run.plan.totalDias) {
      arriveAt(run.destinoId);
    } else {
      setTravel({ ...run, dia: run.dia + 1 });
      rederiveLeads(); // dia>=N / medidor requisitos track each travel day
    }
  }, [travel, arriveAt, logGaugeConsumption, rederiveLeads]);

  /** Resolver resto: remaining days + consumption in one batch, then arrive. */
  const handleTravelRest = useCallback(() => {
    const run = travel;
    if (!run) return;
    const store = usePartyStore.getState();
    const remaining = run.plan.totalDias - run.dia + 1;
    if (!store.actions.log(makeEntry.dia(store.diaMundo, store.diaMundo + remaining))) return;
    const totals = run.schedule.slice(run.dia - 1).reduce(
      (acc, day) => ({
        combustible: acc.combustible + day.combustible,
        viveres: acc.viveres + day.viveres,
      }),
      { combustible: 0, viveres: 0 }
    );
    logGaugeConsumption('combustible', totals.combustible, 'consumo de combustible');
    logGaugeConsumption('viveres', totals.viveres, 'consumo de víveres');
    arriveAt(run.destinoId);
  }, [travel, arriveAt, logGaugeConsumption]);

  /** Cancel: only a nota — ubicacion stays at origin (see module doc CANCEL SEMANTICS). */
  const handleTravelCancel = useCallback(() => {
    const run = travel;
    if (!run) return;
    const store = usePartyStore.getState();
    store.actions.log(
      makeEntry.nota(`Viaje interrumpido hacia ${run.destinoName} en dia ${store.diaMundo}`)
    );
    setTravel(null);
    rederiveLeads();
    toast(`Viaje a ${run.destinoName} cancelado — el grupo mantiene su posición`);
  }, [travel, rederiveLeads]);

  // A trip cannot outlive its session (log() would reject every step anyway).
  useEffect(() => {
    if (!session.active) {
      setTravel(null);
      setEventOpen(false);
    }
  }, [session.active]);

  // ── M4: event drawer (draw lifecycle) ─────────────────────────────────────

  /** Otra tirada: one redraw per opening, journals nothing by itself. */
  const handleEventRedraw = useCallback(() => {
    const { contexto, anchorId } = eventSourceRef.current;
    setEventDraw(drawFromTables(contexto, anchorId));
    setEventApplied([]);
    setEventDrawCount((count) => count + 1);
  }, [drawFromTables]);

  const handleEventOutcome = useCallback(
    (outcome: EventOutcome, nota?: string) => {
      const draw = eventDraw;
      if (!draw) return;
      const comentario =
        outcome === 'complicacion'
          ? nota
            ? `complicación: ${nota}`
            : 'complicación'
          : outcome;
      if (
        !usePartyStore
          .getState()
          .actions.log(makeEntry.evento(draw.table.id, draw.event.id, comentario))
      ) {
        return;
      }
      toast.success(`Evento «${draw.event.titulo}»: ${comentario}`);
    },
    [eventDraw]
  );

  /**
   * One `:::efecto` line -> one journal entry via makeEntry against CURRENT
   * party state. Grammar per plan Part A (module doc "Event :::efecto lines");
   * unparseable/unknown effects degrade to a nota entry.
   */
  const handleApplyEffect = useCallback(
    (effect: EventEffect) => {
      const currentModel = useWorldStore.getState().model;
      const store = usePartyStore.getState();
      const draw = eventDraw;
      if (!currentModel || !draw) return;

      const { main, comentario } = splitEffectValue(effect.value);
      let entry: JournalEntry | null = null;
      let mensaje = '';
      /** True when the effect degraded to a nota — surfaced as a warning toast. */
      let warn = false;
      /** In-memory model mutation to run only after log() accepts the entry. */
      let after: (() => void) | undefined;

      const fallbackNota = () => {
        entry = makeEntry.nota(`${effect.key}: ${effect.value}`);
        mensaje = 'Efecto no interpretable — anotado como nota';
        warn = true;
      };

      switch (effect.key) {
        case 'gasto':
        case 'ganancia': {
          if (!/^[+-]?\d+$/.test(main)) {
            fallbackNota();
            break;
          }
          const cantidad = Number(main);
          entry =
            effect.key === 'gasto'
              ? makeEntry.gasto(cantidad, comentario)
              : makeEntry.ganancia(cantidad, comentario);
          mensaje = `${effect.key === 'gasto' ? '-' : '+'}${cantidad} créditos anotados`;
          break;
        }
        case 'medidor': {
          const match = /^(\S+)\s+([+-]?\d+)$/.exec(main);
          if (!match) {
            fallbackNota();
            break;
          }
          const nombre = match[1];
          // M5 hardening: a gauge outside manifest.medidores would mutate a
          // value no widget renders — degrade to a visible nota instead.
          if (!currentModel.manifest.medidores.includes(nombre)) {
            entry = makeEntry.nota(`Efecto no aplicado: medidor desconocido ${nombre}`);
            mensaje = `Medidor desconocido «${nombre}» — anotado como nota`;
            warn = true;
            break;
          }
          const from = store.medidores[nombre] ?? 0;
          const to = Math.max(0, Math.min(5, from + Number(match[2])));
          entry = makeEntry.medidor(nombre, from, to, comentario);
          mensaje = `${medidorLabel(nombre)} ${from} → ${to}`;
          break;
        }
        case 'sabe': {
          const match = /^(\S+)\s+(\S+)$/.exec(main);
          if (!match || !(CONOCIMIENTOS as readonly string[]).includes(match[2])) {
            fallbackNota();
            break;
          }
          const id = match[1];
          const nivel = match[2] as Conocimiento;
          const from = currentModel.entidades.get(id)?.conocimiento ?? 'desconocido';
          entry = makeEntry.sabe(id, from, nivel, comentario);
          mensaje = `Sabe: ${currentModel.entidades.get(id)?.nombre ?? id} → ${nivel}`;
          after = () => bumpConocimientoInMemory(currentModel.entidades.get(id), nivel);
          break;
        }
        case 'pista': {
          const match = /^(\S+)\s+(\S+)$/.exec(main);
          const pista = match
            ? currentModel.pistas.find((candidate) => candidate.id === match[1])
            : undefined;
          if (!match || !pista || !(ESTADOS_PISTA as readonly string[]).includes(match[2])) {
            fallbackNota();
            break;
          }
          const to = match[2] as Lead['estadoPista'];
          entry = makeEntry.pista(pista.id, pista.estadoPista, to, comentario);
          mensaje = `Pista «${pista.nombre}» → ${to.replace('_', ' ')}`;
          after = () => {
            pista.estadoPista = to;
          };
          break;
        }
        case 'nota':
          entry = makeEntry.nota(effect.value);
          mensaje = 'Nota registrada';
          break;
        default:
          fallbackNota();
      }

      if (!entry || !store.actions.log(entry)) return;
      after?.();
      // Covers every effect type: creditos/medidor numbers, pista estados and
      // sabe knowledge (donde-conocido gating) all feed accionable.
      rederiveLeads();
      const index = draw.event.efectos.indexOf(effect);
      if (index >= 0) {
        setEventApplied((prev) => (prev.includes(index) ? prev : [...prev, index]));
      }
      if (warn) toast.warning(mensaje);
      else toast.success(mensaje);
    },
    [eventDraw, rederiveLeads]
  );

  // ── M5: ActRunner (scripted acts at a playable place) ────────────────────

  /** The place whose runner is open; resolves live so a re-scan closes a stale id. */
  const actRunnerPlace = useMemo(() => {
    if (!model || !actPlaceId) return null;
    const entity = model.entidades.get(actPlaceId);
    return isPlace(entity) && entity.playable ? entity : null;
  }, [model, actPlaceId]);

  const handleOpenActRunner = useCallback((id: string) => {
    const currentModel = useWorldStore.getState().model;
    const entity = currentModel?.entidades.get(id);
    if (!isPlace(entity) || !entity.playable) return;
    // First VISIBLE part (same trunk/active-path rule as the runner) — the
    // raw parts[0] could sit on a non-active path and misname the nota.
    const playable = entity.playable;
    const firstPart = playable.parts.find(
      (p) => p.pathId == null || p.pathId === (playable.activePathId ?? null)
    );
    actPartNameRef.current = firstPart?.name ?? null;
    setActPlaceId(id);
    // Journal only under an active session — viewing prep needs no recording.
    const store = usePartyStore.getState();
    if (store.session.active && firstPart) {
      store.actions.log(makeEntry.nota(`Acto iniciado: ${firstPart.name} @ ${entity.nombre}`));
    }
  }, []);

  const handleCloseActRunner = useCallback(() => {
    const place = actRunnerPlace;
    const partName = actPartNameRef.current;
    setActPlaceId(null);
    actPartNameRef.current = null;
    const store = usePartyStore.getState();
    if (place && partName && store.session.active) {
      store.actions.log(makeEntry.nota(`Acto cerrado: ${partName} @ ${place.nombre}`));
    }
  }, [actRunnerPlace]);

  /** Keeps the closing nota naming the act the GM actually ended on. */
  const handleActChange = useCallback((actName: string) => {
    actPartNameRef.current = actName;
  }, []);

  const endSummaryPreview = useMemo(() => {
    if (!session.active) return undefined;
    let viajes = 0;
    let pistasCount = 0;
    let net = 0;
    for (const e of session.entries) {
      if (e.tipo === 'llegada') viajes++;
      else if (e.tipo === 'pista') pistasCount++;
      else if (e.tipo === 'gasto') net -= Number(e.payload) || 0;
      else if (e.tipo === 'ganancia') net += Number(e.payload) || 0;
    }
    const total = session.entries.length;
    return (
      `${total} ${total === 1 ? 'registro' : 'registros'} · ` +
      `${viajes} ${viajes === 1 ? 'viaje' : 'viajes'} · ${net >= 0 ? '+' : ''}${net} cr · ` +
      `${pistasCount} ${pistasCount === 1 ? 'pista' : 'pistas'}`
    );
  }, [session]);

  // ── Derived map data ──────────────────────────────────────────────────────

  /** Focused sistema at the system tier; a stale/invalid focus degrades to the sector tier. */
  const focusSistema = useMemo(() => {
    if (!model || tier !== 'system' || !focusSystemId) return null;
    const entity = model.entidades.get(focusSystemId);
    return entity && entity.tipo === 'sistema' ? (entity as SystemEntity) : null;
  }, [model, tier, focusSystemId]);

  const activeTier: 'sector' | 'system' = focusSistema ? 'system' : 'sector';

  /** Direct children of the focused sistema (childrenOf is orbita-sorted). */
  const systemChildren = useMemo(() => {
    if (!model || !focusSistema) return [];
    return (model.childrenOf.get(focusSistema.id) ?? [])
      .map((id) => model.entidades.get(id))
      .filter(isPlace);
  }, [model, focusSistema]);

  /** Deep-space lugares: own coordinates, no parent — sector-tier nodes. */
  const deepSpace = useMemo(
    () => (model ? model.lugares.filter((lugar) => !lugar.en && lugar.coordenadas) : []),
    [model]
  );

  /**
   * Actionable-leads badge counts. A pista counts at its `donde` AND at every
   * ancestor up the `en:` chain, so sector-tier nodes (sistemas / deep-space
   * roots) surface leads that live at their inner places.
   */
  const leadsBadgeCounts = useMemo(() => {
    void modelRev; // live pista transitions mutate accionable in place
    const counts = new Map<string, number>();
    if (!model) return counts;
    for (const pista of model.pistas) {
      if (pista.accionable === false || !pista.donde) continue;
      for (const nodeId of ancestryChain(model, pista.donde)) {
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
      }
    }
    return counts;
  }, [model, modelRev]);

  /**
   * Strongest faction presence per node. Presence lives on places; it also
   * propagates up the `en:` chain so systems inherit a ring from their places.
   */
  const dominantFactionByNode = useMemo(() => {
    const best = new Map<string, { faccion: string; rank: number }>();
    if (!model) return best;
    for (const lugar of model.lugares) {
      for (const presence of lugar.facciones) {
        const rank = NIVEL_RANK[presence.nivel] ?? 0;
        for (const nodeId of ancestryChain(model, lugar.id)) {
          const current = best.get(nodeId);
          if (!current || rank > current.rank) {
            best.set(nodeId, { faccion: presence.faccion, rank });
          }
        }
      }
    }
    return best;
  }, [model]);

  const factionColor = useCallback(
    (id: string): string | undefined => {
      const dominant = dominantFactionByNode.get(id);
      if (!dominant) return undefined;
      return FACTION_PALETTE[hashString(dominant.faccion) % FACTION_PALETTE.length];
    },
    [dominantFactionByNode]
  );

  // ── Party readout (live store fields; hydrate seeds them from the file) ──

  /**
   * B1 fix: without estado/grupo.md the whole cockpit is dead-ended (no
   * "Iniciar sesión"), so the hint bar offers creating the file with the
   * defaults (the GM tweaks it later — or the agent does). Write + in-memory
   * model update + hydrate: no re-scan needed.
   */
  const handleCreateEstado = useCallback(async () => {
    const currentModel = useWorldStore.getState().model;
    const fsm = useWorldStore.getState().fs;
    if (!currentModel || currentModel.estadoGrupo || !fsm) return;
    if (!(await ensureWriteAccess())) {
      toast.error('Permisos de escritura denegados — no se pudo crear estado/grupo.md');
      return;
    }
    const estado = defaultPartyState(ESTADO_PATH);
    try {
      await fsm.writeTextFile(ESTADO_PATH, serializePartyState(estado, new Date().toISOString()));
      currentModel.estadoGrupo = estado;
      usePartyStore.getState().actions.hydrate(currentModel);
      touchModel();
      toast.success('estado/grupo.md creado — ya puedes iniciar sesión');
    } catch (error) {
      console.error('No se pudo crear estado/grupo.md:', error);
      toast.error('No se pudo escribir estado/grupo.md');
    }
  }, [ensureWriteAccess, touchModel]);

  /** Live PartyState view for the status bar; null keeps the M2 absent-file hint. */
  const estadoBar = useMemo<PartyState | null>(() => {
    void modelRev; // handleCreateEstado mutates model.estadoGrupo in place
    if (!model?.estadoGrupo) return null;
    return {
      sesionActiva: session.active,
      diaMundo,
      ubicacion,
      rumbo,
      creditos,
      medidores,
      bodyMd: '',
      filePath: model.estadoGrupo.filePath,
    };
  }, [model, modelRev, session.active, diaMundo, ubicacion, rumbo, creditos, medidores]);

  const fecha = useMemo(
    () => (model ? formatFecha(diaMundo, model.manifest) : ''),
    [model, diaMundo]
  );

  /** Root -> current breadcrumb chain for the party bar (dangling ids keep their raw id as label). */
  const locationPath = useMemo(() => {
    if (!model || !ubicacion) return [];
    return ancestryChain(model, ubicacion)
      .map((id) => ({ id, label: model.entidades.get(id)?.nombre ?? id }))
      .reverse();
  }, [model, ubicacion]);

  /**
   * Party-marker roll-up onto the ACTIVE spatial tier: at sector tier the
   * marker sits on the `en:` chain root (sistema / deep-space node); at
   * system tier on the focused sistema's direct child (or its star).
   */
  const partyMapNodeId = useMemo(() => {
    if (!model || !ubicacion) return null;
    if (activeTier === 'system' && focusSistema) {
      return childNodeWithin(model, ubicacion, focusSistema.id);
    }
    return sectorNodeFor(model, ubicacion);
  }, [model, ubicacion, activeTier, focusSistema]);

  // ── M3: Mover candidates + recents ────────────────────────────────────────

  const moverLugares = useMemo<MoverDialogLugar[]>(() => {
    void modelRev; // llegada bumps conocimiento in place
    if (!model) return [];
    return [...model.sistemas, ...model.lugares]
      .filter((e) => e.conocimiento !== 'desconocido')
      .map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo, conocimiento: e.conocimiento }));
  }, [model, modelRev]);

  /** Most-recent-first destination ids from this session's llegada/inicio entries. */
  const recentMoveIds = useMemo(() => {
    const ids: string[] = [];
    for (let i = session.entries.length - 1; i >= 0; i--) {
      const e = session.entries[i];
      let id: string | null = null;
      if (e.tipo === 'llegada') id = parseLlegadaPayload(e.payload)?.lugarId ?? null;
      else if (e.tipo === 'inicio') id = parseInicioFinPayload(e.payload)?.lugarId ?? null;
      if (id && id !== 'desconocida' && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [session.entries]);

  // ── SiteList (non-spatial tier 3) ─────────────────────────────────────────

  const siteListPlace = useMemo(() => {
    if (!model || !siteListId) return null;
    const entity = model.entidades.get(siteListId);
    return isPlace(entity) ? entity : null;
  }, [model, siteListId]);

  const siteListSites = useMemo(() => {
    if (!model || !siteListPlace) return [];
    return (model.childrenOf.get(siteListPlace.id) ?? [])
      .map((id) => model.entidades.get(id))
      .filter(isPlace);
  }, [model, siteListPlace]);

  /**
   * Pistas surfaced in the SiteList: direct matches on the lugar or a listed
   * site, plus deeper-descendant leads rolled up (`donde` remapped) to their
   * nearest listed site so the star lands on a visible row.
   */
  const siteListLeads = useMemo(() => {
    void modelRev;
    if (!model || !siteListPlace) return [];
    const siteIds = new Set(siteListSites.map((site) => site.id));
    return model.pistas.flatMap((pista) => {
      if (!pista.donde) return [];
      if (pista.donde === siteListPlace.id || siteIds.has(pista.donde)) return [pista];
      const rolledUp = childNodeWithin(model, pista.donde, siteListPlace.id);
      return rolledUp && rolledUp !== siteListPlace.id ? [{ ...pista, donde: rolledUp }] : [];
    });
  }, [model, siteListPlace, siteListSites, modelRev]);

  const siteListPartyId = useMemo(() => {
    if (!model || !ubicacion || !siteListPlace) return null;
    return childNodeWithin(model, ubicacion, siteListPlace.id);
  }, [model, ubicacion, siteListPlace]);

  // ── Selection panel data ──────────────────────────────────────────────────

  const selectedEntity = useMemo(
    () => (model && selectedEntityId ? model.entidades.get(selectedEntityId) : undefined),
    [model, selectedEntityId]
  );

  const selectedIsContainer = useMemo(() => {
    if (!model || !selectedEntity) return false;
    return (
      selectedEntity.tipo === 'sistema' ||
      (model.childrenOf.get(selectedEntity.id)?.length ?? 0) > 0
    );
  }, [model, selectedEntity]);

  /** M5: the selection when it is a playable place (offers "Jugar"). */
  const selectedPlayable = useMemo(
    () => (isPlace(selectedEntity) && selectedEntity.playable ? selectedEntity : null),
    [selectedEntity]
  );

  const childNames = useMemo(() => {
    if (!model || !selectedEntity) return [];
    return (model.childrenOf.get(selectedEntity.id) ?? []).map(
      (childId) => model.entidades.get(childId)?.nombre ?? childId
    );
  }, [model, selectedEntity]);

  const factionNames = useMemo(() => {
    if (!model || !selectedEntity) return [];
    const presencias = (selectedEntity as Partial<PlaceEntity>).facciones ?? [];
    return presencias.map((p) => model.entidades.get(p.faccion)?.nombre ?? p.faccion);
  }, [model, selectedEntity]);

  const panelLeads = useMemo<EntityPanelLead[]>(() => {
    void modelRev;
    if (!model || !selectedEntity) return [];
    return model.pistas
      .filter((pista) => pista.donde === selectedEntity.id)
      .map(toPanelLead);
  }, [model, selectedEntity, modelRev]);

  /** Descendant pistas for containers — the panel-side match of the map badge roll-up. */
  const interiorLeads = useMemo<EntityPanelLead[]>(() => {
    void modelRev;
    if (!model || !selectedEntity || !selectedIsContainer) return [];
    return model.pistas
      .filter(
        (pista) =>
          pista.donde !== undefined &&
          pista.donde !== selectedEntity.id &&
          ancestryChain(model, pista.donde).includes(selectedEntity.id)
      )
      .map(toPanelLead);
  }, [model, selectedEntity, selectedIsContainer, modelRev]);

  // ── M4: travel + events derived data ─────────────────────────────────────

  /**
   * Viajar aquí offered for spatial (sistema/lugar) non-current selections,
   * once per trip. Anything on the current location's `en:` chain is excluded
   * too: "travelling" to the sistema you are already inside would only lose
   * positional precision (ubicacion would coarsen to the container).
   */
  const canTravelToSelected = useMemo(() => {
    if (!model || !selectedEntity || !ubicacion || travel !== null) return false;
    if (ancestryChain(model, ubicacion).includes(selectedEntity.id)) return false;
    return selectedEntity.tipo === 'sistema' || isPlace(selectedEntity);
  }, [model, selectedEntity, ubicacion, travel]);

  /**
   * Event-context place anchor mid-travel: origin until the sector leg
   * completes, then the destination (module doc REGION OF ROUTE).
   */
  const travelAnchorId = useMemo(() => {
    if (!travel) return ubicacion;
    return travel.dia <= travel.sectorEndDay ? ubicacion : travel.destinoId;
  }, [travel, ubicacion]);

  /** Stepper "Tirar evento" disabled when no viaje table applies at the anchor. */
  const travelEventDisabled = useMemo(() => {
    void modelRev;
    if (!model || !travel) return true;
    const ctx = buildCondContext(model, { creditos, medidores, diaMundo }, travelAnchorId);
    return applicableTables(model.tablas, 'viaje', ctx.regionActual).length === 0;
  }, [model, travel, travelAnchorId, creditos, medidores, diaMundo, modelRev]);

  /**
   * RoutePreview endpoints (map pixels) + label for the CURRENT selection.
   * Sector tier only (SystemView has no routes layer), and only when both
   * endpoints resolve to different sector roots with coordinates and the plan
   * is a real route (not null/portal). Hidden while a trip runs.
   */
  const routePreview = useMemo<RoutePreviewData | null>(() => {
    void modelRev; // llegadas bump conocimiento/ubicacion-derived data in place
    if (!model || !ubicacion || !selectedEntity || travel !== null) return null;
    if (!canTravelToSelected) return null;
    const plan = computeTravelPlan(ubicacion, selectedEntity.id, model, { medidores, diaMundo });
    if (!plan || plan.portal) return null;
    const fromRoot = sectorNodeFor(model, ubicacion);
    const toRoot = sectorNodeFor(model, selectedEntity.id);
    if (!fromRoot || !toRoot || fromRoot === toRoot) return null;
    const fromCoords = (model.entidades.get(fromRoot) as Partial<PlaceEntity> | undefined)
      ?.coordenadas;
    const toCoords = (model.entidades.get(toRoot) as Partial<PlaceEntity> | undefined)
      ?.coordenadas;
    if (!fromCoords || !toCoords) return null;
    const label =
      diasLabel(plan.totalDias) +
      (plan.totalCombustible > 0 ? ` · −${plan.totalCombustible} combustible` : '');
    return {
      fromXY: { x: fromCoords.x * WORLD_SCALE, y: fromCoords.y * WORLD_SCALE },
      toXY: { x: toCoords.x * WORLD_SCALE, y: toCoords.y * WORLD_SCALE },
      label,
    };
  }, [model, ubicacion, selectedEntity, canTravelToSelected, medidores, diaMundo, travel, modelRev]);

  // ── Search & deep link ────────────────────────────────────────────────────

  // Model is immutable-after-scan, so the index never staleses within a scan.
  const searchIndex = useMemo(() => (model ? buildWorldSearchIndex(model) : null), [model]);

  // Deep-link init: consume ?e= once, after the first successful scan. When
  // the persisted uiStore slice already restored this exact selection the
  // navigation is skipped — recomputing the tier target would stomp the
  // restored placement (module doc "M5 polish").
  useEffect(() => {
    if (status !== 'ready' || !model || deepLinkDoneRef.current) return;
    deepLinkDoneRef.current = true;
    if (
      initialDeepLink &&
      model.entidades.has(initialDeepLink) &&
      useUiStore.getState().selectedEntityId !== initialDeepLink
    ) {
      navigateToEntity(initialDeepLink);
    }
  }, [status, model, initialDeepLink, navigateToEntity]);

  // Selection -> URL (replaceState — no history spam; declared AFTER the
  // consumer above so the pending ?e= is read before it can be cleared).
  useEffect(() => {
    if (status !== 'ready') return;
    writeEntityToUrl(selectedEntityId);
  }, [status, selectedEntityId]);

  /**
   * M5: remembers the finished-gesture viewport under its tier key so pan/zoom
   * survives tier round-trips AND reloads (persisted uiStore slice). The tier
   * key is derived from the store with the same sistema validation the render
   * path uses, so a stale focus commits under 'sector' — matching what the
   * user actually saw.
   */
  const handleViewportCommit = useCallback((next: MapViewport) => {
    setViewport(next);
    const currentModel = useWorldStore.getState().model;
    const ui = useUiStore.getState();
    const isSystem =
      ui.tier === 'system' &&
      ui.focusSystemId !== null &&
      currentModel?.entidades.get(ui.focusSystemId)?.tipo === 'sistema';
    ui.actions.rememberViewport(isSystem ? `system:${ui.focusSystemId}` : 'sector', next);
  }, []);

  // ── Fit-to-content viewport (per model AND per spatial tier) ─────────────
  // The wrapper can transiently measure 0×0 (or a few px) while the first
  // ready-render is still laying out — hydration timing, dev overlays, small
  // embeds. If the fit bailed then, nothing re-ran it (deps only change with
  // model/tier), leaving the map at the identity transform with every node
  // off-screen. A ResizeObserver bumps `mapSizeRev` so the effect retries
  // once the wrapper reaches a usable size; unusable sizes return WITHOUT
  // marking fittedRef so the retry actually recomputes.
  const [mapSizeRev, setMapSizeRev] = useState(0);
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMapSizeRev((r) => r + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, mapCollapsed]);

  useLayoutEffect(() => {
    if (status !== 'ready' || !model) return;
    // While collapsed the wrapper is the slim chip, not the map — defer the
    // fit until the map is expanded (mapCollapsed persists across navigations).
    if (mapCollapsed) return;
    const focus = focusSistema?.id ?? null;
    const fitted = fittedRef.current;
    if (fitted.model === model && fitted.tier === activeTier && fitted.focus === focus) return;
    // A remembered viewport for this tier (persisted gesture commit) beats
    // the computed fit: the GM returns to where they left the map.
    const remembered = useUiStore.getState().viewports[focus ? `system:${focus}` : 'sector'];
    if (remembered) {
      fittedRef.current = { model, tier: activeTier, focus };
      setViewport({ ...remembered });
      return;
    }
    const el = mapWrapRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    // Below ~50px the layout hasn't settled — bail WITHOUT marking fitted so
    // the ResizeObserver retry recomputes with real dimensions.
    if (width < 50 || height < 50) return;
    fittedRef.current = { model, tier: activeTier, focus };

    if (activeTier === 'system' && focusSistema) {
      // System views are centered on (0,0) with rings out to systemFitRadius.
      const radius = systemFitRadius(systemChildren);
      const PADDING = 60;
      const k = Math.min(1.5, Math.max(0.3, (Math.min(width, height) / 2 - PADDING) / radius));
      setViewport({ x: width / 2, y: height / 2, k });
      return;
    }

    const points = [
      ...model.sistemas.map((s) => s.coordenadas),
      ...deepSpace.flatMap((l) => (l.coordenadas ? [l.coordenadas] : [])),
    ];
    if (points.length === 0) {
      setViewport({ x: width / 2, y: height / 2, k: 1 });
      return;
    }
    const xs = points.map((p) => p.x * WORLD_SCALE);
    const ys = points.map((p) => p.y * WORLD_SCALE);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const PADDING = 90;
    const k = Math.min(
      1.5,
      Math.max(
        0.3,
        Math.min(
          (width - PADDING * 2) / Math.max(maxX - minX, 1),
          (height - PADDING * 2) / Math.max(maxY - minY, 1)
        )
      )
    );
    setViewport({
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
      k,
    });
  }, [status, model, activeTier, focusSistema, systemChildren, deepSpace, mapCollapsed, mapSizeRev]);

  // ── Map breadcrumb (Sector / Sistema / Lugar) with clickable pops ────────
  const breadcrumb = useMemo<BreadcrumbItem[]>(() => {
    if (!model) return [];
    const items: BreadcrumbItem[] = [];
    const atRoot = activeTier === 'sector' && !siteListPlace;
    items.push({
      label: model.manifest.nombre || 'Sector',
      onClick: atRoot ? undefined : () => uiActions.backToSector(),
    });
    if (activeTier === 'system' && focusSistema) {
      items.push({
        label: focusSistema.nombre,
        onClick: siteListPlace ? () => uiActions.closeSiteList() : undefined,
      });
    }
    if (siteListPlace) {
      items.push({ label: siteListPlace.nombre });
    }
    return items;
  }, [model, activeTier, focusSistema, siteListPlace, uiActions]);

  const handleCopyReport = useCallback(() => {
    const current = useWorldStore.getState().model;
    if (!current) return;
    const errores = current.problemas.filter((p) => p.nivel === 'error').length;
    const avisos = current.problemas.length - errores;
    const report = [
      `Diagnóstico del mundo: ${current.manifest.nombre}`,
      `${errores} ${errores === 1 ? 'error' : 'errores'} · ${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`,
      '',
      ...current.problemas.map((p) => `[${p.nivel.toUpperCase()}] ${p.archivo} — ${p.mensaje}`),
    ].join('\n');
    navigator.clipboard.writeText(report).catch((error) => {
      console.error('No se pudo copiar el informe:', error);
    });
  }, []);

  const erroresCount = model?.problemas.filter((p) => p.nivel === 'error').length ?? 0;

  // Undo is BLOCKED mid-travel: the stepper's day counter and consumption
  // schedule live outside the journal (TravelRun state), so undoing a stepper
  // entry (dia/medidor) would revert the store but not the run — the journal
  // trail would stop summing to the plan totals. Cancel the trip first (nota,
  // position kept), then undo freely.
  const canUndo = session.active && session.entries.length > 1 && travel === null;

  return (
    <div data-world-status={status} className="flex h-screen flex-col bg-background">
      {/* Bottom-center, above the QuickLogBar: feedback lands next to the
          buttons that caused it and never occludes the party status bar. */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: 96 }}
        mobileOffset={{ bottom: 96 }}
        richColors
      />
      {status === 'ready' && model ? (
        <>
          <header className="flex items-center gap-3 border-b px-4 py-2">
            <Globe className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-semibold">{model.manifest.nombre || 'Mundo'}</h1>
            <div className="ml-auto flex items-center gap-2">
              <WorldSearchDialog index={searchIndex} onResultSelect={navigateToEntity} />
              {/* Manual rescan: the app never watches the filesystem (no FS Access
                  watch API), so after the maintenance agent edits mundo/ — or after
                  an app update changes the scanner — the GM refreshes here instead
                  of hunting for a full page reload. Disabled mid-session: a rescan
                  rebuilds the model and would visually revert live pista changes. */}
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={session.active || worldFs === null}
                title={
                  session.active
                    ? 'Termina la sesión para recargar el mundo'
                    : 'Vuelve a escanear la carpeta mundo/'
                }
                aria-label="Recargar mundo"
                onClick={() => {
                  const handle = worldFs?.getDirectoryHandle();
                  if (handle) void openWorld(handle);
                }}
              >
                <RefreshCw />
                Recargar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDiagnosticsOpen((open) => !open)}
                aria-pressed={diagnosticsOpen}
                className="min-h-11"
              >
                <TriangleAlert
                  className={
                    erroresCount > 0
                      ? 'text-destructive'
                      : model.problemas.length > 0
                        ? 'text-amber-500'
                        : 'text-muted-foreground'
                  }
                />
                Diagnóstico
                <Badge variant={erroresCount > 0 ? 'destructive' : 'secondary'}>
                  {model.problemas.length}
                </Badge>
              </Button>
            </div>
          </header>

          <PartyStatusBar
            estado={estadoBar}
            onCreateEstado={handleCreateEstado}
            fecha={fecha}
            locationName={ubicacion}
            locationPath={locationPath}
            onLocationClick={navigateToEntity}
            medidorNames={model.manifest.medidores}
            sessionActive={session.active}
            onStartSession={handleStartSession}
            onEndSession={handleEndSession}
            sessionElapsedMs={sessionElapsedMs}
            writeStatus={session.writeStatus}
            onRetryWrites={handleRetryWrites}
            endSummaryPreview={endSummaryPreview}
          />

          <SessionRecoveryBanner
            visible={pendingMirror !== null && !session.active}
            journalName={pendingMirror?.journalPath.split('/').pop() ?? ''}
            onRecover={handleRecoverSession}
            onDiscard={handleDiscardMirror}
          />

          {staleLockVisible && (
            <div
              data-session-lock
              role="alert"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2"
            >
              <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">
                Bloqueo de sesión: <code className="rounded bg-muted px-1">estado/grupo.md</code>{' '}
                tiene <code className="rounded bg-muted px-1">sesion_activa: true</code> sin sesión
                en curso (posible cierre inesperado en otro dispositivo).
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-session-lock-close
                onClick={handleMarkLockClosed}
                className="min-h-11"
              >
                Marcar como cerrada
              </Button>
            </div>
          )}

          {travel && (
            <TravelStepper
              dia={travel.dia}
              totalDias={travel.plan.totalDias}
              destinoName={travel.destinoName}
              onDrawEvent={() => openEventDrawer('viaje', travelAnchorId)}
              onNextDay={handleTravelNext}
              onResolveRest={handleTravelRest}
              onCancel={handleTravelCancel}
              eventDisabled={travelEventDisabled}
            />
          )}

          {/* Diagnóstico floats over the map instead of stacking a 4th card
              into the right column (which collapsed it at small heights). */}
          {diagnosticsOpen && (
            <div
              data-diagnostics-overlay
              className="fixed right-3 top-36 z-40 flex max-h-[65vh] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl shadow-lg"
            >
              <DiagnosticsPanel problemas={model.problemas} onCopyReport={handleCopyReport} />
            </div>
          )}

          <main className="flex min-h-0 flex-1 gap-3 p-3">
            <div
              ref={mapWrapRef}
              className={
                mapCollapsed ? 'min-w-0 shrink-0 self-start' : 'relative min-h-0 min-w-0 flex-1'
              }
            >
              <StarMap
                viewport={viewport}
                onViewportChange={handleViewportCommit}
                breadcrumb={breadcrumb}
                showUnknown={showUnknown}
                onToggleUnknown={() => uiActions.setShowUnknown(!showUnknown)}
                collapsed={mapCollapsed}
                onToggleCollapsed={() => uiActions.setMapCollapsed(!mapCollapsed)}
              >
                {activeTier === 'system' && focusSistema ? (
                  <SystemView
                    sistema={focusSistema}
                    children={systemChildren}
                    selectedId={selectedEntityId}
                    partyLocationId={partyMapNodeId}
                    leadsBadgeCounts={leadsBadgeCounts}
                    factionColor={factionColor}
                    showUnknown={showUnknown}
                    onSelect={selectEntity}
                    onDrillIn={enterEntity}
                    onBack={() => uiActions.backToSector()}
                  />
                ) : (
                  <SectorView
                    sistemas={model.sistemas}
                    deepSpace={deepSpace}
                    selectedId={selectedEntityId}
                    partyLocationId={partyMapNodeId}
                    leadsBadgeCounts={leadsBadgeCounts}
                    factionColor={factionColor}
                    showUnknown={showUnknown}
                    onSelect={selectEntity}
                    onDrillIn={enterEntity}
                    routes={<RouteLayer data={routePreview} />}
                  />
                )}
              </StarMap>
            </div>

            {/* Collapsing the map is a request for panel room: the aside takes
                the freed width instead of leaving a dead void. */}
            <aside
              className={
                mapCollapsed
                  ? 'flex min-h-0 min-w-0 flex-1 flex-col gap-2'
                  : 'flex min-h-0 w-96 shrink-0 flex-col gap-2'
              }
            >
              {/* Right-panel tabs: Entidad / Pistas / Diario (plan Part B cockpit). */}
              <div role="tablist" aria-label="Panel lateral" className="flex shrink-0 gap-1 rounded-lg border bg-muted/40 p-1">
                {(
                  [
                    ['entidad', 'Entidad'],
                    ['pistas', 'Pistas'],
                    ['diario', 'Diario'],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    data-panel-tab={tab}
                    aria-selected={panelTab === tab}
                    onClick={() => uiActions.setPanelTab(tab)}
                    // min-h-11 = 44px tap target (M5 sweep).
                    className={`min-h-11 flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      panelTab === tab
                        ? 'bg-background font-medium shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {panelTab === 'entidad' && (
                <>
                  {siteListPlace && (
                    <div className="min-h-0 flex-1">
                      <SiteList
                        lugar={siteListPlace}
                        sites={siteListSites}
                        leads={siteListLeads}
                        partyLocationId={siteListPartyId}
                        onSelect={selectEntity}
                        onBack={() => uiActions.closeSiteList()}
                        onPlay={handleOpenActRunner}
                      />
                    </div>
                  )}
                  {/* When the SiteList's lugar IS the selection (the common
                      case right after "Entrar") the panel would duplicate the
                      list's own header card — skip it (UX audit P1-2a). */}
                  {selectedEntity && selectedEntity.id !== siteListPlace?.id && (
                    <div className="min-h-0 flex-1">
                      <EntityPanel
                        entity={selectedEntity as EntityPanelEntity}
                        childNames={childNames}
                        factionNames={factionNames}
                        leads={panelLeads}
                        interiorLeads={interiorLeads}
                        isCurrentLocation={selectedEntity.id === ubicacion}
                        onDrillIn={
                          selectedIsContainer ? () => enterEntity(selectedEntity.id) : undefined
                        }
                        onClose={() => uiActions.selectEntity(null)}
                        actions={
                          canTravelToSelected || selectedPlayable ? (
                            <>
                              {selectedPlayable && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  data-play-act
                                  onClick={() => handleOpenActRunner(selectedPlayable.id)}
                                  className="min-h-11"
                                >
                                  <Play />
                                  Jugar
                                </Button>
                              )}
                              {/* Primary action last: anchors the row's right edge. */}
                              {canTravelToSelected && (
                                <Button
                                  size="sm"
                                  data-travel-here
                                  onClick={handleOpenTravelDialog}
                                  className="min-h-11"
                                >
                                  <Rocket />
                                  Viajar aquí
                                </Button>
                              )}
                            </>
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                  {!siteListPlace && !selectedEntity && (
                    <Card className="flex flex-1 items-center justify-center py-8">
                      <p className="px-4 text-center text-sm text-muted-foreground">
                        Selecciona una entidad en el mapa o con la búsqueda.
                      </p>
                    </Card>
                  )}
                </>
              )}

              {panelTab === 'pistas' && (
                <div className="min-h-0 flex-1">
                  <LeadsBoard
                    pistas={model.pistas}
                    tramas={model.tramas}
                    diaMundo={diaMundo}
                    sessionActive={session.active}
                    modelRev={modelRev}
                    onTransition={(id, _from, to) => {
                      const pista = model.pistas.find((candidate) => candidate.id === id);
                      if (pista) handlePistaTransition(pista, to);
                    }}
                    onSelectPlace={navigateToEntity}
                    placeNombre={(id) => model.entidades.get(id)?.nombre}
                  />
                </div>
              )}

              {panelTab === 'diario' && (
                <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
                  <JournalPanel
                    entries={session.entries}
                    canUndo={canUndo}
                    onUndo={handleUndo}
                    undoDisabledTitle={
                      session.active && travel !== null
                        ? 'No disponible mientras hay un viaje en curso — usa «Cancelar» en la banda de viaje y deshaz después'
                        : session.active
                          ? 'Nada que deshacer todavía'
                          : 'Inicia sesión para registrar'
                    }
                    sessionActive={session.active}
                    startedAt={session.startedAt}
                  />
                </Card>
              )}
            </aside>
          </main>

          <QuickLogBar
            enabled={session.active}
            creditos={creditos}
            medidores={medidores}
            medidorNames={model.manifest.medidores}
            diaMundo={diaMundo}
            onMover={() => setMoverOpen(true)}
            onCreditos={handleCreditos}
            onMedidor={handleMedidor}
            onDescanso={handleDescanso}
            descansoDisabled={travel !== null}
            onPista={() => uiActions.setPanelTab('pistas')}
            onEvento={() => openEventDrawer('estancia', usePartyStore.getState().ubicacion)}
            eventoDisabled={travel !== null}
            onNota={handleNota}
          />

          <MoverDialog
            open={moverOpen}
            onOpenChange={setMoverOpen}
            lugares={moverLugares}
            recentIds={recentMoveIds}
            currentId={ubicacion}
            onMove={handleMove}
          />

          <TravelDialog
            open={travelDialog !== null}
            onOpenChange={(open) => {
              if (!open) setTravelDialog(null);
            }}
            plan={travelDialog?.plan ?? null}
            schedule={travelDialog?.schedule ?? []}
            sessionActive={session.active}
            fromName={
              ubicacion ? (model.entidades.get(ubicacion)?.nombre ?? ubicacion) : 'desconocida'
            }
            toName={
              travelDialog
                ? (model.entidades.get(travelDialog.targetId)?.nombre ?? travelDialog.targetId)
                : ''
            }
            medidores={medidores}
            onConfirm={handleTravelConfirm}
            nameFor={(id) => model.entidades.get(id)?.nombre ?? id}
          />

          <EventDrawer
            open={eventOpen}
            onOpenChange={setEventOpen}
            draw={
              eventDraw
                ? { tableNombre: eventDraw.table.nombre, event: eventDraw.event }
                : null
            }
            onRedraw={handleEventRedraw}
            onOutcome={handleEventOutcome}
            onApplyEffect={handleApplyEffect}
            appliedEffects={eventApplied}
            canRedraw={eventDraw !== null && eventDrawCount < 2}
          />

          {actRunnerPlace?.playable && worldFs && (
            <ActRunner
              config={actRunnerPlace.playable}
              placeName={actRunnerPlace.nombre}
              fsm={worldFs}
              onClose={handleCloseActRunner}
              onActChange={handleActChange}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Globe className="size-10 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold">Mundo</h1>

          {status === 'scanning' ? (
            <>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width: `${scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground" role="status">
                Explorando el mundo… {scanProgress.done}/{scanProgress.total || '…'}
              </p>
            </>
          ) : status === 'error' ? (
            <>
              <p className="max-w-md text-center text-sm text-destructive">{worldError}</p>
              <Button onClick={handleSelectFolder}>
                <FolderOpen />
                Seleccionar carpeta de campaña
              </Button>
            </>
          ) : entry === 'checking' ? (
            <p className="text-sm text-muted-foreground" role="status">
              Comprobando la carpeta guardada…
            </p>
          ) : entry === 'reconnect' ? (
            <>
              <p className="max-w-md text-center text-sm text-muted-foreground">
                Hay una carpeta de campaña guardada. Reconéctala para abrir el mundo sin volver a
                elegirla.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={handleReconnect}>
                  <RefreshCw />
                  Reconectar carpeta
                </Button>
                <Button variant="outline" onClick={handleSelectFolder}>
                  <FolderOpen />
                  Seleccionar otra carpeta
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-md text-center text-sm text-muted-foreground">
                Selecciona la carpeta de campaña que contiene{' '}
                <code className="rounded bg-muted px-1">mundo/mundo.md</code>.
              </p>
              <Button onClick={handleSelectFolder}>
                <FolderOpen />
                Seleccionar carpeta de campaña
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
