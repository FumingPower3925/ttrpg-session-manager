'use client';

/**
 * /world — world viewer (M1) + drill-in, party readout, search & deep link (M2).
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
 *     SiteList renders as a right-panel card next to the EntityPanel (like
 *     DiagnosticsPanel) while the map stays on its spatial tier behind it —
 *     tier 3 is non-spatial by design (plan Part B), so an SVG takeover
 *     would only hide context. Back pops SiteList -> system -> sector.
 *   - Search (Cmd/Ctrl+K) and ?e= deep links navigate via tierTargetFor().
 *   - Tier changes recompute a fit-to-content viewport (instant, no tween).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileSystemManager } from '@/lib/fileSystem';
import { loadStoredDirHandle, reconnectDirHandle, rememberDirHandle } from '@/lib/dirHandle';
import { useUiStore, useWorldStore } from '@/lib/world/stores';
import { formatFecha } from '@/lib/world/partyState';
import { buildWorldSearchIndex } from '@/lib/world/worldSearch';
import { readEntityFromUrl, writeEntityToUrl } from '@/lib/world/deepLink';
import {
  ancestryChain,
  childNodeWithin,
  sectorNodeFor,
  tierTargetFor,
} from '@/lib/world/worldNav';
import { StarMap } from '@/components/world/StarMap';
import type { BreadcrumbItem, MapViewport } from '@/components/world/StarMap';
import { SectorView, WORLD_SCALE } from '@/components/world/SectorView';
import { SystemView, systemFitRadius } from '@/components/world/SystemView';
import { SiteList } from '@/components/world/SiteList';
import { PartyStatusBar } from '@/components/world/PartyStatusBar';
import { EntityPanel } from '@/components/world/EntityPanel';
import type { EntityPanelEntity, EntityPanelLead } from '@/components/world/EntityPanel';
import { DiagnosticsPanel } from '@/components/world/DiagnosticsPanel';
import { WorldSearchDialog } from '@/components/world/WorldSearchDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  FactionPresence,
  Lead,
  PlaceEntity,
  SystemEntity,
  WorldEntityBase,
  WorldModel,
} from '@/types/world';
import { FolderOpen, Globe, RefreshCw, TriangleAlert } from 'lucide-react';

interface TtrpgWorldTestHook {
  openFromOPFS: () => Promise<void>;
}

type WorldTestWindow = Window & { __ttrpgWorldTest?: TtrpgWorldTestHook };

/** How the page lets the user open a folder while no world is loaded. */
type EntryMode = 'checking' | 'select' | 'reconnect';

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

export default function WorldPage() {
  const status = useWorldStore((s) => s.status);
  const model = useWorldStore((s) => s.model);
  const scanProgress = useWorldStore((s) => s.scanProgress);
  const worldError = useWorldStore((s) => s.error);

  const tier = useUiStore((s) => s.tier);
  const focusSystemId = useUiStore((s) => s.focusSystemId);
  const siteListId = useUiStore((s) => s.siteListId);
  const selectedEntityId = useUiStore((s) => s.selectedEntityId);
  const showUnknown = useUiStore((s) => s.showUnknown);
  const mapCollapsed = useUiStore((s) => s.mapCollapsed);
  const uiActions = useUiStore((s) => s.actions);

  const [entry, setEntry] = useState<EntryMode>('checking');
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | undefined>(undefined);
  // ?e= read once at first render, BEFORE the URL-writing effect can clear it.
  const [initialDeepLink] = useState(() => readEntityFromUrl());

  const mapWrapRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef<{
    model: WorldModel | null;
    tier: 'sector' | 'system';
    focus: string | null;
  }>({ model: null, tier: 'sector', focus: null });
  const deepLinkDoneRef = useRef(false);

  /** The single open-and-scan path: picker, reconnect and the OPFS test hook all land here. */
  const openWorld = useCallback(async (handle: FileSystemDirectoryHandle) => {
    await useWorldStore.getState().actions.scan(handle);
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
    if (!handle) return; // permission denied — keep offering the button
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
    const counts = new Map<string, number>();
    if (!model) return counts;
    for (const pista of model.pistas) {
      if (pista.accionable === false || !pista.donde) continue;
      for (const nodeId of ancestryChain(model, pista.donde)) {
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
      }
    }
    return counts;
  }, [model]);

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

  // ── Party readout ─────────────────────────────────────────────────────────

  const estadoGrupo = model?.estadoGrupo ?? null;
  const ubicacion = estadoGrupo?.ubicacion ?? null;

  const fecha = useMemo(
    () => (model ? formatFecha(estadoGrupo?.diaMundo ?? 1, model.manifest) : ''),
    [model, estadoGrupo]
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
    if (!model || !siteListPlace) return [];
    const siteIds = new Set(siteListSites.map((site) => site.id));
    return model.pistas.flatMap((pista) => {
      if (!pista.donde) return [];
      if (pista.donde === siteListPlace.id || siteIds.has(pista.donde)) return [pista];
      const rolledUp = childNodeWithin(model, pista.donde, siteListPlace.id);
      return rolledUp && rolledUp !== siteListPlace.id ? [{ ...pista, donde: rolledUp }] : [];
    });
  }, [model, siteListPlace, siteListSites]);

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
    if (!model || !selectedEntity) return [];
    return model.pistas
      .filter((pista) => pista.donde === selectedEntity.id)
      .map(toPanelLead);
  }, [model, selectedEntity]);

  /** Descendant pistas for containers — the panel-side match of the map badge roll-up. */
  const interiorLeads = useMemo<EntityPanelLead[]>(() => {
    if (!model || !selectedEntity || !selectedIsContainer) return [];
    return model.pistas
      .filter(
        (pista) =>
          pista.donde !== undefined &&
          pista.donde !== selectedEntity.id &&
          ancestryChain(model, pista.donde).includes(selectedEntity.id)
      )
      .map(toPanelLead);
  }, [model, selectedEntity, selectedIsContainer]);

  // ── Search & deep link ────────────────────────────────────────────────────

  // Model is immutable-after-scan, so the index never staleses within a scan.
  const searchIndex = useMemo(() => (model ? buildWorldSearchIndex(model) : null), [model]);

  // Deep-link init: consume ?e= once, after the first successful scan.
  useEffect(() => {
    if (status !== 'ready' || !model || deepLinkDoneRef.current) return;
    deepLinkDoneRef.current = true;
    if (initialDeepLink && model.entidades.has(initialDeepLink)) {
      navigateToEntity(initialDeepLink);
    }
  }, [status, model, initialDeepLink, navigateToEntity]);

  // Selection -> URL (replaceState — no history spam; declared AFTER the
  // consumer above so the pending ?e= is read before it can be cleared).
  useEffect(() => {
    if (status !== 'ready') return;
    writeEntityToUrl(selectedEntityId);
  }, [status, selectedEntityId]);

  // ── Fit-to-content viewport (per model AND per spatial tier) ─────────────
  useLayoutEffect(() => {
    if (status !== 'ready' || !model) return;
    // While collapsed the wrapper is the slim chip, not the map — defer the
    // fit until the map is expanded (mapCollapsed persists across navigations).
    if (mapCollapsed) return;
    const focus = focusSistema?.id ?? null;
    const fitted = fittedRef.current;
    if (fitted.model === model && fitted.tier === activeTier && fitted.focus === focus) return;
    const el = mapWrapRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width === 0 || height === 0) return;
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
  }, [status, model, activeTier, focusSistema, systemChildren, deepSpace, mapCollapsed]);

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

  return (
    <div data-world-status={status} className="flex h-screen flex-col bg-background">
      {status === 'ready' && model ? (
        <>
          <header className="flex items-center gap-3 border-b px-4 py-2">
            <Globe className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-semibold">{model.manifest.nombre || 'Mundo'}</h1>
            <div className="ml-auto flex items-center gap-2">
              <WorldSearchDialog index={searchIndex} onResultSelect={navigateToEntity} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDiagnosticsOpen((open) => !open)}
                aria-pressed={diagnosticsOpen}
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
            estado={estadoGrupo}
            fecha={fecha}
            locationName={ubicacion}
            locationPath={locationPath}
            onLocationClick={navigateToEntity}
          />

          <main className="flex min-h-0 flex-1 gap-3 p-3">
            <div
              ref={mapWrapRef}
              className={mapCollapsed ? 'min-w-0 flex-1 self-start' : 'relative min-h-0 min-w-0 flex-1'}
            >
              <StarMap
                viewport={viewport}
                onViewportChange={setViewport}
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
                    onSelect={(id) => uiActions.selectEntity(id)}
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
                    onSelect={(id) => uiActions.selectEntity(id)}
                    onDrillIn={enterEntity}
                  />
                )}
              </StarMap>
            </div>

            {(diagnosticsOpen || selectedEntity || siteListPlace) && (
              <aside className="flex min-h-0 w-96 shrink-0 flex-col gap-3">
                {diagnosticsOpen && (
                  <div className="min-h-0 flex-1">
                    <DiagnosticsPanel problemas={model.problemas} onCopyReport={handleCopyReport} />
                  </div>
                )}
                {siteListPlace && (
                  <div className="min-h-0 flex-1">
                    <SiteList
                      lugar={siteListPlace}
                      sites={siteListSites}
                      leads={siteListLeads}
                      partyLocationId={siteListPartyId}
                      onSelect={(id) => uiActions.selectEntity(id)}
                      onBack={() => uiActions.closeSiteList()}
                    />
                  </div>
                )}
                {selectedEntity && (
                  <div className="min-h-0 flex-1">
                    <EntityPanel
                      entity={selectedEntity as EntityPanelEntity}
                      childNames={childNames}
                      factionNames={factionNames}
                      leads={panelLeads}
                      interiorLeads={interiorLeads}
                      onDrillIn={
                        selectedIsContainer ? () => enterEntity(selectedEntity.id) : undefined
                      }
                      onClose={() => uiActions.selectEntity(null)}
                    />
                  </div>
                )}
              </aside>
            )}
          </main>
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
