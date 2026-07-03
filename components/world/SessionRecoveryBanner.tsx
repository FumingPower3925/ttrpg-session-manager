'use client';

/**
 * SessionRecoveryBanner — amber strip shown when a sessionStorage mirror (or
 * a journal with `sesion_activa: true`) survives a crash/reload (M3, plan
 * Part B write path). Pure: the page decides visibility and owns both
 * recovery paths.
 */

import { Button } from '@/components/ui/button';
import { TriangleAlert } from 'lucide-react';

interface SessionRecoveryBannerProps {
  visible: boolean;
  /** Journal file name of the interrupted session, e.g. "2026-07-12_s08.md". */
  journalName: string;
  /** Re-arm the session over the mirrored entries. */
  onRecover: () => void;
  /** Drop the mirror and stay idle (the file on disk is untouched). */
  onDiscard: () => void;
}

export function SessionRecoveryBanner({
  visible,
  journalName,
  onRecover,
  onDiscard,
}: SessionRecoveryBannerProps) {
  if (!visible) return null;

  return (
    <div
      data-session-recovery
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2"
    >
      <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        Sesión interrumpida detectada{' '}
        <span className="font-mono text-xs text-muted-foreground">({journalName})</span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-session-recover
          onClick={onRecover}
          className="min-h-11"
        >
          Recuperar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-session-discard
          onClick={onDiscard}
          className="min-h-11"
        >
          Descartar
        </Button>
      </div>
    </div>
  );
}
