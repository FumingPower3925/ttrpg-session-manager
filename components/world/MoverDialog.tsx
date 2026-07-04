'use client';

/**
 * MoverDialog — destination picker for the quick-log "Mover" action (M3).
 * Pure and props-driven: the page passes the candidate lugares (already
 * filtered to conocimiento != desconocido), the recent-destination ids and
 * the current location; onMove hands back the chosen id (the page journals
 * the llegada and applies state).
 *
 * Search is a simple accent-folded `includes` over nombre/id — a picker over
 * a few dozen names needs no lunr.
 */

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Conocimiento } from '@/types/world';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, MapPin } from 'lucide-react';

const CONOCIMIENTO_LABEL: Record<Conocimiento, string> = {
  desconocido: 'Desconocido',
  rumoreado: 'Rumoreado',
  conocido: 'Conocido',
  visitado: 'Visitado',
};

/** NFD-decompose + strip combining marks: "Estación" -> "Estacion". */
function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface MoverDialogLugar {
  id: string;
  nombre: string;
  tipo: string;
  conocimiento: Conocimiento;
}

interface MoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidate destinations (page passes non-desconocido lugares + sistemas). */
  lugares: MoverDialogLugar[];
  /** Most-recent-first destination ids; rendered as the "Recientes" section. */
  recentIds: string[];
  /** Current party location: rendered disabled with "Estáis aquí". */
  currentId: string | null;
  onMove: (id: string) => void;
}

export function MoverDialog({
  open,
  onOpenChange,
  lugares,
  recentIds,
  currentId,
  onMove,
}: MoverDialogProps) {
  const [query, setQuery] = useState('');

  // Fresh search each time the dialog opens.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const { recientes, resto } = useMemo(() => {
    const folded = foldDiacritics(query.trim().toLowerCase());
    const matches = (lugar: MoverDialogLugar) =>
      folded === '' ||
      foldDiacritics(lugar.nombre.toLowerCase()).includes(folded) ||
      lugar.id.includes(folded);

    const byId = new Map(lugares.map((lugar) => [lugar.id, lugar]));
    const recientes = recentIds
      .map((id) => byId.get(id))
      .filter((lugar): lugar is MoverDialogLugar => lugar !== undefined && matches(lugar));
    const recentSet = new Set(recientes.map((lugar) => lugar.id));
    const resto = lugares
      .filter((lugar) => !recentSet.has(lugar.id) && matches(lugar))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { recientes, resto };
  }, [lugares, recentIds, query]);

  const handleMove = (id: string) => {
    onMove(id);
    onOpenChange(false);
  };

  // Enter picks the first movable candidate (recientes first) — 2-tap flow.
  // Only once something was typed: a stray Enter right after opening used to
  // journal an accidental llegada to the first Reciente.
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (query.trim() === '') return;
    const first = [...recientes, ...resto].find((lugar) => lugar.id !== currentId);
    if (first) handleMove(first.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-mover-dialog>
        <DialogHeader>
          <DialogTitle>Mover al grupo</DialogTitle>
          <DialogDescription className="sr-only">
            Elige el destino del grupo. Enter selecciona el primer resultado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Buscar destino…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            aria-label="Buscar destino"
          />

          {recientes.length === 0 && resto.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin destinos que coincidan
            </p>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-3 pr-3">
                {recientes.length > 0 && (
                  <Section
                    icon={<History className="size-3.5" aria-hidden />}
                    title="Recientes"
                    lugares={recientes}
                    currentId={currentId}
                    onMove={handleMove}
                  />
                )}
                {resto.length > 0 && (
                  <Section
                    icon={<MapPin className="size-3.5" aria-hidden />}
                    title="Todos los destinos"
                    lugares={resto}
                    currentId={currentId}
                    onMove={handleMove}
                  />
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SectionProps {
  icon: ReactNode;
  title: string;
  lugares: MoverDialogLugar[];
  currentId: string | null;
  onMove: (id: string) => void;
}

function Section({ icon, title, lugares, currentId, onMove }: SectionProps) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </p>
      <div className="space-y-1">
        {lugares.map((lugar) => {
          const isCurrent = lugar.id === currentId;
          return (
            <button
              key={lugar.id}
              type="button"
              data-mover-id={lugar.id}
              disabled={isCurrent}
              onClick={() => onMove(lugar.id)}
              className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{lugar.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {CONOCIMIENTO_LABEL[lugar.conocimiento]}
                </span>
              </span>
              <Badge variant="secondary" className="shrink-0">
                {lugar.tipo}
              </Badge>
              {isCurrent && (
                <Badge variant="outline" className="shrink-0 text-muted-foreground">
                  Estáis aquí
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
