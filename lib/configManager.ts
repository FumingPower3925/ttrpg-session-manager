import { SessionConfig } from '@/types';

/**
 * Exports the session configuration as a JSON file
 */
export function exportConfig(config: SessionConfig): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.folderName || 'session'}-config.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Imports a session configuration from a JSON file
 */
export async function importConfig(): Promise<SessionConfig | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        
        if (validateConfig(config)) {
          resolve(config);
        } else {
          console.error('Invalid configuration file');
          alert('Invalid configuration file. Please select a valid session configuration.');
          resolve(null);
        }
      } catch (error) {
        console.error('Error reading configuration file:', error);
        alert('Error reading configuration file. Please make sure it is a valid JSON file.');
        resolve(null);
      }
    };
    
    input.oncancel = () => {
      resolve(null);
    };
    
    input.click();
  });
}

/**
 * Validates the structure of a session configuration
 */
export function validateConfig(config: any): config is SessionConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }
  
  if (typeof config.folderName !== 'string') {
    return false;
  }
  
  if (!Array.isArray(config.parts)) {
    return false;
  }
  
  // Validate each part
  for (const part of config.parts) {
    if (!validatePart(part)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates a single part
 */
function validatePart(part: any): boolean {
  if (!part || typeof part !== 'object') {
    return false;
  }
  
  if (typeof part.id !== 'string' || typeof part.name !== 'string') {
    return false;
  }
  
  if (part.planFile !== null && !validateFileReference(part.planFile)) {
    return false;
  }
  
  if (!Array.isArray(part.images) || !part.images.every(validateFileReference)) {
    return false;
  }
  
  if (!Array.isArray(part.supportDocs) || !part.supportDocs.every(validateFileReference)) {
    return false;
  }
  
  if (!Array.isArray(part.bgmPlaylist) || !part.bgmPlaylist.every(validateFileReference)) {
    return false;
  }
  
  if (!Array.isArray(part.eventPlaylists) || !part.eventPlaylists.every(validateEventPlaylist)) {
    return false;
  }
  
  return true;
}

/**
 * Validates a file reference
 */
function validateFileReference(ref: any): boolean {
  if (!ref || typeof ref !== 'object') {
    return false;
  }
  
  if (typeof ref.path !== 'string' || typeof ref.name !== 'string' || typeof ref.type !== 'string') {
    return false;
  }
  
  if (!['markdown', 'image', 'audio'].includes(ref.type)) {
    return false;
  }
  
  return true;
}

/**
 * Validates an event playlist
 */
function validateEventPlaylist(playlist: any): boolean {
  if (!playlist || typeof playlist !== 'object') {
    return false;
  }
  
  if (typeof playlist.id !== 'string' || typeof playlist.name !== 'string') {
    return false;
  }
  
  if (!Array.isArray(playlist.tracks) || !playlist.tracks.every(validateFileReference)) {
    return false;
  }
  
  return true;
}

/**
 * Creates an empty session configuration
 */
export function createEmptyConfig(folderName: string = ''): SessionConfig {
  return {
    folderName,
    parts: [],
    playerCharacters: [],
  };
}

