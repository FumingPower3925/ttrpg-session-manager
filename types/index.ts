export interface PlayerCharacterStats {
  name: string;
  maxHP: number | null;
  defense: number | null;
}

export interface SessionConfig {
  folderName: string;
  parts: Part[];
  playerCharacters: string[]; // PC names for initiative tracking
  pcStats: PlayerCharacterStats[]; // Parsed stats from character sheets
  paths?: PathDef[]; // Branching paths (v1: single fork point)
  activePathId?: string | null; // Currently selected path; null/absent = no path chosen
}

export interface Part {
  id: string;
  name: string;
  planFile: FileReference | null;
  images: FileReference[];
  supportDocs: FileReference[];
  bgmPlaylist: AudioFile[];
  eventPlaylists: EventPlaylist[];
  pathId?: string | null; // absent/null = trunk (shared); otherwise belongs to that PathDef
}

export interface PathDef {
  id: string;
  name: string;
  branchAfterPartId: string; // the trunk Part after which this path's Parts begin
  color?: string;
}

export interface FileReference {
  path: string; // relative to base folder
  name: string;
  type: 'markdown' | 'image' | 'audio';
}

export interface AudioFile extends FileReference {
  type: 'audio';
}

export interface EventPlaylist {
  id: string;
  name: string;
  tracks: AudioFile[];
}

export interface PlayState {
  currentPartId: string | null;
  currentTab: string;
  audioMode: 'bgm' | 'event';
  currentEventPlaylistId: string | null;
  isPlaying: boolean;
  volume: number;
}

