'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SessionConfig, Part } from '@/types';
import { FileSystemManager, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_AUDIO_EXTENSIONS } from '@/lib/fileSystem';
import { exportConfig, importConfig, createEmptyConfig } from '@/lib/configManager';
import { scanSessionFolder, getExpectedStructure } from '@/lib/sessionScanner';
import { PartEditor } from '@/components/setup/PartEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FolderOpen, Plus, Edit2, Trash2, Download, Upload, Play, AlertCircle, Wand2, HelpCircle } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [fileSystemManager] = useState(() => new FileSystemManager());
  const [config, setConfig] = useState<SessionConfig>(createEmptyConfig());
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [folderSelected, setFolderSelected] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [newPCName, setNewPCName] = useState('');
  const [showStructureHelp, setShowStructureHelp] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  useEffect(() => {
    setIsSupported(FileSystemManager.isSupported());
  }, []);

  const handleSelectFolder = async () => {
    try {
      const handle = await fileSystemManager.selectFolder();
      setFolderSelected(true);
      setConfig({
        ...config,
        folderName: handle.name,
      });
    } catch (error) {
      // User cancelled - not an error
      if ((error as Error).name === 'AbortError') {
        console.log('Folder selection cancelled by user');
        return;
      }
      console.error('Error selecting folder:', error);
      alert('Error selecting folder. Please try again.');
    }
  };

  const handleAddPart = () => {
    const newPart: Part = {
      id: Date.now().toString(),
      name: `Part ${config.parts.length + 1}`,
      planFile: null,
      images: [],
      supportDocs: [],
      bgmPlaylist: [],
      eventPlaylists: [],
    };
    setEditingPart(newPart);
  };

  const handleEditPart = (part: Part) => {
    setEditingPart(part);
  };

  const handleDeletePart = (partId: string) => {
    if (confirm('Are you sure you want to delete this part?')) {
      setConfig({
        ...config,
        parts: config.parts.filter(p => p.id !== partId),
      });
    }
  };

  const handleUpdatePart = (updatedPart: Part) => {
    const existingIndex = config.parts.findIndex(p => p.id === updatedPart.id);

    if (existingIndex >= 0) {
      // Update existing part
      const newParts = [...config.parts];
      newParts[existingIndex] = updatedPart;
      setConfig({
        ...config,
        parts: newParts,
      });
    } else {
      // Add new part
      setConfig({
        ...config,
        parts: [...config.parts, updatedPart],
      });
    }
  };

  const handleExportConfig = () => {
    if (!folderSelected) {
      alert('Please select a folder first.');
      return;
    }
    if (config.parts.length === 0) {
      alert('Please add at least one part before exporting.');
      return;
    }
    exportConfig(config);
  };

  const handleImportConfig = async () => {
    const importedConfig = await importConfig();
    if (importedConfig) {
      setConfig(importedConfig);
      // Note: User will still need to select the folder again
      setFolderSelected(false);
      alert('Configuration imported successfully. Please select your campaign folder to continue.');
    }
  };

  const handleAutoDetect = async () => {
    if (!folderSelected) {
      alert('Please select a folder first.');
      return;
    }

    const dirHandle = fileSystemManager.getDirectoryHandle();
    if (!dirHandle) {
      alert('No folder selected. Please select a folder first.');
      return;
    }

    setIsAutoDetecting(true);
    try {
      const scannedConfig = await scanSessionFolder(dirHandle);

      if (scannedConfig.parts.length === 0) {
        alert('No content found matching the expected folder structure. Click the ? icon to see the expected format.');
        return;
      }

      setConfig(scannedConfig);
      alert(`Auto-detected ${scannedConfig.parts.length} part(s) from folder structure!`);
    } catch (error) {
      console.error('Error auto-detecting session structure:', error);
      alert('Error scanning folder structure. Please check the console for details.');
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const handleAddPC = () => {
    if (!newPCName.trim()) return;
    setConfig({
      ...config,
      playerCharacters: [...config.playerCharacters, newPCName.trim()],
    });
    setNewPCName('');
  };

  const handleRemovePC = (index: number) => {
    setConfig({
      ...config,
      playerCharacters: config.playerCharacters.filter((_, i) => i !== index),
    });
  };

  const handleStartSession = () => {
    if (!folderSelected) {
      alert('Please select a folder first.');
      return;
    }
    if (config.parts.length === 0) {
      alert('Please add at least one part before starting the session.');
      return;
    }

    // Store config in sessionStorage to pass to play mode
    sessionStorage.setItem('campaignConfig', JSON.stringify(config));
    sessionStorage.setItem('folderSelected', 'true');

    router.push('/play');
  };

  if (!isSupported) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Browser Not Supported
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This application requires the File System Access API, which is only available in Chrome and Edge browsers.
              Please use one of these browsers to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">TTRPG Session Manager</h1>
          <p className="text-muted-foreground">
            Configure your tabletop RPG sessions with plans, images, audio, and more
          </p>
        </div>

        {/* Folder Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Folder</CardTitle>
            <CardDescription>Select the folder containing your campaign materials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handleSelectFolder} variant="outline">
                <FolderOpen className="h-4 w-4 mr-2" />
                Select Folder
              </Button>
              {folderSelected && (
                <Badge variant="secondary" className="text-base">
                  {config.folderName}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Import, export, or auto-detect session configuration</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowStructureHelp(true)}
                title="View expected folder structure"
              >
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={handleAutoDetect} disabled={!folderSelected || isAutoDetecting}>
              <Wand2 className="h-4 w-4 mr-2" />
              {isAutoDetecting ? 'Detecting...' : 'Auto-Detect'}
            </Button>
            <Button onClick={handleImportConfig} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import Config
            </Button>
            <Button onClick={handleExportConfig} variant="outline" disabled={!folderSelected || config.parts.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export Config
            </Button>
          </CardContent>
        </Card>

        {/* Player Characters */}
        <Card>
          <CardHeader>
            <CardTitle>Player Characters</CardTitle>
            <CardDescription>Add PC names for initiative tracking during play</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter PC name..."
                value={newPCName}
                onChange={(e) => setNewPCName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddPC()}
              />
              <Button onClick={handleAddPC} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
            {config.playerCharacters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.playerCharacters.map((pc, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {pc}
                    <button
                      onClick={() => handleRemovePC(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No PCs added yet</p>
            )}
          </CardContent>
        </Card>

        {/* Parts List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Campaign Parts</CardTitle>
              <CardDescription>Configure each part of your campaign session</CardDescription>
            </div>
            <Button onClick={handleAddPart} disabled={!folderSelected}>
              <Plus className="h-4 w-4 mr-2" />
              Add Part
            </Button>
          </CardHeader>
          <CardContent>
            {config.parts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No parts added yet. Click "Add Part" to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {config.parts.map((part) => (
                  <Card key={part.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <h3 className="font-semibold text-lg">{part.name}</h3>
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            {part.planFile && (
                              <Badge variant="outline">Plan: {part.planFile.name}</Badge>
                            )}
                            {part.images.length > 0 && (
                              <Badge variant="outline">{part.images.length} images</Badge>
                            )}
                            {part.supportDocs.length > 0 && (
                              <Badge variant="outline">{part.supportDocs.length} docs</Badge>
                            )}
                            {part.bgmPlaylist.length > 0 && (
                              <Badge variant="outline">{part.bgmPlaylist.length} BGM tracks</Badge>
                            )}
                            {part.eventPlaylists.length > 0 && (
                              <Badge variant="outline">{part.eventPlaylists.length} event playlists</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditPart(part)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeletePart(part.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Start Session */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={handleStartSession}
            disabled={!folderSelected || config.parts.length === 0}
            className="text-lg px-8"
          >
            <Play className="h-5 w-5 mr-2" />
            Start Session
          </Button>
        </div>
      </div>

      {/* Part Editor Modal */}
      {editingPart && (
        <PartEditor
          part={editingPart}
          onUpdate={handleUpdatePart}
          onClose={() => setEditingPart(null)}
          fileSystemManager={fileSystemManager}
        />
      )}

      {/* Structure Help Dialog */}
      <Dialog open={showStructureHelp} onOpenChange={setShowStructureHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Expected Folder Structure</DialogTitle>
            <DialogDescription>
              Organize your session folder in this structure for auto-detection to work
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre overflow-x-auto">
              {getExpectedStructure()}
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">How it works:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Each <code className="bg-muted px-1 rounded">act[N]</code> folder becomes a separate Part</li>
                <li>First plan file (alphabetically) becomes the main plan</li>
                <li>Characters, threats, maps, and additional plan files become support docs</li>
                <li>Images are assigned to their respective parts</li>
                <li>Music files in <code className="bg-muted px-1 rounded">music/act[N]/</code> become BGM tracks</li>
                <li>Subfolders in <code className="bg-muted px-1 rounded">music/act[N]/PlaylistName/</code> become event playlists</li>
                <li><code className="bg-muted px-1 rounded">characters/PCs/</code> files populate the PC list (filename = PC name)</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">Supported Image Formats:</h4>
                <p className="text-sm text-muted-foreground">
                  {SUPPORTED_IMAGE_EXTENSIONS.join(', ')}
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Supported Audio Formats:</h4>
                <p className="text-sm text-muted-foreground">
                  {SUPPORTED_AUDIO_EXTENSIONS.join(', ')}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
