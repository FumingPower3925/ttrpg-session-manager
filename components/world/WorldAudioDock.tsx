'use client';

/**
 * WorldAudioDock — bottom-left cockpit dock for the world-level music
 * (`mundo/musica/`: generic ambient/travel BGM rotation + named event
 * playlists). ALWAYS mounted by app/world/page.tsx in the world-ready state,
 * whether or not the scanned model.musica carries tracks — an empty
 * mundo/musica/ (or no folder) must read as "no music yet", not as a broken
 * cockpit. The page owns the AudioManager lifecycle (created on ready ONLY
 * when there is at least one track, disposed on model change/unmount); when
 * there are zero tracks `audioManager` is null and the dock opens to a small
 * empty-state panel instead of the AudioControls — no manager exists to
 * render.
 *
 * REUSES the play AudioControls unmodified. That component positions itself
 * `fixed top-4 right-0` with a hover-pill collapse — a layout owned by /play
 * and the ActRunner overlay, where the top-right edge is free. Here it is
 * not (header buttons + the Diagnóstico overlay live there), and the plan
 * reserves bottom-center for timer/toasts and the right column for actions,
 * so the dock parks bottom-LEFT and adapts the panel with scoped CSS instead
 * of forking the component:
 *   - the hover pill (`div.cursor-pointer`) is display:none — the dock's own
 *     music button is the expand/collapse affordance;
 *   - AudioControls' two fixed divs are forced into normal flow (`static!`)
 *     and the inline collapse transform is neutralized (`transform-none!`,
 *     !important beats the inline style), so the full panel simply IS the
 *     dock's content and sizes it.
 * If AudioControls ever changes its root markup, revisit those selectors.
 *
 * `concealed` (ActRunner open) hides the dock with CSS but keeps it MOUNTED,
 * so the open/closed state survives the audio handoff — e2e asserts
 * aria-pressed across an open/close round-trip. The audio ducking itself
 * lives in the page (see the actRunnerPlace wiring), not here.
 */

import { useState } from 'react';
import type { AudioFile, EventPlaylist } from '@/types';
import { AudioManager } from '@/lib/audioManager';
import { AudioControls } from '@/components/play/AudioControls';
import { Button } from '@/components/ui/button';
import { Music2 } from 'lucide-react';

interface WorldAudioDockProps {
  /**
   * Page-owned world-level manager, already loaded with bgm + playlists —
   * null when mundo/musica/ carries zero tracks (the dock shows an empty
   * state instead; no manager is ever created for an empty folder).
   */
  audioManager: AudioManager | null;
  bgm: AudioFile[];
  eventPlaylists: EventPlaylist[];
  /** True while the ActRunner overlay owns the room — hidden, state kept. */
  concealed: boolean;
}

export function WorldAudioDock({
  audioManager,
  bgm,
  eventPlaylists,
  concealed,
}: WorldAudioDockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div data-world-audio="dock" className={concealed ? 'hidden' : undefined}>
      {open &&
        (audioManager ? (
          <div
            data-world-audio="panel"
            className="fixed bottom-40 left-3 z-40 max-h-[calc(100vh-20rem)] w-[21rem] overflow-y-auto rounded-xl border bg-background shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
              <span className="font-medium">Música del mundo</span>
              <span
                className="text-xs text-muted-foreground"
                data-world-audio-bgm-count={bgm.length}
                data-world-audio-playlist-count={eventPlaylists.length}
              >
                {bgm.length} {bgm.length === 1 ? 'pista' : 'pistas'} · {eventPlaylists.length}{' '}
                {eventPlaylists.length === 1 ? 'lista' : 'listas'}
              </span>
            </div>
            {/* Scoped CSS adapter for the reused AudioControls (see module doc). */}
            <div className="[&>div.cursor-pointer]:hidden [&>div]:static! [&>div]:transform-none!">
              <AudioControls audioManager={audioManager} eventPlaylists={eventPlaylists} />
            </div>
          </div>
        ) : (
          <div
            data-world-audio="panel"
            data-world-audio-empty
            className="fixed bottom-40 left-3 z-40 w-[21rem] rounded-xl border bg-background p-3 text-sm shadow-lg"
          >
            <p className="font-medium">Sin música cargada</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Añade pistas .mp3 en <code className="rounded bg-muted px-1">mundo/musica/</code> (raíz
              = rotación; subcarpetas = listas).
            </p>
          </div>
        ))}
      {/* min-h-11 = 44px tap target (M5 sweep). Above the QuickLogBar; the
          bottom-center strip stays free for the Toaster (offset 96px). */}
      <Button
        type="button"
        variant={open ? 'default' : 'outline'}
        size="sm"
        data-world-audio="toggle"
        aria-pressed={open}
        aria-label="Música del mundo"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-24 left-3 z-40 min-h-11 shadow-md"
      >
        <Music2 />
        Música
      </Button>
    </div>
  );
}
