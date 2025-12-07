'use client';

import { useState, useEffect } from 'react';
import { EventPlaylist } from '@/types';
import { AudioManager } from '@/lib/audioManager';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, SkipForward, SkipBack, Music2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  useEffect(() => {
    if (!audioManager) return;

    audioManager.onTrackChange((trackName, mode) => {
      setCurrentTrack(trackName);
      setCurrentMode(mode);
    });

    audioManager.onPlayStateChange((playing) => {
      setIsPlaying(playing);
    });

    // Update current event playlist
    const interval = setInterval(() => {
      setCurrentEventPlaylist(audioManager.getCurrentEventPlaylist());
      setCurrentMode(audioManager.getCurrentMode());
      setIsPlaying(audioManager.isPlaying());
      setCurrentTrack(audioManager.getCurrentTrackName());
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
  };

  const handleSelectEvent = async (playlistId: string) => {
    if (!audioManager) return;
    await audioManager.startEvent(playlistId);
  };

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
          <CardContent className="pt-6 space-y-4 flex flex-col min-h-0">
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

            {/* Playlist Selection */}
            <div className="space-y-2 min-h-0 flex flex-col">
              <span className="text-sm font-medium flex-shrink-0">Select Playlist</span>

              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pb-2 pr-3">
                  {/* BGM Button */}
                  <Button
                    variant={currentMode === 'bgm' ? 'default' : 'outline'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleSelectBGM}
                  >
                    Background Music
                  </Button>

                  {/* Event Playlists */}
                  {eventPlaylists.map((playlist) => (
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
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
