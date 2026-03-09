'use client';

import { useState, useEffect } from 'react';
import { SearchManager, SearchResult } from '@/lib/search';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText } from 'lucide-react';

type SearchScope = 'current' | 'all';

interface SearchDialogProps {
  searchManager: SearchManager | null;
  onResultClick: (filePath: string) => void;
  currentPartId: string | null;
  currentPartName: string | null;
}

export function SearchDialog({ searchManager, onResultClick, currentPartId, currentPartName }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scope, setScope] = useState<SearchScope>('current');

  useEffect(() => {
    if (!query.trim() || !searchManager) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(() => {
      const filterPartId = scope === 'current' ? (currentPartId ?? undefined) : undefined;
      const searchResults = searchManager.search(query, 10, filterPartId);
      setResults(searchResults);
      setIsSearching(false);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [query, searchManager, scope, currentPartId]);

  useEffect(() => {
    // Keyboard shortcut: Cmd/Ctrl + K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    onResultClick(result.ref);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Search className="h-4 w-4" />
          Search
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search Documents</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search plans, NPCs, monsters, maps..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
            <button
              onClick={() => setScope('current')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scope === 'current'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Current Part{currentPartName ? ` (${currentPartName})` : ''}
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scope === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Parts
            </button>
          </div>

          {isSearching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Searching...
            </p>
          )}

          {!isSearching && query && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No results found for &quot;{query}&quot;
              {scope === 'current' && (
                <span className="block mt-1">
                  <button
                    onClick={() => setScope('all')}
                    className="text-primary hover:underline"
                  >
                    Try searching all parts
                  </button>
                </span>
              )}
            </p>
          )}

          {!isSearching && results.length > 0 && (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {results.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => handleResultClick(result)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{result.name}</p>
                          {scope === 'all' && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                              result.partId === currentPartId
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {result.partName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {result.context}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {!query && (
            <div className="text-sm text-muted-foreground text-center py-8">
              <p>Type to search through your campaign documents</p>
              <p className="mt-2 text-xs">Plans • NPCs • Monsters • Maps • FAQs</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
