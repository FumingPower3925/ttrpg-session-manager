'use client';

import { useState, useEffect } from 'react';
import { Part, FileReference, AudioFile, EventPlaylist } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSystemManager, getFileType } from '@/lib/fileSystem';
import { FileBrowser } from './FileBrowser';
import { X, Plus, FileText, Image, Music, Trash2 } from 'lucide-react';

interface PartEditorProps {
  part: Part;
  onUpdate: (part: Part) => void;
  onClose: () => void;
  fileSystemManager: FileSystemManager;
}

export function PartEditor({ part, onUpdate, onClose, fileSystemManager }: PartEditorProps) {
  const [editedPart, setEditedPart] = useState<Part>(part);
  const [newEventPlaylistName, setNewEventPlaylistName] = useState('');
  const [fileBrowserOpen, setFileBrowserOpen] = useState<{
    type: 'plan' | 'images' | 'docs' | 'bgm' | 'event';
    eventPlaylistId?: string;
  } | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.classList.add('modal-open');
    
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  const handleNameChange = (name: string) => {
    setEditedPart({ ...editedPart, name });
  };

  const handleSelectPlan = () => {
    setFileBrowserOpen({ type: 'plan' });
  };

  const handleSelectImages = () => {
    setFileBrowserOpen({ type: 'images' });
  };

  const handleSelectSupportDocs = () => {
    setFileBrowserOpen({ type: 'docs' });
  };

  const handleSelectBGM = () => {
    setFileBrowserOpen({ type: 'bgm' });
  };

  const handleFileBrowserSelect = (files: Array<{ name: string; path: string; handle: FileSystemFileHandle }>) => {
    if (!fileBrowserOpen) return;

    const { type, eventPlaylistId } = fileBrowserOpen;

    if (type === 'plan' && files.length > 0) {
      const file = files[0];
      setEditedPart({
        ...editedPart,
        planFile: {
          path: file.path,
          name: file.name,
          type: 'markdown',
        },
      });
    } else if (type === 'images') {
      const imageRefs: FileReference[] = files.map(file => ({
        path: file.path,
        name: file.name,
        type: 'image' as const,
      }));
      setEditedPart({
        ...editedPart,
        images: [...editedPart.images, ...imageRefs],
      });
    } else if (type === 'docs') {
      const docRefs: FileReference[] = files.map(file => ({
        path: file.path,
        name: file.name,
        type: 'markdown' as const,
      }));
      setEditedPart({
        ...editedPart,
        supportDocs: [...editedPart.supportDocs, ...docRefs],
      });
    } else if (type === 'bgm') {
      const audioRefs: AudioFile[] = files.map(file => ({
        path: file.path,
        name: file.name,
        type: 'audio' as const,
      }));
      setEditedPart({
        ...editedPart,
        bgmPlaylist: [...editedPart.bgmPlaylist, ...audioRefs],
      });
    } else if (type === 'event' && eventPlaylistId) {
      const audioRefs: AudioFile[] = files.map(file => ({
        path: file.path,
        name: file.name,
        type: 'audio' as const,
      }));
      setEditedPart({
        ...editedPart,
        eventPlaylists: editedPart.eventPlaylists.map(playlist =>
          playlist.id === eventPlaylistId
            ? { ...playlist, tracks: [...playlist.tracks, ...audioRefs] }
            : playlist
        ),
      });
    }

    setFileBrowserOpen(null);
  };

  const handleCreateEventPlaylist = () => {
    if (!newEventPlaylistName.trim()) return;

    const newPlaylist: EventPlaylist = {
      id: Date.now().toString(),
      name: newEventPlaylistName,
      tracks: [],
    };

    setEditedPart({
      ...editedPart,
      eventPlaylists: [...editedPart.eventPlaylists, newPlaylist],
    });

    setNewEventPlaylistName('');
  };

  const handleAddTracksToEventPlaylist = (playlistId: string) => {
    setFileBrowserOpen({ type: 'event', eventPlaylistId: playlistId });
  };

  const handleRemoveFile = (type: 'images' | 'supportDocs' | 'bgmPlaylist', index: number) => {
    setEditedPart({
      ...editedPart,
      [type]: editedPart[type].filter((_, i) => i !== index),
    });
  };

  const handleRemoveEventPlaylist = (playlistId: string) => {
    setEditedPart({
      ...editedPart,
      eventPlaylists: editedPart.eventPlaylists.filter(p => p.id !== playlistId),
    });
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackIndex: number) => {
    setEditedPart({
      ...editedPart,
      eventPlaylists: editedPart.eventPlaylists.map(playlist =>
        playlist.id === playlistId
          ? { ...playlist, tracks: playlist.tracks.filter((_, i) => i !== trackIndex) }
          : playlist
      ),
    });
  };

  const handleSave = () => {
    onUpdate(editedPart);
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto"
        onClick={onClose}
      >
        <Card 
          className="w-full max-w-4xl my-8 flex flex-col max-h-[calc(100vh-4rem)]"
          onClick={(e) => e.stopPropagation()}
        >
        <CardHeader className="flex flex-row items-center justify-between flex-shrink-0 border-b">
          <CardTitle>Edit Part</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
              {/* Part Name */}
              <div>
                <label className="text-sm font-medium mb-2 block">Part Name</label>
                <Input
                  value={editedPart.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Part 1: Opening"
                />
              </div>

              {/* Plan File */}
              <div>
                <label className="text-sm font-medium mb-2 block">Plan Document</label>
                <div className="flex gap-2 items-center">
                  <Button onClick={handleSelectPlan} variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Select Plan
                  </Button>
                  {editedPart.planFile && (
                    <Badge variant="secondary">{editedPart.planFile.name}</Badge>
                  )}
                </div>
              </div>

              {/* Images */}
              <div>
                <label className="text-sm font-medium mb-2 block">Images</label>
                <Button onClick={handleSelectImages} variant="outline" size="sm" className="mb-2">
                  <Image className="h-4 w-4 mr-2" />
                  Add Images
                </Button>
                <div className="flex flex-wrap gap-2">
                  {editedPart.images.map((img, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {img.name}
                      <button
                        onClick={() => handleRemoveFile('images', index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Support Documents */}
              <div>
                <label className="text-sm font-medium mb-2 block">Support Documents (NPCs, Monsters, Maps, FAQs)</label>
                <Button onClick={handleSelectSupportDocs} variant="outline" size="sm" className="mb-2">
                  <FileText className="h-4 w-4 mr-2" />
                  Add Documents
                </Button>
                <div className="flex flex-wrap gap-2">
                  {editedPart.supportDocs.map((doc, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {doc.name}
                      <button
                        onClick={() => handleRemoveFile('supportDocs', index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* BGM Playlist */}
              <div>
                <label className="text-sm font-medium mb-2 block">Background Music</label>
                <Button onClick={handleSelectBGM} variant="outline" size="sm" className="mb-2">
                  <Music className="h-4 w-4 mr-2" />
                  Add BGM Tracks
                </Button>
                <div className="flex flex-wrap gap-2">
                  {editedPart.bgmPlaylist.map((track, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {track.name}
                      <button
                        onClick={() => handleRemoveFile('bgmPlaylist', index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Event Playlists */}
              <div>
                <label className="text-sm font-medium mb-2 block">Event Playlists</label>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newEventPlaylistName}
                    onChange={(e) => setNewEventPlaylistName(e.target.value)}
                    placeholder="Event name (e.g., Combat, Investigation)"
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateEventPlaylist()}
                  />
                  <Button onClick={handleCreateEventPlaylist} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </div>

                <div className="space-y-3">
                  {editedPart.eventPlaylists.map((playlist) => (
                    <Card key={playlist.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{playlist.name}</h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveEventPlaylist(playlist.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          onClick={() => handleAddTracksToEventPlaylist(playlist.id)}
                          variant="outline"
                          size="sm"
                          className="mb-2"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Tracks
                        </Button>
                        <div className="flex flex-wrap gap-2">
                          {playlist.tracks.map((track, index) => (
                            <Badge key={index} variant="outline" className="flex items-center gap-1">
                              {track.name}
                              <button
                                onClick={() => handleRemoveTrackFromPlaylist(playlist.id, index)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </div>
        </CardContent>
      </Card>
    </div>

    {/* File Browser - Rendered outside PartEditor backdrop to prevent click propagation issues */}
    {fileBrowserOpen && (
      <FileBrowser
        fileSystemManager={fileSystemManager}
        accept={
          fileBrowserOpen.type === 'plan' || fileBrowserOpen.type === 'docs'
            ? 'markdown'
            : fileBrowserOpen.type === 'images'
            ? 'image'
            : 'audio'
        }
        multiple={fileBrowserOpen.type !== 'plan'}
        onSelect={handleFileBrowserSelect}
        onClose={() => setFileBrowserOpen(null)}
      />
    )}
    </>
  );
}

