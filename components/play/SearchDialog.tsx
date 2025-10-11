'use client';

import { useState, useEffect } from 'react';
import { SearchManager, SearchResult } from '@/lib/search';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText } from 'lucide-react';

interface SearchDialogProps {
  searchManager: SearchManager | null;
  onResultClick: (filePath: string) => void;
}

export function SearchDialog({ searchManager, onResultClick }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim() || !searchManager) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(() => {
      const searchResults = searchManager.search(query);
      setResults(searchResults);
      setIsSearching(false);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [query, searchManager]);

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
          <Input
            placeholder="Search plans, NPCs, monsters, maps..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full"
            autoFocus
          />

          {isSearching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Searching...
            </p>
          )}

          {!isSearching && query && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No results found for "{query}"
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
                        <p className="font-medium truncate">{result.name}</p>
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
              <p>Type to search through all your campaign documents</p>
              <p className="mt-2 text-xs">Plans • NPCs • Monsters • Maps • FAQs</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

