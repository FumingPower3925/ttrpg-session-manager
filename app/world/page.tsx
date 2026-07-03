'use client';

/**
 * /world — read-only world viewer (M1).
 *
 * Folder entry paths (all end in the same open-and-scan path):
 *   - stored handle still granted  -> scan immediately on mount
 *   - stored handle needs a gesture -> "Reconectar carpeta" button
 *   - nothing stored               -> "Seleccionar carpeta de campaña" button
 *   - e2e seam: window.__ttrpgWorldTest.openFromOPFS() feeds the OPFS root
 *     handle through the same path (contract in e2e/helpers/opfs.ts)
 *
 * The page root always carries data-world-status={idle|scanning|ready|error}.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileSystemManager } from '@/lib/fileSystem';
import { loadStoredDirHandle, reconnectDirHandle, rememberDirHandle } from '@/lib/dirHandle';
import { useUiStore, useWorldStore } from '@/lib/world/stores';
import { StarMap } from '@/components/world/StarMap';
import type { MapViewport } from '@/components/world/StarMap';
import { SectorView, WORLD_SCALE } from '@/components/world/SectorView';
import { EntityPanel } from '@/components/world/EntityPanel';
import type { EntityPanelEntity, EntityPanelLead } from '@/components/world/EntityPanel';
import { DiagnosticsPanel } from '@/components/world/DiagnosticsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FactionPresence, PlaceEntity, WorldModel } from '@/types/world';
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

/** [id, parent, grandparent, ...] following `en:` up to the sector root (cycle-guarded). */
function ancestryChain(model: WorldModel, startId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let id: string | undefined = startId;
  while (id && !seen.has(id)) {
    seen.add(id);
    chain.push(id);
    const entity = model.entidades.get(id) as Partial<PlaceEntity> | undefined;
    id = entity?.en;
  }
  return chain;
}

export default function WorldPage() {
  const status = useWorldStore((s) => s.status);
  const model = useWorldStore((s) => s.model);
  const scanProgress = useWorldStore((s) => s.scanProgress);
  const worldError = useWorldStore((s) => s.error);

  const selectedEntityId = useUiStore((s) => s.selectedEntityId);
  const showUnknown = useUiStore((s) => s.showUnknown);
  const mapCollapsed = useUiStore((s) => s.mapCollapsed);
  const uiActions = useUiStore((s) => s.actions);

  const [entry, setEntry] = useState<EntryMode>('checking');
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | undefined>(undefined);

  const mapWrapRef = useRef<HTMLDivElement>(null);
  const fittedModelRef = useRef<WorldModel | null>(null);

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

  // ── Derived map data ──────────────────────────────────────────────────────

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

  // ── Selection panel data ──────────────────────────────────────────────────

  const selectedEntity = useMemo(
    () => (model && selectedEntityId ? model.entidades.get(selectedEntityId) : undefined),
    [model, selectedEntityId]
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
    if (!model || !selectedEntity) return [];
    return model.pistas
      .filter((pista) => pista.donde === selectedEntity.id)
      .map((pista) => ({
        id: pista.id,
        nombre: pista.nombre,
        estadoPista: pista.estadoPista,
        accionable: pista.accionable,
      }));
  }, [model, selectedEntity]);

  // ── Fit-to-content initial viewport (once per scanned model) ─────────────
  useLayoutEffect(() => {
    if (status !== 'ready' || !model || fittedModelRef.current === model) return;
    // While collapsed the wrapper is the slim chip, not the map — defer the
    // fit until the map is expanded (mapCollapsed persists across navigations).
    if (mapCollapsed) return;
    const el = mapWrapRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width === 0 || height === 0) return;
    fittedModelRef.current = model;

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
  }, [status, model, deepSpace, mapCollapsed]);

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

          <main className="flex min-h-0 flex-1 gap-3 p-3">
            <div
              ref={mapWrapRef}
              className={mapCollapsed ? 'min-w-0 flex-1 self-start' : 'relative min-h-0 min-w-0 flex-1'}
            >
              <StarMap
                viewport={viewport}
                onViewportChange={setViewport}
                breadcrumb={[{ label: model.manifest.nombre || 'Sector' }]}
                showUnknown={showUnknown}
                onToggleUnknown={() => uiActions.setShowUnknown(!showUnknown)}
                collapsed={mapCollapsed}
                onToggleCollapsed={() => uiActions.setMapCollapsed(!mapCollapsed)}
              >
                <SectorView
                  sistemas={model.sistemas}
                  deepSpace={deepSpace}
                  selectedId={selectedEntityId}
                  partyLocationId={null /* M2: read from estado/grupo.md */}
                  leadsBadgeCounts={leadsBadgeCounts}
                  factionColor={factionColor}
                  showUnknown={showUnknown}
                  onSelect={(id) => uiActions.selectEntity(id)}
                  /* M2 adds tier navigation; until then drill-in (dblclick) just selects. */
                  onDrillIn={(id) => uiActions.selectEntity(id)}
                />
              </StarMap>
            </div>

            {(diagnosticsOpen || selectedEntity) && (
              <aside className="flex min-h-0 w-96 shrink-0 flex-col gap-3">
                {diagnosticsOpen && (
                  <div className="min-h-0 flex-1">
                    <DiagnosticsPanel problemas={model.problemas} onCopyReport={handleCopyReport} />
                  </div>
                )}
                {selectedEntity && (
                  <div className="min-h-0 flex-1">
                    <EntityPanel
                      entity={selectedEntity as EntityPanelEntity}
                      childNames={childNames}
                      factionNames={factionNames}
                      leads={panelLeads}
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
