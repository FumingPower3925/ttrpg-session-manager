'use client';

/**
 * WorldSearchDialog — Cmd/Ctrl+K entity search over a WorldSearchIndex.
 *
 * A thin world-mode sibling of components/play/SearchDialog (same shell:
 * trigger button + dialog + debounced input + result list) — NOT a reuse of
 * it, because its props are SearchManager/partId-shaped while this one
 * consumes WorldSearchResult ids. Selecting a result (click or Enter for the
 * top hit) hands the entity id to the page, which navigates the map.
 *
 * Enter searches the CURRENT input text synchronously (the debounced results
 * can lag what was just typed), so the top hit always matches the query on
 * screen. The sr-only DialogDescription satisfies Radix's aria-describedby
 * expectation (play's SearchDialog predates the warning and never added one).
 */

import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { WorldSearchIndex, WorldSearchResult } from '@/lib/world/worldSearch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';

const DEBOUNCE_MS = 300;

interface WorldSearchDialogProps {
  /** Rebuilt once per scan by the page (null while no world is loaded). */
  index: WorldSearchIndex | null;
  /** Receives the selected entity id; the page selects + navigates the map. */
  onResultSelect: (id: string) => void;
}

export function WorldSearchDialog({ index, onResultSelect }: WorldSearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorldSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim() || !index) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timeoutId = setTimeout(() => {
      setResults(index.search(query, 10));
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [query, index]);

  // Keyboard shortcut: Cmd/Ctrl + K (same binding as the play-mode search).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Closing by ANY path clears the query, so reopening never shows stale
  // results (Escape-close used to keep them).
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQuery('');
      setResults([]);
      setIsSearching(false);
    }
  };

  const handleSelect = (result: WorldSearchResult) => {
    onResultSelect(result.id);
    handleOpenChange(false);
  };

  // Enter must act on what the input says NOW, not on the last debounced
  // results (typing fast + Enter within DEBOUNCE_MS used to open a stale hit).
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const fresh = index && query.trim() ? index.search(query, 10) : [];
    setResults(fresh);
    setIsSearching(false);
    if (fresh.length > 0) handleSelect(fresh[0]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 gap-2" aria-label="Buscar en el mundo">
          <Search className="h-4 w-4" />
          Buscar
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" data-world-search>
        <DialogHeader>
          <DialogTitle>Buscar en el mundo</DialogTitle>
          <DialogDescription className="sr-only">
            Busca sistemas, lugares, facciones, PNJs, pistas y tramas. Enter abre el primer
            resultado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Buscar en el mundo…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
          />

          {isSearching && (
            <p className="py-4 text-center text-sm text-muted-foreground">Buscando…</p>
          )}

          {!isSearching && query && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin resultados para &quot;{query}&quot;
            </p>
          )}

          {!isSearching && results.length > 0 && (
            // eslint-disable-next-line -- native scroll: ScrollArea root lacks overflow-hidden
            <div className="max-h-[400px] overflow-y-auto">
              <div className="space-y-2 pr-4">
                {results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    data-search-result-id={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate font-medium">{result.nombre}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {result.tipo}
                      </Badge>
                    </div>
                    {result.snippet && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {result.snippet}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!query && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Escribe para buscar sistemas, lugares, facciones, PNJs, pistas y tramas
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
