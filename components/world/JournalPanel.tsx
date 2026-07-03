'use client';

/**
 * JournalPanel — today's session entries in the right tab stack (M3, plan
 * Part B). Read-only list (newest at the BOTTOM, auto-scrolled) plus the one
 * editing affordance the plan allows: "Deshacer última" (the page replays the
 * remaining entries over the session-start snapshot and rewrites the file).
 */

import { useEffect, useRef } from 'react';
import { JournalEntry, JournalEntryType } from '@/types/world';
import { Button } from '@/components/ui/button';
import {
  CalendarDays,
  Eye,
  Flag,
  Gauge,
  LucideIcon,
  MapPin,
  Moon,
  Navigation,
  Play,
  StickyNote,
  Target,
  TrendingDown,
  TrendingUp,
  Undo2,
  Zap,
} from 'lucide-react';

const TIPO_ICONS: Record<JournalEntryType, LucideIcon> = {
  inicio: Play,
  fin: Flag,
  rumbo: Navigation,
  llegada: MapPin,
  gasto: TrendingDown,
  ganancia: TrendingUp,
  medidor: Gauge,
  pista: Target,
  sabe: Eye,
  evento: Zap,
  descanso: Moon,
  dia: CalendarDays,
  nota: StickyNote,
};

interface JournalPanelProps {
  /** Today's entries, chronological (oldest first — rendered top to bottom). */
  entries: JournalEntry[];
  canUndo: boolean;
  onUndo: () => void;
  sessionActive: boolean;
  /** Epoch ms of session start; null when no session ran yet. */
  startedAt: number | null;
}

export function JournalPanel({
  entries,
  canUndo,
  onUndo,
  sessionActive,
  startedAt,
}: JournalPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Newest entry lives at the bottom: keep it in view as entries append.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries.length]);

  return (
    <div data-journal-panel className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Diario de sesión</p>
          <p className="truncate text-xs text-muted-foreground">
            {sessionActive && startedAt !== null
              ? `Sesión iniciada a las ${formatStartTime(startedAt)}`
              : 'Sin sesión activa'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-journal-undo
          disabled={!canUndo}
          onClick={onUndo}
          className="min-h-11 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Undo2 />
          Deshacer última
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin registros aún.</p>
        ) : (
          <ul className="space-y-1 p-2">
            {entries.map((entry, index) => (
              <EntryRow key={`${index}-${entry.hora}-${entry.tipo}`} entry={entry} />
            ))}
          </ul>
        )}
        <div ref={endRef} aria-hidden />
      </div>
    </div>
  );
}

function formatStartTime(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const Icon = TIPO_ICONS[entry.tipo] ?? StickyNote;
  // Notas carry their text in `comentario` (payload empty): promote it to the
  // main line so the row never renders blank.
  const mainText = entry.payload || entry.comentario || '';
  const secondary = entry.payload ? entry.comentario : undefined;

  return (
    <li
      data-journal-entry={entry.tipo}
      className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{entry.hora}</span>
          <span
            className={`min-w-0 break-words text-sm ${entry.payload ? 'font-mono text-[13px]' : ''}`}
          >
            {mainText}
          </span>
        </p>
        {secondary && (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{secondary}</p>
        )}
      </div>
    </li>
  );
}
