'use client';

import { useState, useEffect } from 'react';
import { FileSystemManager, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_AUDIO_EXTENSIONS, SUPPORTED_MARKDOWN_EXTENSIONS } from '@/lib/fileSystem';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Folder, FileText, Image as ImageIcon, Music, ChevronRight, ChevronDown } from 'lucide-react';

interface FileBrowserProps {
  fileSystemManager: FileSystemManager;
  accept: 'markdown' | 'image' | 'audio';
  multiple?: boolean;
  onSelect: (files: Array<{ name: string; path: string; handle: FileSystemFileHandle }>) => void;
  onClose: () => void;
}

export function FileBrowser({ fileSystemManager, accept, multiple = false, onSelect, onClose }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [items, setItems] = useState<Array<{ name: string; type: 'file' | 'directory'; handle: FileSystemHandle }>>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadDirectory = async () => {
    setLoading(true);
    try {
      console.log('Getting directory handle for path:', currentPath);
      const dirHandle = await getCurrentDirectoryHandle();
      console.log('Got directory handle:', dirHandle.name);

      const entries: Array<{ name: string; type: 'file' | 'directory'; handle: FileSystemHandle }> = [];

      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file') {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();

          if (shouldIncludeFile(file.name)) {
            entries.push({ name, type: 'file', handle });
          }
        } else {
          entries.push({ name, type: 'directory', handle });
        }
      }

      console.log('Loaded', entries.length, 'entries');

      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      setItems(entries);
    } catch (error) {
      console.error('Error loading directory:', error, 'Path was:', currentPath);
      alert('Error loading folder. Please try again.');
    }
    setLoading(false);
  };

  const getCurrentDirectoryHandle = async (): Promise<FileSystemDirectoryHandle> => {
    let handle = fileSystemManager.getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory selected');
    }

    console.log('Starting at root, will navigate through:', currentPath);

    for (const segment of currentPath) {
      console.log('Getting subdirectory:', segment);
      try {
        handle = await handle.getDirectoryHandle(segment);
        console.log('Successfully got subdirectory:', segment);
      } catch (error) {
        console.error('Failed to get subdirectory:', segment, error);
        throw error;
      }
    }

    return handle;
  };

  const shouldIncludeFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop();

    if (accept === 'markdown') {
      return SUPPORTED_MARKDOWN_EXTENSIONS.includes(ext || '');
    } else if (accept === 'image') {
      return SUPPORTED_IMAGE_EXTENSIONS.includes(ext || '');
    } else if (accept === 'audio') {
      return SUPPORTED_AUDIO_EXTENSIONS.includes(ext || '');
    }

    return false;
  };

  const handleDirectoryClick = (name: string) => {
    console.log('Navigating to folder:', name, 'Current path:', currentPath);
    const newPath = [...currentPath, name];
    console.log('New path will be:', newPath);
    setCurrentPath(newPath);
    setSelectedFiles(new Set());
  };

  const handleFileClick = (name: string) => {
    if (multiple) {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(name)) {
        newSelected.delete(name);
      } else {
        newSelected.add(name);
      }
      setSelectedFiles(newSelected);
    } else {
      setSelectedFiles(new Set([name]));
    }
  };

  const handleBack = () => {
    setCurrentPath(currentPath.slice(0, -1));
    setSelectedFiles(new Set());
  };

  useEffect(() => {
    console.log('useEffect triggered, currentPath:', currentPath);
    loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const handleConfirm = async () => {
    const selected: Array<{ name: string; path: string; handle: FileSystemFileHandle }> = [];

    for (const fileName of selectedFiles) {
      const item = items.find(i => i.name === fileName && i.type === 'file');
      if (item) {
        const path = [...currentPath, fileName].join('/');
        selected.push({
          name: fileName,
          path,
          handle: item.handle as FileSystemFileHandle,
        });
      }
    }

    onSelect(selected);
  };

  const getIcon = (type: 'file' | 'directory', name: string) => {
    if (type === 'directory') {
      return <Folder className="h-4 w-4 text-blue-500" />;
    }

    if (accept === 'markdown') {
      return <FileText className="h-4 w-4 text-green-500" />;
    } else if (accept === 'image') {
      return <ImageIcon className="h-4 w-4 text-purple-500" />;
    } else {
      return <Music className="h-4 w-4 text-pink-500" />;
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] grid grid-rows-[auto_auto_1fr_auto] overflow-hidden gap-4">
        <DialogHeader>
          <DialogTitle>Select Files</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground border-b pb-2">
          <button
            onClick={() => setCurrentPath([])}
            className="hover:text-foreground"
          >
            Root
          </button>
          {currentPath.map((segment, index) => (
            <div key={index} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => setCurrentPath(currentPath.slice(0, index + 1))}
                className="hover:text-foreground"
              >
                {segment}
              </button>
            </div>
          ))}
        </div>

        {/* File list */}
        <ScrollArea className="w-full border rounded min-h-0">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No files found</div>
          ) : (
            <div className="p-2">
              {currentPath.length > 0 && (
                <button
                  onClick={handleBack}
                  className="w-full flex items-center gap-2 p-2 hover:bg-accent rounded"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                  <span>..</span>
                </button>
              )}
              {items.map((item) => (
                <button
                  key={item.name}
                  onClick={() => item.type === 'directory' ? handleDirectoryClick(item.name) : handleFileClick(item.name)}
                  className={`w-full flex items-center gap-2 p-2 hover:bg-accent rounded ${selectedFiles.has(item.name) ? 'bg-accent' : ''
                    }`}
                >
                  {getIcon(item.type, item.name)}
                  <span className="flex-1 text-left truncate">{item.name}</span>
                  {item.type === 'directory' && <ChevronRight className="h-4 w-4" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedFiles.size === 0}
            >
              Select
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

