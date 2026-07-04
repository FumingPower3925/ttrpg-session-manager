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
 * otherwise), and AudioControls / PartTimer / InitiativeTracker / ImageViewer
 * are the EXISTING play components mounted unmodified (they position
 * themselves `fixed`, which inside this overlay still paints above the
 * overlay background because they are its DOM children). Support docs and
 * images ride on the same Tabs pattern as play.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileReference, Part, SessionConfig } from '@/types';
import { FileSystemManager } from '@/lib/fileSystem';
import { AudioManager } from '@/lib/audioManager';
import { isActFormat } from '@/lib/actFormat';
import { ActPanels } from '@/components/play/ActPanels';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { AudioControls } from '@/components/play/AudioControls';
import { PartTimer } from '@/components/play/PartTimer';
import { InitiativeTracker } from '@/components/play/InitiativeTracker';
import { ImageViewer } from '@/components/play/ImageViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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
}

export function ActRunner({ config, placeName, fsm, onClose, onActChange }: ActRunnerProps) {
  // Same visibility rule as play: trunk parts + the active path's parts.
  const visibleParts = config.parts.filter(
    (p) => p.pathId == null || p.pathId === (config.activePathId ?? null)
  );

  const [audioManager] = useState(() => new AudioManager(fsm));
  const [currentPartId, setCurrentPartId] = useState<string | null>(
    visibleParts[0]?.id ?? null
  );
  const [currentTab, setCurrentTab] = useState('plan');
  const [previousTab, setPreviousTab] = useState('plan');
  const [planContent, setPlanContent] = useState<string | null>(null);
  // Content/image caches live in refs so loadContent/loadImageUrl stay stable
  // (play keeps them in state; the runner avoids the identity churn).
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const imageUrlCacheRef = useRef<Map<string, string>>(new Map());

  const currentPart: Part | undefined =
    visibleParts.find((p) => p.id === currentPartId) ?? visibleParts[0];

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
      if (newTab.startsWith('image-')) setPreviousTab(currentTab);
      setCurrentTab(newTab);
    },
    [currentTab]
  );

  /** "bram_oskar.md" -> "bram oskar" — tabs read as names, not filenames. */
  const docTabLabel = (name: string): string =>
    name.replace(/\.md$/i, '').replace(/_/g, ' ');

  const handleImageClose = useCallback(() => {
    setCurrentTab(previousTab);
  }, [previousTab]);

  const hasTabs =
    currentPart !== undefined &&
    (currentPart.images.length > 0 || currentPart.supportDocs.length > 0);

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
          {visibleParts.map((part) => (
            <button
              key={part.id}
              type="button"
              role="tab"
              data-act-part={part.name}
              aria-selected={part.id === currentPart?.id}
              onClick={() => handlePartChange(part)}
              // min-h-11 = 44px tap target (M5 sweep).
              className={`min-h-11 rounded-md px-2.5 py-1 text-sm transition-colors ${
                part.id === currentPart?.id
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {part.name}
            </button>
          ))}
        </div>
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
      />

      {currentPart ? (
        <Tabs
          value={currentTab}
          onValueChange={handleTabChange}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {hasTabs && (
            <div className="shrink-0 border-b px-4">
              <TabsList className="h-10">
                <TabsTrigger value="plan">Plan</TabsTrigger>
                {currentPart.images.map((img, index) => (
                  <TabsTrigger key={`img-${index}`} value={`image-${index}`}>
                    {img.name}
                  </TabsTrigger>
                ))}
                {currentPart.supportDocs.map((doc, index) => (
                  <TabsTrigger key={`doc-${index}`} value={`doc-${index}`}>
                    {docTabLabel(doc.name)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <TabsContent value="plan" className="m-0 h-full data-[state=active]:flex">
              {currentPart.planFile ? (
                <RunnerMarkdown file={currentPart.planFile} loadContent={loadContent} />
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

            {currentPart.supportDocs.map((doc, index) => (
              <TabsContent
                key={`doc-${index}`}
                value={`doc-${index}`}
                className="m-0 h-full data-[state=active]:flex"
              >
                <RunnerMarkdown file={doc} loadContent={loadContent} />
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

/** Markdown pane: `:::` act format -> ActPanels 3-panel view, else MarkdownViewer. */
function RunnerMarkdown({
  file,
  loadContent,
}: {
  file: FileReference;
  loadContent: (file: FileReference) => Promise<string>;
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

  if (isActFormat(content)) {
    return <ActPanels content={content} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <MarkdownViewer content={content} />
      </div>
    </div>
  );
}

/** Image pane: resolves the object URL, then hands off to ImageViewer. */
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

  return <ImageViewer imageUrl={imageUrl} imageName={file.name} onClose={onClose} />;
}
