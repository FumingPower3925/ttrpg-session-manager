'use client';

/**
 * JournalPanel — today's session entries in the right tab stack (M3, plan
 * Part B). Read-only list (newest at the BOTTOM, auto-scrolled) plus the one
 * editing affordance the plan allows: "Deshacer última" (the page replays the
 * remaining entries over the session-start snapshot and rewrites the file).
 *
 * Rows render a HUMANIZED Spanish main line per entry type ("Gasto −100 cr",
 * "Medidor víveres 3 → 1") with the raw machine payload kept as the mono
 * secondary line — the file format is untouched, only the display changes.
 */

import { useEffect, useRef } from 'react';
import { JournalEntry, JournalEntryType } from '@/types/world';
import {
  parseCantidadPayload,
  parseDescansoPayload,
  parseDiaPayload,
  parseEventoPayload,
  parseInicioFinPayload,
  parseLlegadaPayload,
  parseMedidorPayload,
  parseRumboPayload,
  parseTransicionPayload,
} from '@/lib/world/logEntries';
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

const MEDIDOR_LABELS: Record<string, string> = {
  viveres: 'víveres',
  combustible: 'combustible',
  nave: 'nave',
};

function medidorLabel(nombre: string): string {
  return MEDIDOR_LABELS[nombre] ?? nombre;
}

function sinUnderscores(value: string): string {
  return value.replace(/_/g, ' ');
}

/**
 * Humanized Spanish main line per entry type; null = no humanization (the raw
 * payload renders as before). Unparseable payloads also fall back to raw.
 */
function humanizeEntry(entry: JournalEntry): string | null {
  switch (entry.tipo) {
    case 'gasto': {
      const n = parseCantidadPayload(entry.payload);
      return n === null ? null : `Gasto −${n} cr`;
    }
    case 'ganancia': {
      const n = parseCantidadPayload(entry.payload);
      return n === null ? null : `Ganancia +${n} cr`;
    }
    case 'medidor': {
      const m = parseMedidorPayload(entry.payload);
      return m === null ? null : `Medidor ${medidorLabel(m.nombre)} ${m.from} → ${m.to}`;
    }
    case 'pista': {
      const t = parseTransicionPayload(entry.payload);
      return t === null
        ? null
        : `Pista ${t.id} ${sinUnderscores(t.from)} → ${sinUnderscores(t.to)}`;
    }
    case 'sabe': {
      const t = parseTransicionPayload(entry.payload);
      return t === null ? null : `Sabe ${t.id} ${t.from} → ${t.to}`;
    }
    case 'llegada': {
      const l = parseLlegadaPayload(entry.payload);
      return l === null ? null : `Llegada a ${l.lugarId} — día ${l.dia}`;
    }
    case 'rumbo': {
      const r = parseRumboPayload(entry.payload);
      return r === null
        ? null
        : `Rumbo a ${r.destino} — ${r.dias} ${r.dias === 1 ? 'día' : 'días'}, llegada día ${r.llegadaDia}`;
    }
    case 'dia': {
      const d = parseDiaPayload(entry.payload);
      return d === null ? null : `Día ${d.from} → ${d.to}`;
    }
    case 'descanso': {
      const d = parseDescansoPayload(entry.payload);
      return d === null ? null : `Descanso ${d.dias} ${d.dias === 1 ? 'día' : 'días'}`;
    }
    case 'inicio':
    case 'fin': {
      const i = parseInicioFinPayload(entry.payload);
      if (i === null) return null;
      return `${entry.tipo === 'inicio' ? 'Inicio' : 'Fin'} — día ${i.dia} @ ${i.lugarId}`;
    }
    case 'evento': {
      const e = parseEventoPayload(entry.payload);
      return e === null ? null : `Evento ${e.tablaId} #${e.eventoId}`;
    }
    case 'nota':
      return null; // nota's text lives in comentario (promoted below)
  }
}

interface JournalPanelProps {
  /** Today's entries, chronological (oldest first — rendered top to bottom). */
  entries: JournalEntry[];
  canUndo: boolean;
  onUndo: () => void;
  /** Tooltip explaining WHY undo is unavailable (mid-travel, empty, no session). */
  undoDisabledTitle?: string;
  sessionActive: boolean;
  /** Epoch ms of session start; null when no session ran yet. */
  startedAt: number | null;
}

export function JournalPanel({
  entries,
  canUndo,
  onUndo,
  undoDisabledTitle,
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
        {/* Disabled buttons drop pointer events; the wrapper keeps the hint. */}
        <span title={canUndo ? undefined : undoDisabledTitle} className="shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-journal-undo
            disabled={!canUndo}
            onClick={onUndo}
            className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Undo2 />
            Deshacer última
          </Button>
        </span>
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
  const human = humanizeEntry(entry);
  // Notas carry their text in `comentario` (payload empty): promote it to the
  // main line so the row never renders blank.
  const mainText = human ?? entry.payload ?? '';
  const fallbackMain = mainText || entry.comentario || '';
  const showRawPayload = human !== null && entry.payload !== '';
  const comentario = entry.tipo === 'nota' ? undefined : entry.comentario;

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
            className={`min-w-0 break-words text-sm ${
              human === null && entry.payload ? 'font-mono text-[13px]' : ''
            }`}
          >
            {fallbackMain}
          </span>
        </p>
        {(showRawPayload || comentario) && (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {showRawPayload && (
              <span className="font-mono">{entry.payload}</span>
            )}
            {showRawPayload && comentario && ' · '}
            {comentario}
          </p>
        )}
      </div>
    </li>
  );
}
