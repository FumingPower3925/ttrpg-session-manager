import { AudioFile, EventPlaylist } from '@/types';
import { FileSystemManager } from './fileSystem';

// State saved per playlist to enable resume functionality
interface PlaylistState {
  trackIndex: number;
  currentTime: number;
}

// Crossfade configuration
const FADE_DURATION_MS = 1500; // Duration of fade in/out in milliseconds
const FADE_INTERVAL_MS = 50;   // Update frequency for smooth animation

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

  // State storage for resuming playlists
  private playlistStates: Map<string, PlaylistState> = new Map();
  private bgmState: PlaylistState = { trackIndex: 0, currentTime: 0 };
  private onTrackChangeCallback?: (trackName: string, mode: 'bgm' | 'event') => void;
  private onPlayStateChangeCallback?: (isPlaying: boolean) => void;

  // Crossfade state management
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private isFading: boolean = false;

  constructor(fileSystemManager: FileSystemManager) {
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.fileSystemManager = fileSystemManager;

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
   * Saves the current playlist state (track index and playback position)
   */
  private saveCurrentState(): void {
    const currentTime = this.audio.currentTime || 0;
    if (this.currentMode === 'bgm') {
      this.bgmState = { trackIndex: this.currentBgmIndex, currentTime };
    } else if (this.currentEventPlaylist) {
      this.playlistStates.set(this.currentEventPlaylist.id, {
        trackIndex: this.currentEventIndex,
        currentTime
      });
    }
  }

  /**
   * Starts playing BGM
   */
  async playBGM() {
    this.saveCurrentState();

    if (this.bgmTracks.length === 0) {
      console.warn('No BGM tracks loaded');
      alert('No background music tracks configured for this part.');
      return;
    }

    this.currentMode = 'bgm';
    this.currentBgmIndex = this.bgmState.trackIndex;

    // Ensure the index is valid
    if (this.currentBgmIndex >= this.bgmTracks.length) {
      this.currentBgmIndex = 0;
      this.bgmState = { trackIndex: 0, currentTime: 0 };
    }

    await this.loadAndPlayTrack(this.bgmTracks[this.currentBgmIndex], this.bgmState.currentTime);
  }

  /**
   * Starts an event playlist
   */
  async startEvent(playlistId: string) {
    this.saveCurrentState();

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

    // Restore saved state for this playlist
    const savedState = this.playlistStates.get(playlistId);
    this.currentEventIndex = savedState?.trackIndex ?? 0;
    const startTime = savedState?.currentTime ?? 0;

    // Ensure the index is valid
    if (this.currentEventIndex >= playlist.tracks.length) {
      this.currentEventIndex = 0;
      this.playlistStates.delete(playlistId);
    }

    await this.loadAndPlayTrack(playlist.tracks[this.currentEventIndex], startTime);
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
      this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmTracks.length;
      const track = this.bgmTracks[this.currentBgmIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    } else if (this.currentEventPlaylist) {
      if (this.currentEventPlaylist.tracks.length === 0) return;
      this.currentEventIndex = (this.currentEventIndex + 1) % this.currentEventPlaylist.tracks.length;
      const track = this.currentEventPlaylist.tracks[this.currentEventIndex];
      if (track) {
        await this.loadAndPlayTrack(track);
      }
    }
  }

  /**
   * Loads and plays a track with crossfade transition
   */
  private async loadAndPlayTrack(track: AudioFile, startTime: number = 0) {
    if (!track) {
      console.warn('Attempted to play an undefined track.');
      return;
    }

    try {
      this.cancelFade();

      if (!this.audio.paused) {
        await this.fadeOut();
      }

      const url = await this.fileSystemManager.getFileURL(track.path);

      if (this.audio.src) {
        URL.revokeObjectURL(this.audio.src);
      }

      this.audio.src = url;
      this.audio.volume = 0;
      this.audio.load();

      // Restore playback position if resuming
      if (startTime > 0) {
        this.audio.currentTime = startTime;
      }

      await this.audio.play().catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Error playing audio:', error);
        }
      });

      await this.fadeIn();

      this.onTrackChangeCallback?.(track.name, this.currentMode);
    } catch (error) {
      console.error('Error loading/playing track:', error);
      this.audio.volume = this.volume;
      this.isFading = false;
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
    if (!this.isFading) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Fades out the audio volume to 0 over FADE_DURATION_MS
   */
  private fadeOut(): Promise<void> {
    return new Promise((resolve) => {
      if (this.audio.paused || this.audio.volume === 0) {
        resolve();
        return;
      }

      this.isFading = true;
      const startVolume = this.audio.volume;
      const steps = FADE_DURATION_MS / FADE_INTERVAL_MS;
      const volumeStep = startVolume / steps;
      let currentStep = 0;

      this.fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
        this.audio.volume = newVolume;

        if (currentStep >= steps || newVolume <= 0) {
          this.audio.volume = 0;
          this.audio.pause();
          this.cancelFade();
          resolve();
        }
      }, FADE_INTERVAL_MS);
    });
  }

  /**
   * Fades in the audio volume from 0 to the target volume over FADE_DURATION_MS
   */
  private fadeIn(): Promise<void> {
    return new Promise((resolve) => {
      const targetVolume = this.volume;

      if (targetVolume === 0) {
        this.isFading = false;
        resolve();
        return;
      }

      this.isFading = true;
      this.audio.volume = 0;
      const steps = FADE_DURATION_MS / FADE_INTERVAL_MS;
      const volumeStep = targetVolume / steps;
      let currentStep = 0;

      this.fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = Math.min(targetVolume, volumeStep * currentStep);
        this.audio.volume = newVolume;

        if (currentStep >= steps || newVolume >= targetVolume) {
          this.audio.volume = targetVolume;
          this.cancelFade();
          resolve();
        }
      }, FADE_INTERVAL_MS);
    });
  }

  /**
   * Cancels any ongoing fade operation
   */
  private cancelFade() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.isFading = false;
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
   * Gets the current BGM playlist
   */
  getBGMPlaylist(): AudioFile[] {
    return [...this.bgmTracks];
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
   * Plays a specific track from the BGM playlist by index
   */
  async playBGMTrack(index: number) {
    if (index < 0 || index >= this.bgmTracks.length) {
      console.warn(`Invalid BGM track index: ${index}`);
      return;
    }

    this.currentMode = 'bgm';
    this.currentBgmIndex = index;
    await this.loadAndPlayTrack(this.bgmTracks[index]);
  }

  /**
   * Plays a specific track from the current event playlist by index
   */
  async playEventTrack(index: number) {
    if (!this.currentEventPlaylist) {
      console.warn('No event playlist is currently active');
      return;
    }

    if (index < 0 || index >= this.currentEventPlaylist.tracks.length) {
      console.warn(`Invalid event track index: ${index}`);
      return;
    }

    this.currentEventIndex = index;
    await this.loadAndPlayTrack(this.currentEventPlaylist.tracks[index]);
  }

  /**
   * Gets the current track index for the active playlist
   */
  getCurrentTrackIndex(): number {
    if (this.currentMode === 'bgm') {
      return this.currentBgmIndex;
    }
    return this.currentEventIndex;
  }

  /**
   * Gets the total number of tracks in the current playlist
   */
  getCurrentPlaylistLength(): number {
    if (this.currentMode === 'bgm') {
      return this.bgmTracks.length;
    }
    return this.currentEventPlaylist?.tracks.length || 0;
  }

  /**
   * Gets all tracks in the current playlist
   */
  getCurrentPlaylistTracks(): AudioFile[] {
    if (this.currentMode === 'bgm') {
      return [...this.bgmTracks];
    }
    return this.currentEventPlaylist ? [...this.currentEventPlaylist.tracks] : [];
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.cancelFade();
    this.audio.pause();
    if (this.audio.src) {
      URL.revokeObjectURL(this.audio.src);
    }
  }
}

