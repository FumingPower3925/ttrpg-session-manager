import lunr from 'lunr';
import { FileReference } from '@/types';

export interface SearchResult {
  ref: string; // document ID (file path)
  name: string; // file name
  score: number;
  context: string; // snippet of text around the match
}

export class SearchManager {
  private index: lunr.Index | null = null;
  private documents: Map<string, { name: string; content: string }> = new Map();

  /**
   * Indexes markdown documents for search
   */
  async indexDocuments(
    documents: Array<{ file: FileReference; content: string }>
  ) {
    this.documents.clear();

    documents.forEach(doc => {
      this.documents.set(doc.file.path, {
        name: doc.file.name,
        content: doc.content,
      });
    });

    this.index = lunr(function () {
      this.ref('path');
      this.field('name', { boost: 10 });
      this.field('content');

      documents.forEach(doc => {
        this.add({
          path: doc.file.path,
          name: doc.file.name,
          content: doc.content,
        });
      });
    });
  }

  /**
   * Searches the indexed documents
   */
  search(query: string, maxResults: number = 10): SearchResult[] {
    if (!this.index || !query.trim()) {
      return [];
    }

    try {
      const results = this.index.search(query);

      return results.slice(0, maxResults).map(result => {
        const doc = this.documents.get(result.ref);
        if (!doc) {
          return null;
        }

        const context = this.extractContext(doc.content, query);

        return {
          ref: result.ref,
          name: doc.name,
          score: result.score,
          context,
        };
      }).filter((r): r is SearchResult => r !== null);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Extracts a snippet of text around the search query
   */
  private extractContext(content: string, query: string, contextLength: number = 150): string {
    const cleanContent = content
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/`(.+?)`/g, '$1');

    // Find the first occurrence of any word in the query
    const queryWords = query.toLowerCase().split(/\s+/);
    const lowerContent = cleanContent.toLowerCase();

    let matchIndex = -1;
    for (const word of queryWords) {
      matchIndex = lowerContent.indexOf(word);
      if (matchIndex !== -1) {
        break;
      }
    }

    if (matchIndex === -1) {
      return cleanContent.substring(0, contextLength) + '...';
    }

    // Extract context around the match
    const start = Math.max(0, matchIndex - contextLength / 2);
    const end = Math.min(cleanContent.length, matchIndex + contextLength / 2);

    let snippet = cleanContent.substring(start, end);

    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < cleanContent.length) {
      snippet = snippet + '...';
    }

    return snippet.trim();
  }

  /**
   * Checks if the search is ready
   */
  isReady(): boolean {
    return this.index !== null;
  }

  /**
   * Gets the content of a document by path
   */
  getDocumentContent(path: string): string | null {
    return this.documents.get(path)?.content || null;
  }
}

