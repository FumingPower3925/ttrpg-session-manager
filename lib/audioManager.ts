import { AudioFile, EventPlaylist } from '@/types';
import { FileSystemManager } from './fileSystem';

export class AudioManager {
  private audio: HTMLAudioElement;
  private currentMode: 'bgm' | 'event' = 'bgm';
  private bgmTracks: AudioFile[] = [];
  private currentBgmIndex: number = 0;
  private eventPlaylists: Map<string, EventPlaylist> = new Map();
  private currentEventPlaylist: EventPlaylist | null = null;
  private currentEventIndex: number = 0;
  private fileSystemManager: FileSystemManager;
  private isInitialized: boolean = false;
  private volume: number = 0.7;
  private onTrackChangeCallback?: (trackName: string, mode: 'bgm' | 'event') => void;
  private onPlayStateChangeCallback?: (isPlaying: boolean) => void;

  constructor(fileSystemManager: FileSystemManager) {
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.fileSystemManager = fileSystemManager;
    
    // Auto-play next track when current one ends
    this.audio.addEventListener('ended', () => {
      this.playNext();
    });

    this.audio.addEventListener('play', () => {
      this.onPlayStateChangeCallback?.(true);
    });

    this.audio.addEventListener('pause', () => {
      this.onPlayStateChangeCallback?.(false);
    });
  }

  /**
   * Sets up event listeners for track changes
   */
  onTrackChange(callback: (trackName: string, mode: 'bgm' | 'event') => void) {
    this.onTrackChangeCallback = callback;
  }

  /**
   * Sets up event listeners for play state changes
   */
  onPlayStateChange(callback: (isPlaying: boolean) => void) {
    this.onPlayStateChangeCallback = callback;
  }

  /**
   * Loads BGM tracks
   */
  loadBGM(tracks: AudioFile[]) {
    this.bgmTracks = tracks;
    this.currentBgmIndex = 0;
  }

  /**
   * Loads event playlists
   */
  loadEventPlaylists(playlists: EventPlaylist[]) {
    this.eventPlaylists.clear();
    playlists.forEach(playlist => {
      this.eventPlaylists.set(playlist.id, playlist);
    });
  }

  /**
   * Starts playing BGM
   */
  async playBGM() {
    if (this.bgmTracks.length === 0) {
      console.warn('No BGM tracks loaded');
      alert('No background music tracks configured for this part.');
      return;
    }

    this.currentMode = 'bgm';
    this.currentBgmIndex = 0; // Start from beginning
    await this.loadAndPlayTrack(this.bgmTracks[this.currentBgmIndex]);
  }

  /**
   * Starts an event playlist
   */
  async startEvent(playlistId: string) {
    const playlist = this.eventPlaylists.get(playlistId);
    if (!playlist) {
      console.error(`Event playlist not found: ${playlistId}`);
      return;
    }

    if (playlist.tracks.length === 0) {
      console.warn('Event playlist has no tracks');
      return;
    }

    this.currentMode = 'event';
    this.currentEventPlaylist = playlist;
    this.currentEventIndex = 0;
    await this.loadAndPlayTrack(playlist.tracks[0]);
  }

  /**
   * Stops the current event and resumes BGM
   */
  async stopEvent() {
    if (this.currentMode === 'bgm') {
      return;
    }

    this.currentEventPlaylist = null;
    this.currentEventIndex = 0;
    this.currentMode = 'bgm';
    
    if (this.bgmTracks.length > 0) {
      await this.playBGM();
    }
  }

  /**
   * Plays the next track in the current playlist
   */
  private async playNext() {
    if (this.currentMode === 'bgm') {
      if (this.bgmTracks.length === 0) return;
      // Loop through BGM tracks
      this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmTracks.length;
      const track = this.bgmTracks[this.currentBgmIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    } else if (this.currentEventPlaylist) {
      if (this.currentEventPlaylist.tracks.length === 0) return;
      // Loop through event tracks
      this.currentEventIndex = (this.currentEventIndex + 1) % this.currentEventPlaylist.tracks.length;
      const track = this.currentEventPlaylist.tracks[this.currentEventIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    }
  }

  /**
   * Loads and plays a track
   */
  private async loadAndPlayTrack(track: AudioFile) {
    if (!track) {
      console.warn('Attempted to play an undefined track.');
      return;
    }
    
    try {
      // Pause current playback to prevent interruption errors
      if (!this.audio.paused) {
        this.audio.pause();
      }

      const url = await this.fileSystemManager.getFileURL(track.path);
      
      // Clean up old URL if exists
      if (this.audio.src) {
        URL.revokeObjectURL(this.audio.src);
      }
      
      // Load new source
      this.audio.src = url;
      this.audio.load(); // Explicitly load the new source
      
      // Play the audio and handle promise properly
      await this.audio.play().catch((error) => {
        // Ignore AbortError which happens during rapid track changes
        if (error.name !== 'AbortError') {
          console.error('Error playing audio:', error);
        }
      });
      
      this.onTrackChangeCallback?.(track.name, this.currentMode);
    } catch (error) {
      console.error('Error loading/playing track:', error);
      // Try to play the next track if this one fails
      this.playNext();
    }
  }

  /**
   * Pauses playback
   */
  pause() {
    this.audio.pause();
  }

  /**
   * Resumes playback
   */
  async resume() {
    try {
      await this.audio.play().catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Error resuming audio:', error);
        }
      });
    } catch (error) {
      console.error('Error in resume:', error);
    }
  }

  /**
   * Sets the volume (0-1)
   */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.audio.volume = this.volume;
  }

  /**
   * Gets the current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Checks if audio is currently playing
   */
  isPlaying(): boolean {
    return !this.audio.paused;
  }

  /**
   * Gets the current mode
   */
  getCurrentMode(): 'bgm' | 'event' {
    return this.currentMode;
  }

  /**
   * Gets the current event playlist (if in event mode)
   */
  getCurrentEventPlaylist(): EventPlaylist | null {
    return this.currentEventPlaylist;
  }

  /**
   * Gets the current track name
   */
  getCurrentTrackName(): string {
    if (this.currentMode === 'bgm') {
      if (this.bgmTracks.length === 0) {
        return 'No BGM tracks';
      }
      const track = this.bgmTracks[this.currentBgmIndex];
      return track?.name || 'Unknown track';
    } else if (this.currentEventPlaylist) {
      if (this.currentEventPlaylist.tracks.length === 0) {
        return 'No event tracks';
      }
      const track = this.currentEventPlaylist.tracks[this.currentEventIndex];
      return track?.name || 'Unknown track';
    }
    return 'No track selected';
  }

  /**
   * Skips to the next track
   */
  async skipNext() {
    await this.playNext();
  }

  /**
   * Skips to the previous track
   */
  async skipPrevious() {
    if (this.currentMode === 'bgm') {
      if (this.bgmTracks.length === 0) return;
      this.currentBgmIndex = this.currentBgmIndex === 0 
        ? this.bgmTracks.length - 1 
        : this.currentBgmIndex - 1;
      const track = this.bgmTracks[this.currentBgmIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    } else if (this.currentEventPlaylist) {
      if (this.currentEventPlaylist.tracks.length === 0) return;
      this.currentEventIndex = this.currentEventIndex === 0 
        ? this.currentEventPlaylist.tracks.length - 1 
        : this.currentEventIndex - 1;
      const track = this.currentEventPlaylist.tracks[this.currentEventIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    }
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.audio.pause();
    if (this.audio.src) {
      URL.revokeObjectURL(this.audio.src);
    }
  }
}

