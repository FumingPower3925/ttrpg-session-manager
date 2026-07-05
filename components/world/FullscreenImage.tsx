'use client';

/**
 * FullscreenImage — PLAYER-SAFE fullscreen image viewer for /world.
 *
 * The GM projects this to the players' shared screen, so the overlay renders
 * the image and ABSOLUTELY NOTHING ELSE: no title, no filename, no captions,
 * no buttons, no chrome — solid black behind the image (the play-mode
 * ImageViewer overlays the filename, which leaks GM-only info; that component
 * stays untouched for /play). Keep it that way: any visible text added here
 * is a spoiler on the table's screen.
 *
 * Closing: any click on the overlay or the Escape key. The affordance is
 * documented for assistive tech via the overlay's aria-label ONLY (aria-label
 * never renders visually, so the player screen stays clean).
 */

import { useEffect } from 'react';

interface FullscreenImageProps {
  /** Resolved object URL (the caller owns the URL lifecycle/revocation). */
  imageUrl: string;
  onClose: () => void;
}

export function FullscreenImage({ imageUrl, onClose }: FullscreenImageProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // PLAYER-SAFETY: while an image is projected to the table, mark the document
  // so GM-only chrome that escapes the z-[200] overlay is suppressed — sonner
  // toasts render at z-index 999999999 (above everything), so a background
  // write/debounce firing a toast would leak onto the screen. A CSS rule in
  // globals.css hides [data-sonner-toaster] under html[data-projecting]. A
  // ref-count on the element keeps it correct if two viewers ever overlap.
  useEffect(() => {
    const root = document.documentElement;
    const next = Number(root.dataset.projectingCount ?? '0') + 1;
    root.dataset.projectingCount = String(next);
    root.setAttribute('data-projecting', 'true');
    return () => {
      const left = Number(root.dataset.projectingCount ?? '1') - 1;
      if (left <= 0) {
        root.removeAttribute('data-projecting');
        delete root.dataset.projectingCount;
      } else {
        root.dataset.projectingCount = String(left);
      }
    };
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Escape is handled at window level above.
    <div
      data-fullscreen-image
      role="button"
      aria-label="Imagen a pantalla completa — cierra con un clic o con Escape"
      className="fixed inset-0 z-[200] flex cursor-pointer items-center justify-center bg-black"
      onClick={onClose}
    >
      {/* Plain <img>: object URLs need no next/image pipeline, and alt stays
          empty on purpose — no text may reach the shared screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
