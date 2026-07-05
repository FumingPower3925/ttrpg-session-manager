'use client';

/**
 * ActRunner — plays a prepared place inside /world (M5, plan Part B "Cockpit").
 *
 * Fullscreen overlay mounted by the world page when the GM hits "Jugar" on a
 * playable place. `config` IS the place's ready SessionConfig
 * (PlaceEntity.playable): scanSessionFolder() ran verbatim on the
 * `lugares/<id>/` folder and every FileReference path arrives prefixed
 * `mundo/lugares/<id>/`, so the world fs manager (campaign root) resolves
 * them directly. Composition mirrors app/play/page.tsx — the selected part's
 * plan renders through ActPanels when it is `:::` act format (MarkdownViewer
 * otherwise), and AudioControls / PartTimer / InitiativeTracker are the
 * EXISTING play components mounted unmodified (they position themselves
 * `fixed`, which inside this overlay still paints above the overlay
 * background because they are its DOM children). Support docs and images
 * ride on the same Tabs pattern as play — but images display through the
 * world FullscreenImage viewer, NOT play's ImageViewer: the play viewer
 * overlays the image title, a GM-only filename leak on the shared screen the
 * GM projects during sessions. Play mode keeps ImageViewer untouched.
 *
 * Deliberate differences from /play (kept lean on purpose):
 *   - The part selector is a local header tab row (`data-act-part` items):
 *     FloatingNav's fixed top-left placement + path-switcher props don't fit
 *     a header-owned overlay. Parts on a non-active path stay hidden (same
 *     visibleParts rule as play) and the runner offers no path switcher —
 *     playable places are expected to be trunk-only.
 *   - No SearchDialog / NotesPanel / SplitView / scroll persistence: those
 *     flows stay with the cockpit (world search, journal) outside the runner.
 *   - AUDIO LIFETIME: one AudioManager per runner instance. Closing = the
 *     page unmounts the overlay; the unmount effect fades the volume to
 *     silence (~0.8s, page stays responsive — the fade outlives the React
 *     tree) and THEN releases the element (cleanup pauses + revokes the
 *     object URL), so Cerrar never cuts the music hard.
 *
 * The page owns the act open/close journaling (see app/world/page.tsx M5
 * notes); `onActChange` keeps it informed of the current part name so the
 * closing nota names the act the GM actually ended on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileReference, Part, SessionConfig } from '@/types';
import type { EventEffect, Shop, ShopItem } from '@/types/world';
import { FileSystemManager } from '@/lib/fileSystem';
import { AudioManager } from '@/lib/audioManager';
import { isActFormat } from '@/lib/actFormat';
import { extractEfectos } from '@/lib/world/eventEngine';
import {
  effectLabel,
  splitComentario,
  stripEfectoBlocks,
} from '@/components/world/EventDrawer';
import { ActPanels } from '@/components/play/ActPanels';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { AudioControls } from '@/components/play/AudioControls';
import { PartTimer } from '@/components/play/PartTimer';
import { InitiativeTracker } from '@/components/play/InitiativeTracker';
import { FullscreenImage } from '@/components/world/FullscreenImage';
import { BattlemapViewer } from '@/components/world/BattlemapViewer';
import { ScrollableTabsRow } from '@/components/world/ScrollableTabsRow';
import { ActRunnerPartyStrip } from '@/components/world/ActRunnerPartyStrip';
import { ShopPanel } from '@/components/world/ShopPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  categorizeSupportDoc,
  SUPPORT_DOC_CATEGORY_LABEL,
  SUPPORT_DOC_CATEGORY_ORDER,
  type SupportDocCategory,
} from '@/lib/world/supportDocCategory';
import { hasStatblock, parseThreatStatblock } from '@/lib/world/threatStatblock';
import {
  Check,
  ChevronDown,
  Eye,
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Map as MapIcon,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  Swords,
  User,
  X,
} from 'lucide-react';

const CLOSE_FADE_MS = 800;
const CLOSE_FADE_INTERVAL_MS = 50;

/**
 * Fades the runner's audio to silence, then releases it (pause + revoke via
 * AudioManager.cleanup). Runs detached from React — the overlay may already
 * be unmounted while the fade finishes. Silent/paused audio is released
 * immediately.
 */
function fadeOutAndCleanup(audio: AudioManager): void {
  const startVolume = audio.getVolume();
  if (!audio.isPlaying() || startVolume <= 0) {
    audio.cleanup();
    return;
  }
  const steps = Math.ceil(CLOSE_FADE_MS / CLOSE_FADE_INTERVAL_MS);
  let step = 0;
  const interval = setInterval(() => {
    step++;
    audio.setVolume(startVolume * Math.max(0, 1 - step / steps));
    if (step >= steps) {
      clearInterval(interval);
      audio.cleanup();
    }
  }, CLOSE_FADE_INTERVAL_MS);
}

interface ActRunnerProps {
  /** The place's playable SessionConfig (paths prefixed mundo/lugares/<id>/). */
  config: SessionConfig;
  placeName: string;
  /** World fs manager bound to the CAMPAIGN root (worldStore.fs). */
  fsm: FileSystemManager;
  onClose: () => void;
  /** Fired with the part name whenever the GM switches acts. */
  onActChange?: (actName: string) => void;
  /**
   * Apply ONE of the current act's `:::efecto` state-transitions to the party
   * journal — the SAME page handler wired to EventDrawer's onApplyEffect
   * (makeEntry.* → partyStore log). Absent ⇒ no "Efectos del acto" panel.
   * Returns false when the apply was rejected (no session/model, log refused)
   * so the button is NOT ticked off for an un-journaled transition.
   */
  onApplyEffect?: (effect: EventEffect) => boolean | void;
  /** Session-gate for the apply buttons (disabled + hint when inactive). */
  sessionActive?: boolean;
  /**
   * Party state + callbacks for the in-act party strip (créditos + gauges).
   * Same values/handlers the cockpit feeds the QuickLogBar — adjustments here
   * journal identically. Omitted ⇒ no strip (e.g. an unwired caller).
   */
  creditos?: number;
  medidores?: Record<string, number>;
  medidorNames?: string[];
  onCreditos?: (delta: number) => void;
  onMedidor?: (nombre: string, to: number) => void;
  /** Shops at this place (model.tiendas). Enables the Tienda button + dialog. */
  shops?: Shop[];
  /** Buy one unit — the SAME page handler as the cockpit ShopPanel. */
  onBuy?: (item: ShopItem, precio: number) => void;
  /** Resolve a pnj id to a display name (shopkeeper label). */
  resolveName?: (id: string) => string;
}

export function ActRunner({
  config,
  placeName,
  fsm,
  onClose,
  onActChange,
  onApplyEffect,
  sessionActive = false,
  creditos,
  medidores,
  medidorNames,
  onCreditos,
  onMedidor,
  shops,
  onBuy,
  resolveName,
}: ActRunnerProps) {
  // Same visibility rule as play: trunk parts + the active path's parts.
  const visibleParts = config.parts.filter(
    (p) => p.pathId == null || p.pathId === (config.activePathId ?? null)
  );

  const [audioManager] = useState(() => new AudioManager(fsm));
  const [currentPartId, setCurrentPartId] = useState<string | null>(
    visibleParts[0]?.id ?? null
  );
  const [currentTab, setCurrentTab] = useState('plan');

  // In-act shop dialog: opened from the party strip's Tienda button.
  const [shopsOpen, setShopsOpen] = useState(false);
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const openShop = shops?.find((s) => s.id === openShopId) ?? null;
  const partyStripReady =
    creditos != null && medidores != null && medidorNames != null && !!onCreditos && !!onMedidor;
  const [previousTab, setPreviousTab] = useState('plan');
  // "Vista jugador": when ON, the Plan act view drops the GM-only rails
  // (:::gm / :::accion / :::recurso) so the GM can screen-share a player-safe
  // act. Off by default; resets each time the runner is opened (per-open state).
  const [playerView, setPlayerView] = useState(false);
  const [planContent, setPlanContent] = useState<string | null>(null);
  // "Efectos del acto": indexes into the current act's parsed :::efecto blocks
  // already applied (checks off + disables the button). Reset per act — a new
  // part's transitions start un-applied.
  const [appliedActEfectos, setAppliedActEfectos] = useState<number[]>([]);
  // Threat -> combat handoff: bumping this signal appends prefilled NPC rows to
  // the mounted InitiativeTracker (the "Añadir al combate" one-tap add). The
  // toast is a brief confirmation of what got added.
  const [addCombatants, setAddCombatants] = useState<{
    nonce: number;
    combatants: { name: string; maxHP: number; defense: number }[];
  }>({ nonce: 0, combatants: [] });
  const [combatToast, setCombatToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Content/image caches live in refs so loadContent/loadImageUrl stay stable
  // (play keeps them in state; the runner avoids the identity churn).
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const imageUrlCacheRef = useRef<Map<string, string>>(new Map());

  const currentPart: Part | undefined =
    visibleParts.find((p) => p.id === currentPartId) ?? visibleParts[0];

  // The current act's declared state-transitions: parse its plan's :::efecto
  // blocks with the SAME grammar the event scanner uses (extractEfectos), so
  // the GM can one-tap apply them instead of hand-performing each across three
  // panels mid-narration. Empty when the act has no :::efecto (no panel).
  const actEfectos: EventEffect[] = useMemo(
    () => (planContent ? extractEfectos(planContent.split(/\r?\n/)).efectos : []),
    [planContent]
  );

  // Audio teardown belongs to unmount (Cerrar just asks the page to unmount
  // us), so a parent-driven unmount — world reset, re-scan — fades too. The
  // image object URLs are revoked here as well: unlike /play (page-lifetime
  // cache), each runner opening mints fresh URLs, so leaving them alive would
  // leak one blob reference per viewed image per opening.
  useEffect(() => {
    const imageUrlCache = imageUrlCacheRef.current;
    return () => {
      fadeOutAndCleanup(audioManager);
      imageUrlCache.forEach((url) => URL.revokeObjectURL(url));
      imageUrlCache.clear();
    };
  }, [audioManager]);

  const loadContent = useCallback(
    async (file: FileReference): Promise<string> => {
      const cached = contentCacheRef.current.get(file.path);
      if (cached !== undefined) return cached;
      try {
        const content = await fsm.readTextFile(file.path);
        contentCacheRef.current.set(file.path, content);
        return content;
      } catch (error) {
        console.error(`Error al cargar ${file.path}:`, error);
        return `# No se pudo abrir el archivo

**Archivo**: ${file.name}
**Ruta**: ${file.path}

El archivo no se encontró en la carpeta de campaña. Puede haber sido movido
o cambiado de nombre después del escaneo — usa "Recargar mundo" y vuelve a
abrir el acto.`;
      }
    },
    [fsm]
  );

  const loadImageUrl = useCallback(
    async (file: FileReference): Promise<string> => {
      const cached = imageUrlCacheRef.current.get(file.path);
      if (cached !== undefined) return cached;
      const url = await fsm.getFileURL(file.path);
      imageUrlCacheRef.current.set(file.path, url);
      return url;
    },
    [fsm]
  );

  // Part activation: plan content for the timer + audio wiring (same guards
  // as play's loadPartContent: keep the current BGM/event playlist when the
  // new part shares it, never auto-start an empty BGM list).
  useEffect(() => {
    const part = currentPart;
    if (!part) return;

    let cancelled = false;
    if (part.planFile) {
      void loadContent(part.planFile).then((content) => {
        if (!cancelled) setPlanContent(content);
      });
    } else {
      setPlanContent(null);
    }

    const isInEventMode = audioManager.getCurrentMode() === 'event';
    const bgmPlaylist = audioManager.getBGMPlaylist();
    const isSameBGM =
      audioManager.getCurrentMode() === 'bgm' &&
      bgmPlaylist.length === part.bgmPlaylist.length &&
      bgmPlaylist.every((track, index) => track.path === part.bgmPlaylist[index]?.path);
    const currentEventPlaylist = audioManager.getCurrentEventPlaylist();
    const eventPlaylistStillExists =
      currentEventPlaylist !== null &&
      part.eventPlaylists.some((playlist) => playlist.id === currentEventPlaylist.id);

    audioManager.loadBGM(part.bgmPlaylist);
    audioManager.loadEventPlaylists(part.eventPlaylists);
    if (part.bgmPlaylist.length > 0 && !isSameBGM && (!isInEventMode || !eventPlaylistStillExists)) {
      void audioManager.playBGM();
    }

    return () => {
      cancelled = true;
    };
  }, [currentPart, audioManager, loadContent]);

  // Applied-effect ticks are per-act: switching acts starts the new act's
  // transitions un-applied (keyed on the resolved part id so the auto-selected
  // first act resets too, not just explicit clicks).
  const currentPartKey = currentPart?.id ?? null;
  useEffect(() => {
    setAppliedActEfectos([]);
  }, [currentPartKey]);

  const handleApplyActEfecto = useCallback(
    (effect: EventEffect, index: number) => {
      if (!onApplyEffect || !sessionActive) return;
      // Only tick the button off if the effect was actually journaled — a
      // rejected apply (false) must stay un-applied so nothing silently reverts.
      if (onApplyEffect(effect) === false) return;
      setAppliedActEfectos((prev) => (prev.includes(index) ? prev : [...prev, index]));
    },
    [onApplyEffect, sessionActive]
  );

  const handlePartChange = useCallback(
    (part: Part) => {
      setCurrentPartId(part.id);
      setCurrentTab('plan');
      setPreviousTab('plan');
      onActChange?.(part.name);
    },
    [onActChange]
  );

  const handleTabChange = useCallback(
    (newTab: string) => {
      if (newTab.startsWith('image-') || newTab.startsWith('battlemap-'))
        setPreviousTab(currentTab);
      setCurrentTab(newTab);
    },
    [currentTab]
  );

  // A threat pane's "Añadir al combate" click lands here: parse the doc, build
  // N combatants, bump the tracker's addCombatants signal, flash a toast. The
  // fallback name keeps the row usable even if the ficha has no parseable name.
  const handleAddToCombat = useCallback(
    (content: string, fallbackName: string, count: number) => {
      const parsed = parseThreatStatblock(content);
      if (parsed.ca == null || parsed.pv == null) return;
      const base = parsed.nombre?.trim() || fallbackName;
      const n = Math.max(1, Math.min(8, Math.floor(count) || 1));
      const combatants = Array.from({ length: n }, (_, i) => ({
        name: n > 1 ? `${base} #${i + 1}` : base,
        maxHP: parsed.pv as number,
        defense: parsed.ca as number,
      }));
      setAddCombatants((prev) => ({ nonce: prev.nonce + 1, combatants }));

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setCombatToast(`${base} ×${n} → combate`);
      toastTimerRef.current = setTimeout(() => setCombatToast(null), 2600);
    },
    []
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  /** "bram_oskar.md" -> "bram oskar" — tabs read as names, not filenames. */
  const docTabLabel = (name: string): string =>
    name.replace(/\.md$/i, '').replace(/_/g, ' ');

  const handleImageClose = useCallback(() => {
    setCurrentTab(previousTab);
  }, [previousTab]);

  // battlemaps may be absent on configs stored before this field existed.
  const battlemaps = currentPart?.battlemaps ?? [];

  const hasTabs =
    currentPart !== undefined &&
    (currentPart.images.length > 0 ||
      battlemaps.length > 0 ||
      currentPart.supportDocs.length > 0);

  // The support docs live behind the "Fichas" dropdown (not as flat tabs), so
  // the current tab may be `doc-<n>` with no matching TabsTrigger. Radix still
  // activates the matching TabsContent; this index just drives the dropdown's
  // active highlight + trigger label.
  const activeDocIndex =
    currentTab.startsWith('doc-') ? Number(currentTab.slice('doc-'.length)) : -1;

  return (
    <div data-act-runner className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* pr keeps the Cerrar button clear of AudioControls' top-right pill. */}
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b py-2 pr-24 pl-4">
        <h2 className="text-lg font-semibold whitespace-nowrap">{placeName}</h2>
        <div
          role="tablist"
          aria-label="Actos del lugar"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
        >
          {visibleParts.map((part, index) => (
            <button
              key={part.id}
              type="button"
              role="tab"
              data-act-part={part.name}
              aria-selected={part.id === currentPart?.id}
              onClick={() => handlePartChange(part)}
              // min-h-11 = 44px tap target (M5 sweep).
              className={`flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${
                part.id === currentPart?.id
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {part.name}
              {/* "ENTRADA" flags where to start: node places have no acto1, so
                  the first available act (e.g. acto2) is the real entry point. */}
              {index === 0 && (
                <span
                  data-act-entry
                  className="rounded-sm bg-primary/15 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase"
                >
                  Entrada
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Vista jugador: hide GM-only rails so the Plan act is safe to screen-share. */}
        <Button
          variant={playerView ? 'default' : 'outline'}
          size="sm"
          data-player-view
          data-active={playerView || undefined}
          aria-pressed={playerView}
          onClick={() => setPlayerView((v) => !v)}
          aria-label="Vista jugador"
          title="Oculta las notas del GM para compartir pantalla"
          className="min-h-11 whitespace-nowrap"
        >
          <Eye />
          Vista jugador
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-act-close
          onClick={onClose}
          aria-label={`Cerrar ${placeName}`}
          className="min-h-11"
        >
          <X />
          Cerrar
        </Button>
      </header>

      {partyStripReady && (
        <ActRunnerPartyStrip
          creditos={creditos!}
          medidores={medidores!}
          medidorNames={medidorNames!}
          enabled={sessionActive}
          onCreditos={onCreditos!}
          onMedidor={onMedidor!}
          shopCount={shops?.length ?? 0}
          onOpenShops={() => {
            setOpenShopId(shops && shops.length === 1 ? shops[0].id : null);
            setShopsOpen(true);
          }}
        />
      )}

      {shops && shops.length > 0 && (
        <Dialog
          open={shopsOpen}
          onOpenChange={(open) => {
            setShopsOpen(open);
            if (!open) setOpenShopId(null);
          }}
        >
          <DialogContent
            data-act-shop-dialog
            className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"
          >
            <DialogHeader>
              <DialogTitle>{openShop ? openShop.nombre : 'Tiendas'}</DialogTitle>
              <DialogDescription className="sr-only">
                Tienda del lugar — suministros y equipo
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {openShop ? (
                <ShopPanel
                  shop={openShop}
                  pnjNombre={
                    openShop.pnj ? (resolveName?.(openShop.pnj) ?? openShop.pnj) : undefined
                  }
                  onBack={() => {
                    if (shops.length > 1) setOpenShopId(null);
                    else setShopsOpen(false);
                  }}
                  onBuy={(item, precio) => onBuy?.(item, precio)}
                  enabled={sessionActive}
                />
              ) : (
                <ul className="space-y-1">
                  {shops.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        data-act-shop-pick={s.id}
                        onClick={() => setOpenShopId(s.id)}
                        className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <ShoppingCart className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{s.nombre}</span>
                        {s.pnj && (
                          <span className="text-xs text-muted-foreground">
                            · {resolveName?.(s.pnj) ?? s.pnj}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AudioControls
        audioManager={audioManager}
        eventPlaylists={currentPart?.eventPlaylists ?? []}
      />

      {currentPart && (
        <PartTimer
          partId={currentPart.id}
          partName={currentPart.name}
          planContent={planContent}
        />
      )}

      <InitiativeTracker
        playerCharacters={config.playerCharacters}
        pcStats={config.pcStats}
        addCombatants={addCombatants}
      />

      {combatToast && (
        <div
          data-combat-toast
          role="status"
          className="fixed top-16 left-1/2 z-[60] -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-lg"
        >
          {combatToast}
        </div>
      )}

      {currentPart ? (
        <Tabs
          value={currentTab}
          onValueChange={handleTabChange}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {hasTabs && (
            <div className="flex shrink-0 items-center gap-2 border-b px-4">
              <ScrollableTabsRow>
                <TabsList className="h-10 w-max flex-nowrap">
                  <TabsTrigger value="plan" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Plan
                  </TabsTrigger>
                  {currentPart.images.map((img, index) => (
                    <TabsTrigger key={`img-${index}`} value={`image-${index}`} className="gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {img.name}
                    </TabsTrigger>
                  ))}
                  {battlemaps.map((map, index) => (
                    <TabsTrigger
                      key={`battlemap-${index}`}
                      value={`battlemap-${index}`}
                      className="gap-1.5"
                    >
                      <Grid3x3 className="h-3.5 w-3.5" />
                      {docTabLabel(map.name)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollableTabsRow>

              {currentPart.supportDocs.length > 0 && (
                <FichasMenu
                  docs={currentPart.supportDocs}
                  activeIndex={activeDocIndex}
                  docTabLabel={docTabLabel}
                  onSelect={(index) => handleTabChange(`doc-${index}`)}
                />
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <TabsContent
              value="plan"
              className="m-0 h-full data-[state=active]:flex data-[state=active]:flex-col"
            >
              {/* GM-only: hidden under Vista jugador, like the :::gm rails. */}
              {!playerView && actEfectos.length > 0 && onApplyEffect && (
                <ActEfectosPanel
                  efectos={actEfectos}
                  applied={appliedActEfectos}
                  sessionActive={sessionActive}
                  onApply={handleApplyActEfecto}
                />
              )}
              {currentPart.planFile ? (
                <RunnerMarkdown
                  file={currentPart.planFile}
                  loadContent={loadContent}
                  playerView={playerView}
                />
              ) : (
                <div className="flex h-full flex-1 items-center justify-center">
                  <p className="text-muted-foreground">Este acto no tiene archivo de plan</p>
                </div>
              )}
            </TabsContent>

            {currentPart.images.map((img, index) => (
              <TabsContent key={`img-${index}`} value={`image-${index}`} className="m-0 h-full">
                <RunnerImage file={img} loadImageUrl={loadImageUrl} onClose={handleImageClose} />
              </TabsContent>
            ))}

            {battlemaps.map((map, index) => (
              <TabsContent
                key={`battlemap-${index}`}
                value={`battlemap-${index}`}
                className="m-0 h-full"
              >
                <RunnerBattlemap
                  file={map}
                  loadImageUrl={loadImageUrl}
                  onClose={handleImageClose}
                />
              </TabsContent>
            ))}

            {currentPart.supportDocs.map((doc, index) => (
              <TabsContent
                key={`doc-${index}`}
                value={`doc-${index}`}
                className="m-0 h-full data-[state=active]:flex"
              >
                <RunnerMarkdown
                  file={doc}
                  loadContent={loadContent}
                  isThreat={categorizeSupportDoc(doc.path) === 'amenazas'}
                  onAddToCombat={handleAddToCombat}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Este lugar no tiene actos preparados.</p>
        </div>
      )}
    </div>
  );
}

/**
 * "Efectos del acto" — GM-only strip at the top of the Plan tab listing the
 * current act's declared `:::efecto` state-transitions as one-tap apply
 * buttons (mirrors EventDrawer's Efectos button list). Each applied button
 * checks off + disables. Session-gated: with no active session the buttons are
 * disabled and carry the "Inicia sesión para aplicar" hint (like QuickLogBar),
 * so an un-logged transition can never silently revert. Rendered only when the
 * act HAS efectos (the caller guards that + Vista jugador).
 */
function ActEfectosPanel({
  efectos,
  applied,
  sessionActive,
  onApply,
}: {
  efectos: EventEffect[];
  applied: number[];
  sessionActive: boolean;
  onApply: (effect: EventEffect, index: number) => void;
}) {
  return (
    <div data-act-efectos className="shrink-0 border-b bg-muted/20 px-4 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" aria-hidden />
        Efectos del acto
        {!sessionActive && (
          <span data-act-efectos-hint className="ml-1 normal-case font-normal">
            · Inicia sesión para aplicar
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {efectos.map((efecto, index) => {
          const isApplied = applied.includes(index);
          const { comentario } = splitComentario(efecto.value);
          return (
            <Button
              key={index}
              type="button"
              variant={isApplied ? 'secondary' : 'outline'}
              size="sm"
              disabled={isApplied || !sessionActive}
              title={!sessionActive ? 'Inicia sesión para aplicar' : comentario}
              data-act-efecto={index}
              onClick={() => onApply(efecto, index)}
              // min-h-11 = 44px tap target (M5 sweep).
              className="min-h-11"
            >
              {isApplied && <Check className="text-emerald-600 dark:text-emerald-400" />}
              {effectLabel(efecto)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Markdown pane: `:::` act format -> ActPanels 3-panel view, else MarkdownViewer. */
function RunnerMarkdown({
  file,
  loadContent,
  isThreat = false,
  onAddToCombat,
  playerView = false,
}: {
  file: FileReference;
  loadContent: (file: FileReference) => Promise<string>;
  /** True when this doc lives in a threats/ folder (category 'amenazas'). */
  isThreat?: boolean;
  /** Adds N combatants parsed from `content` to the initiative tracker. */
  onAddToCombat?: (content: string, fallbackName: string, count: number) => void;
  /** Player-safe act view: drops the GM-only rails from ActPanels. */
  playerView?: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    void loadContent(file).then((text) => {
      if (!cancelled) setContent(text);
    });
    return () => {
      cancelled = true;
    };
  }, [file, loadContent]);

  if (content === null) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  // A threat ficha with a parseable CA/PV statblock gets a one-tap add-to-combat
  // header above the body. Non-threat docs and threat docs without a statblock
  // render exactly as before (no header).
  const showAdd = isThreat && onAddToCombat !== undefined && hasStatblock(content);

  // `:::efecto` blocks (the act's declared state-transitions, surfaced as the
  // GM-only "Efectos del acto" apply buttons) are not an actFormat block type —
  // strip them so they never render as stray prose in the act view (mirrors
  // EventDrawer's stripEfectoBlocks before parseAct).
  const body = isActFormat(content) ? (
    <ActPanels content={stripEfectoBlocks(content)} playerView={playerView} />
  ) : (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <MarkdownViewer content={content} />
      </div>
    </div>
  );

  if (!showAdd) return body;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AddToCombatBar
        content={content}
        fallbackName={file.name.replace(/\.md$/i, '').replace(/_/g, ' ')}
        onAddToCombat={onAddToCombat}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">{body}</div>
    </div>
  );
}

/**
 * The "⚔️ Añadir al combate" header shown above a threat ficha with a statblock.
 * A 1–8 count stepper (default 1) plus the add button: clicking hands the raw
 * doc content + the desired count up to ActRunner, which parses + appends the
 * combatants and flashes a toast.
 */
function AddToCombatBar({
  content,
  fallbackName,
  onAddToCombat,
}: {
  content: string;
  fallbackName: string;
  onAddToCombat: (content: string, fallbackName: string, count: number) => void;
}) {
  const [count, setCount] = useState(1);
  const parsed = parseThreatStatblock(content);
  const name = parsed.nombre?.trim() || fallbackName;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
      <span className="text-sm font-medium">{name}</span>
      {parsed.ca != null && (
        <span className="text-muted-foreground text-xs">CA {parsed.ca}</span>
      )}
      {parsed.pv != null && (
        <span className="text-muted-foreground text-xs">PV {parsed.pv}</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Menos"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span
          data-threat-count
          className="w-6 text-center text-sm font-medium tabular-nums"
        >
          {count}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Más"
          onClick={() => setCount((c) => Math.min(8, c + 1))}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          data-threat-add
          className="ml-1 min-h-8"
          onClick={() => onAddToCombat(content, fallbackName, count)}
        >
          <Swords className="h-3.5 w-3.5" />
          Añadir al combate
        </Button>
      </div>
    </div>
  );
}

/** Image pane: resolves the object URL, then hands off to the player-safe viewer. */
function RunnerImage({
  file,
  loadImageUrl,
  onClose,
}: {
  file: FileReference;
  loadImageUrl: (file: FileReference) => Promise<string>;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    void loadImageUrl(file).then(
      (url) => {
        if (!cancelled) setImageUrl(url);
      },
      (error) => {
        console.error(`Error al cargar la imagen ${file.path}:`, error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [file, loadImageUrl]);

  if (imageUrl === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Cargando imagen…</p>
      </div>
    );
  }

  return <FullscreenImage imageUrl={imageUrl} onClose={onClose} />;
}

/** Battlemap pane: resolves the object URL, then hands off to the pan/zoom/grid viewer. */
function RunnerBattlemap({
  file,
  loadImageUrl,
  onClose,
}: {
  file: FileReference;
  loadImageUrl: (file: FileReference) => Promise<string>;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    void loadImageUrl(file).then(
      (url) => {
        if (!cancelled) setImageUrl(url);
      },
      (error) => {
        console.error(`Error al cargar el mapa ${file.path}:`, error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [file, loadImageUrl]);

  if (imageUrl === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Cargando mapa…</p>
      </div>
    );
  }

  return <BattlemapViewer imageUrl={imageUrl} onClose={onClose} />;
}

const CATEGORY_ICON: Record<SupportDocCategory, typeof User> = {
  personajes: User,
  amenazas: Swords,
  mapas: MapIcon,
  otros: FileText,
};

/**
 * Fichas dropdown: collapses the many support-doc tabs (characters/, threats/,
 * maps/*.md, …) into one grouped menu so the tab strip stops overflowing.
 * Items are grouped by inferred category (path prefix) with a section label
 * and icon; selecting one drives the SAME Tabs value (`doc-<index>`) the flat
 * tabs used, so the existing <TabsContent value="doc-<index>"> renders it. The
 * trigger highlights and names the active doc when a `doc-N` tab is open.
 */
function FichasMenu({
  docs,
  activeIndex,
  docTabLabel,
  onSelect,
}: {
  docs: FileReference[];
  activeIndex: number;
  docTabLabel: (name: string) => string;
  onSelect: (index: number) => void;
}) {
  const isActive = activeIndex >= 0 && activeIndex < docs.length;
  const activeDoc = isActive ? docs[activeIndex] : undefined;

  // Preserve each doc's original index (the TabsContent key) while grouping.
  const grouped = SUPPORT_DOC_CATEGORY_ORDER.map((category) => ({
    category,
    items: docs
      .map((doc, index) => ({ doc, index }))
      .filter(({ doc }) => categorizeSupportDoc(doc.path) === category),
  })).filter((group) => group.items.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-fichas-menu
          data-active={isActive || undefined}
          className={`flex h-8 min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap transition-colors ${
            isActive
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          <span className="max-w-40 truncate">
            {activeDoc ? docTabLabel(activeDoc.name) : 'Fichas'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60vh] w-56 overflow-y-auto">
        {grouped.map((group, groupIndex) => {
          const Icon = CATEGORY_ICON[group.category];
          return (
            <div key={group.category}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {SUPPORT_DOC_CATEGORY_LABEL[group.category]}
              </DropdownMenuLabel>
              {group.items.map(({ doc, index }) => (
                <DropdownMenuItem
                  key={`doc-${index}`}
                  data-fichas-item
                  data-active={index === activeIndex || undefined}
                  onSelect={() => onSelect(index)}
                  className={index === activeIndex ? 'bg-accent text-accent-foreground' : ''}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{docTabLabel(doc.name)}</span>
                </DropdownMenuItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
