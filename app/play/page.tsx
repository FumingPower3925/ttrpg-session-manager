'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SessionConfig, Part, FileReference } from '@/types';
import { FileSystemManager } from '@/lib/fileSystem';
import { AudioManager } from '@/lib/audioManager';
import { SearchManager } from '@/lib/search';
import { FloatingNav } from '@/components/play/FloatingNav';
import { AudioControls } from '@/components/play/AudioControls';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { ImageViewer } from '@/components/play/ImageViewer';
import { SplitView } from '@/components/play/SplitView';
import { SearchDialog } from '@/components/play/SearchDialog';
import { PartTimer } from '@/components/play/PartTimer';
import { NotesPanel } from '@/components/play/NotesPanel';
import { InitiativeTracker } from '@/components/play/InitiativeTracker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Columns, FileText, FolderOpen } from 'lucide-react';

export default function PlayPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [fileSystemManager] = useState(() => new FileSystemManager());
  const [audioManager, setAudioManager] = useState<AudioManager | null>(null);
  const [searchManager] = useState(() => new SearchManager());
  const [currentPartId, setCurrentPartId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('plan');
  const [previousTab, setPreviousTab] = useState<string>('plan');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentCache, setContentCache] = useState<Map<string, string>>(new Map());
  const [imageUrlCache, setImageUrlCache] = useState<Map<string, string>>(new Map());
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [splitViewDoc, setSplitViewDoc] = useState<FileReference | null>(null);
  const [currentPlanContent, setCurrentPlanContent] = useState<string | null>(null);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());

  const currentPart = config?.parts.find(p => p.id === currentPartId);

  const [needsFolderSelection, setNeedsFolderSelection] = useState(true);

  useEffect(() => {
    const configJson = sessionStorage.getItem('campaignConfig');
    const folderSelected = sessionStorage.getItem('folderSelected');

    if (!configJson || !folderSelected) {
      setError('No configuration found. Please set up your session first.');
      setTimeout(() => router.push('/'), 2000);
      return;
    }

    const loadedConfig: SessionConfig = JSON.parse(configJson);
    setConfig(loadedConfig);
    setIsLoading(false);
  }, [router]);

  const handleSelectFolder = async () => {
    try {
      setIsLoading(true);
      setError(null);

      await fileSystemManager.selectFolder();

      if (!config) {
        setError('Configuration not loaded');
        setIsLoading(false);
        return;
      }

      const audio = new AudioManager(fileSystemManager);
      setAudioManager(audio);

      if (config.parts.length > 0) {
        setCurrentPartId(config.parts[0].id);
      }

      await loadAllMarkdownContent(config);

      setNeedsFolderSelection(false);
      setIsLoading(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('Folder selection cancelled by user');
        setIsLoading(false);
        return;
      }
      console.error('Folder selection error:', err);
      setError('Error selecting folder. Please try again.');
      setIsLoading(false);
    }
  };

  const loadAllMarkdownContent = async (config: SessionConfig) => {
    const documents: Array<{ file: FileReference; content: string }> = [];

    for (const part of config.parts) {
      if (part.planFile) {
        try {
          const content = await fileSystemManager.readTextFile(part.planFile.path);
          documents.push({ file: part.planFile, content });
        } catch (err) {
          console.error(`Error loading plan for ${part.name}:`, err);
        }
      }

      for (const doc of part.supportDocs) {
        try {
          const content = await fileSystemManager.readTextFile(doc.path);
          documents.push({ file: doc, content });
        } catch (err) {
          console.error(`Error loading doc ${doc.name}:`, err);
        }
      }
    }

    await searchManager.indexDocuments(documents);
  };

  const loadContent = useCallback(async (file: FileReference): Promise<string> => {
    if (contentCache.has(file.path)) {
      return contentCache.get(file.path)!;
    }

    try {
      const content = await fileSystemManager.readTextFile(file.path);
      setContentCache(prev => new Map(prev).set(file.path, content));
      return content;
    } catch (err) {
      console.error(`Error loading ${file.path}:`, err);
      return `# Error Loading File

**File**: ${file.name}  
**Path**: ${file.path}

**Error**: Could not find this file. This can happen if:
- The file was moved or renamed after configuration
- The file path doesn't match the folder structure
- The selected folder is not the same one used during setup

**Solution**: Go back to setup mode and reconfigure this part with the correct file.`;
    }
  }, [fileSystemManager, contentCache]);

  const loadImageUrl = useCallback(async (file: FileReference): Promise<string> => {
    if (imageUrlCache.has(file.path)) {
      return imageUrlCache.get(file.path)!;
    }

    try {
      const url = await fileSystemManager.getFileURL(file.path);
      setImageUrlCache(prev => new Map(prev).set(file.path, url));
      return url;
    } catch (err) {
      console.error(`Error loading image ${file.path}:`, err);
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 400, 300);
        ctx.fillStyle = '#666';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Image not found', 200, 130);
        ctx.font = '12px sans-serif';
        ctx.fillText(file.name, 200, 160);
        ctx.fillText(file.path, 200, 180);
      }
      return canvas.toDataURL();
    }
  }, [fileSystemManager, imageUrlCache]);

  const loadPartContent = useCallback(async (partId: string) => {
    const part = config?.parts.find(p => p.id === partId);
    if (!part) return;

    if (part.planFile) {
      const content = await loadContent(part.planFile);
      setCurrentPlanContent(content);
    } else {
      setCurrentPlanContent(null);
    }

    if (audioManager) {
      const isInEventMode = audioManager.getCurrentMode() === 'event';
      const isSameBGM = audioManager.getCurrentMode() === 'bgm' &&
        audioManager.getBGMPlaylist().length === part.bgmPlaylist.length &&
        audioManager.getBGMPlaylist().every((track, index) =>
          track.path === part.bgmPlaylist[index]?.path
        );

      // Check if current event playlist still exists in the new part's playlists
      const currentEventPlaylist = audioManager.getCurrentEventPlaylist();
      const eventPlaylistStillExists = currentEventPlaylist !== null &&
        part.eventPlaylists.some(playlist => playlist.id === currentEventPlaylist.id);

      audioManager.loadBGM(part.bgmPlaylist);
      audioManager.loadEventPlaylists(part.eventPlaylists);

      // Only auto-start BGM if:
      // 1. Not currently in event mode OR current event playlist no longer exists
      // 2. BGM playlists have changed
      if (part.bgmPlaylist.length > 0 && !isSameBGM && (!isInEventMode || !eventPlaylistStillExists)) {
        audioManager.playBGM();
      }
    }
  }, [config, audioManager, loadContent]);

  useEffect(() => {
    if (currentPartId && audioManager) {
      loadPartContent(currentPartId);
    }
  }, [currentPartId, audioManager, loadPartContent]);

  const handlePartChange = useCallback(async (partId: string) => {
    setCurrentPartId(partId);
    setCurrentTab('plan');
    setPreviousTab('plan');
    setSplitViewEnabled(false);
    setIsHeaderCompact(false);
    setLastScrollY(0);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    if (newTab.startsWith('image-')) {
      setPreviousTab(currentTab);
    }
    setCurrentTab(newTab);
  }, [currentTab]);

  const handleImageClose = useCallback(() => {
    setCurrentTab(previousTab);
  }, [previousTab]);

  const saveScrollPosition = useCallback((filePath: string, scrollTop: number) => {
    if (!currentPartId) return;
    const key = `${currentPartId}:${filePath}`;
    scrollPositionsRef.current.set(key, scrollTop);
  }, [currentPartId]);

  const getScrollPosition = useCallback((filePath: string): number => {
    if (!currentPartId) return 0;
    const key = `${currentPartId}:${filePath}`;
    return scrollPositionsRef.current.get(key) || 0;
  }, [currentPartId]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>, filePath?: string) => {
    const currentScrollY = e.currentTarget.scrollTop;

    if (filePath) {
      saveScrollPosition(filePath, currentScrollY);
    }

    if (currentScrollY > 50 && currentScrollY > lastScrollY) {
      setIsHeaderCompact(true);
    }
    else if (currentScrollY < lastScrollY - 10) {
      setIsHeaderCompact(false);
    }

    setLastScrollY(currentScrollY);
  }, [lastScrollY, saveScrollPosition]);

  const handleSearchResultClick = (filePath: string) => {
    for (const part of config?.parts || []) {
      if (part.planFile?.path === filePath) {
        setCurrentPartId(part.id);
        setCurrentTab('plan');
        setPreviousTab('plan');
        return;
      }

      const docIndex = part.supportDocs.findIndex(doc => doc.path === filePath);
      if (docIndex !== -1) {
        setCurrentPartId(part.id);
        setCurrentTab(`doc-${docIndex}`);
        setPreviousTab(`doc-${docIndex}`);
        return;
      }
    }
  };

  const toggleSplitView = (doc: FileReference | null) => {
    if (doc && !splitViewEnabled) {
      setSplitViewDoc(doc);
      setSplitViewEnabled(true);
    } else {
      setSplitViewEnabled(false);
      setSplitViewDoc(null);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Setup
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (needsFolderSelection && config) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Select Campaign Folder</CardTitle>
            <CardDescription>
              To start your session, please select the folder containing your campaign materials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm font-medium mb-2">Session Configuration Loaded:</p>
              <p className="text-sm text-muted-foreground">{config.folderName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {config.parts.length} part{config.parts.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSelectFolder} className="flex-1">
                <FolderOpen className="h-4 w-4 mr-2" />
                Select Folder
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config || !currentPart) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No configuration loaded</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Floating Navigation */}
      {currentTab !== 'image' && (
        <FloatingNav
          parts={config.parts}
          currentPartId={currentPartId}
          onPartChange={handlePartChange}
          isCompact={isHeaderCompact}
        />
      )}

      {/* Audio Controls */}
      {currentTab !== 'image' && (
        <AudioControls
          audioManager={audioManager}
          eventPlaylists={currentPart.eventPlaylists}
        />
      )}

      {/* Part Timer */}
      {currentTab !== 'image' && currentPart && (
        <PartTimer
          partId={currentPart.id}
          partName={currentPart.name}
          planContent={currentPlanContent}
        />
      )}

      {/* Notes Panel */}
      {currentTab !== 'image' && (
        <NotesPanel />
      )}

      {/* Initiative Tracker */}
      {currentTab !== 'image' && config && (
        <InitiativeTracker playerCharacters={config.playerCharacters} pcStats={config.pcStats} />
      )}

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          paddingTop: isHeaderCompact ? '0' : '5rem'
        }}
      >
        {/* Top Bar with Search and Actions */}
        {currentTab !== 'image' && (
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${isHeaderCompact ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100'
              }`}
          >
            <div className="px-6 pb-4 flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>

              <div className="flex-1 flex justify-center">
                <SearchDialog
                  searchManager={searchManager}
                  onResultClick={handleSearchResultClick}
                />
              </div>

              <div className="w-[140px] flex justify-end">
                {currentTab !== 'plan' && currentTab.startsWith('doc-') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (splitViewEnabled) {
                        toggleSplitView(null);
                      } else if (currentPart.planFile) {
                        toggleSplitView(currentPart.planFile);
                      }
                    }}
                  >
                    <Columns className="h-4 w-4 mr-2" />
                    {splitViewEnabled ? 'Close Split View' : 'Split with Plan'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b">
            <TabsList className="h-12">
              <TabsTrigger value="plan">Plan</TabsTrigger>
              {currentPart.images.map((img, index) => (
                <TabsTrigger key={`img-${index}`} value={`image-${index}`}>
                  {img.name}
                </TabsTrigger>
              ))}
              {currentPart.supportDocs.map((doc, index) => (
                <TabsTrigger key={`doc-${index}`} value={`doc-${index}`}>
                  {doc.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            {/* Plan Tab */}
            <TabsContent value="plan" className="h-full m-0 data-[state=active]:flex">
              {currentPart.planFile ? (
                <PlayContent
                  file={currentPart.planFile}
                  loadContent={loadContent}
                  splitViewEnabled={false}
                  onScroll={(e) => handleScroll(e, currentPart.planFile!.path)}
                  getScrollPosition={getScrollPosition}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No plan file selected for this part</p>
                </div>
              )}
            </TabsContent>

            {/* Image Tabs */}
            {currentPart.images.map((img, index) => (
              <TabsContent
                key={`img-${index}`}
                value={`image-${index}`}
                className="h-full m-0"
              >
                <PlayImageContent
                  file={img}
                  loadImageUrl={loadImageUrl}
                  onClose={handleImageClose}
                />
              </TabsContent>
            ))}

            {/* Support Doc Tabs */}
            {currentPart.supportDocs.map((doc, index) => (
              <TabsContent
                key={`doc-${index}`}
                value={`doc-${index}`}
                className="h-full m-0 data-[state=active]:flex"
              >
                {splitViewEnabled && splitViewDoc ? (
                  <PlaySplitContent
                    leftFile={splitViewDoc}
                    rightFile={doc}
                    loadContent={loadContent}
                    onScroll={(e) => handleScroll(e, doc.path)}
                    getScrollPosition={getScrollPosition}
                  />
                ) : (
                  <PlayContent
                    file={doc}
                    loadContent={loadContent}
                    splitViewEnabled={false}
                    onScroll={(e) => handleScroll(e, doc.path)}
                    getScrollPosition={getScrollPosition}
                  />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// Component for rendering markdown content
function PlayContent({
  file,
  loadContent,
  splitViewEnabled,
  onScroll,
  getScrollPosition,
}: {
  file: FileReference;
  loadContent: (file: FileReference) => Promise<string>;
  splitViewEnabled: boolean;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  getScrollPosition?: (filePath: string) => number;
}) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const text = await loadContent(file);
      setContent(text);
      setIsLoading(false);
    }
    load();
  }, [file, loadContent]);

  // Restore scroll position when content loads (0 for first-time visits, saved position for returns)
  useEffect(() => {
    if (!isLoading && getScrollPosition && scrollRef.current) {
      const savedScrollPosition = getScrollPosition(file.path);
      scrollRef.current.scrollTop = savedScrollPosition;
    }
  }, [isLoading, getScrollPosition, file.path]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={onScroll}>
      <div className="p-6 max-w-4xl mx-auto">
        <MarkdownViewer content={content} />
      </div>
    </div>
  );
}

// Component for rendering images
function PlayImageContent({
  file,
  loadImageUrl,
  onClose,
}: {
  file: FileReference;
  loadImageUrl: (file: FileReference) => Promise<string>;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const url = await loadImageUrl(file);
      setImageUrl(url);
      setIsLoading(false);
    }
    load();
  }, [file, loadImageUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white">Loading image...</p>
      </div>
    );
  }

  return <ImageViewer imageUrl={imageUrl} imageName={file.name} onClose={onClose} />;
}

// Component for split view
function PlaySplitContent({
  leftFile,
  rightFile,
  loadContent,
  onScroll,
  getScrollPosition,
}: {
  leftFile: FileReference;
  rightFile: FileReference;
  loadContent: (file: FileReference) => Promise<string>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  getScrollPosition?: (filePath: string) => number;
}) {
  const [leftContent, setLeftContent] = useState<string>('');
  const [rightContent, setRightContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [left, right] = await Promise.all([
        loadContent(leftFile),
        loadContent(rightFile),
      ]);
      setLeftContent(left);
      setRightContent(right);
      setIsLoading(false);
    }
    load();
  }, [leftFile, rightFile, loadContent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <SplitView
      leftContent={leftContent}
      rightContent={rightContent}
      leftTitle={leftFile.name}
      rightTitle={rightFile.name}
      onScroll={onScroll}
    />
  );
}

