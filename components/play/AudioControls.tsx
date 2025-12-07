'use client';

import { useState, useEffect } from 'react';
import { EventPlaylist, AudioFile } from '@/types';
import { AudioManager } from '@/lib/audioManager';
import { filterPlaylists } from '@/lib/musicSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Play, Pause, SkipForward, SkipBack, Music2, ChevronDown, ChevronUp, Search } from 'lucide-react';

interface AudioControlsProps {
  audioManager: AudioManager | null;
  eventPlaylists: EventPlaylist[];
}

export function AudioControls({ audioManager, eventPlaylists }: AudioControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState('No track');
  const [currentMode, setCurrentMode] = useState<'bgm' | 'event'>('bgm');
  const [currentEventPlaylist, setCurrentEventPlaylist] = useState<EventPlaylist | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTrackListExpanded, setIsTrackListExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTracks, setCurrentTracks] = useState<AudioFile[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  useEffect(() => {
    if (!audioManager) return;

    audioManager.onTrackChange((trackName, mode) => {
      setCurrentTrack(trackName);
      setCurrentMode(mode);
    });

    audioManager.onPlayStateChange((playing) => {
      setIsPlaying(playing);
    });

    // Update current event playlist and track info
    const interval = setInterval(() => {
      setCurrentEventPlaylist(audioManager.getCurrentEventPlaylist());
      setCurrentMode(audioManager.getCurrentMode());
      setIsPlaying(audioManager.isPlaying());
      setCurrentTrack(audioManager.getCurrentTrackName());
      setCurrentTracks(audioManager.getCurrentPlaylistTracks());
      setCurrentTrackIndex(audioManager.getCurrentTrackIndex());
    }, 500);

    return () => clearInterval(interval);
  }, [audioManager]);

  const handlePlayPause = () => {
    if (!audioManager) return;

    if (isPlaying) {
      audioManager.pause();
    } else {
      // If not playing and no current mode, start BGM
      if (currentMode === 'bgm' && currentTrack === 'No track') {
        audioManager.playBGM();
      } else {
        audioManager.resume();
      }
    }
  };

  const handleSkipNext = () => {
    audioManager?.skipNext();
  };

  const handleSkipPrevious = () => {
    audioManager?.skipPrevious();
  };

  const handleSelectBGM = async () => {
    if (!audioManager) return;
    await audioManager.playBGM();
    setSearchQuery(''); // Clear search when selecting BGM
  };

  const handleSelectEvent = async (playlistId: string) => {
    if (!audioManager) return;
    await audioManager.startEvent(playlistId);
    setSearchQuery(''); // Clear search after selection
  };

  const handleSelectTrack = async (index: number) => {
    if (!audioManager) return;

    if (currentMode === 'bgm') {
      await audioManager.playBGMTrack(index);
    } else {
      await audioManager.playEventTrack(index);
    }
  };

  // Filter playlists based on search query
  const filteredPlaylists = filterPlaylists(eventPlaylists, searchQuery);

  // Check if BGM matches search
  const bgmMatchesSearch = !searchQuery ||
    'background music'.includes(searchQuery.toLowerCase()) ||
    'bgm'.includes(searchQuery.toLowerCase());

  if (!audioManager) {
    return null;
  }

  return (
    <>
      {/* Semi-circle indicator when collapsed */}
      {!isExpanded && (
        <div
          className="fixed top-4 right-0 z-50 cursor-pointer"
          onMouseEnter={() => setIsExpanded(true)}
        >
          <div className="bg-primary text-primary-foreground rounded-l-full pr-3 pl-4 py-3 shadow-lg flex items-center">
            <Music2 className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* Full panel when expanded */}
      <div
        className="fixed top-4 right-0 z-50 transition-transform duration-300 ease-in-out"
        style={{
          transform: isExpanded ? 'translateX(0)' : 'translateX(100%)'
        }}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <Card className="w-80 shadow-lg max-h-[600px] flex flex-col">
          <CardContent className="pt-4 space-y-3 flex flex-col min-h-0">
            {/* Current Track Info */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Now Playing</span>
                <Badge variant={currentMode === 'bgm' ? 'secondary' : 'default'} className="text-xs">
                  {currentMode === 'bgm' ? 'BGM' : currentEventPlaylist?.name || 'Event'}
                </Badge>
              </div>
              <p className="font-medium truncate text-sm" title={currentTrack}>
                {currentTrack}
              </p>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipPrevious}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="icon"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipNext}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Track List (Collapsible) */}
            {currentTracks.length > 0 && (
              <div className="flex-shrink-0">
                <button
                  onClick={() => setIsTrackListExpanded(!isTrackListExpanded)}
                  className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <span className="flex items-center gap-2">
                    {isTrackListExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Current Playlist
                  </span>
                  <span className="text-xs">
                    {currentTrackIndex + 1} / {currentTracks.length}
                  </span>
                </button>

                {isTrackListExpanded && (
                  <div
                    className="mt-2 overflow-y-auto pr-2 -mr-2"
                    style={{
                      maxHeight: Math.min(currentTracks.length * 32, 120)
                    }}
                  >
                    <div className="space-y-1">
                      {currentTracks.map((track, index) => (
                        <button
                          key={index}
                          onClick={() => handleSelectTrack(index)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors truncate flex items-center ${index === currentTrackIndex
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                            }`}
                          title={track.name}
                        >
                          {index === currentTrackIndex && isPlaying && (
                            <Play className="h-3 w-3 mr-1.5 flex-shrink-0 fill-current" />
                          )}
                          {index === currentTrackIndex && !isPlaying && (
                            <Pause className="h-3 w-3 mr-1.5 flex-shrink-0 fill-current" />
                          )}
                          {index !== currentTrackIndex && (
                            <span className="w-4 mr-1 text-muted-foreground text-xs flex-shrink-0">{index + 1}.</span>
                          )}
                          <span className="truncate">{track.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Playlist Selection */}
            <div className="space-y-2 min-h-0 flex flex-col">
              <span className="text-sm font-medium flex-shrink-0">Select Playlist</span>

              {/* Search Input */}
              <div className="relative flex-shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search playlists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              <div
                className="overflow-y-auto pr-2 -mr-2"
                style={{
                  maxHeight: Math.min((filteredPlaylists.length + (bgmMatchesSearch ? 1 : 0)) * 36 + 8, 160)
                }}
              >
                <div className="space-y-2 pb-2">
                  {/* BGM Button */}
                  {bgmMatchesSearch && (
                    <Button
                      variant={currentMode === 'bgm' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleSelectBGM}
                    >
                      Background Music
                    </Button>
                  )}

                  {/* Event Playlists */}
                  {filteredPlaylists.map((playlist) => (
                    <Button
                      key={playlist.id}
                      variant={currentMode === 'event' && currentEventPlaylist?.id === playlist.id ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleSelectEvent(playlist.id)}
                    >
                      {playlist.name}
                    </Button>
                  ))}

                  {/* No results message */}
                  {!bgmMatchesSearch && filteredPlaylists.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No matching playlists
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
