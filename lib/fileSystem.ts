export class FileSystemManager {
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  /**
   * Opens a folder picker and returns the directory handle
   */
  async selectFolder(): Promise<FileSystemDirectoryHandle> {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser. Please use Chrome or Edge.');
    }

    this.directoryHandle = await window.showDirectoryPicker({
      mode: 'read',
    });

    return this.directoryHandle;
  }

  /**
   * Gets the current directory handle
   */
  getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.directoryHandle;
  }

  /**
   * Sets the directory handle (useful when loading from saved state)
   */
  setDirectoryHandle(handle: FileSystemDirectoryHandle) {
    this.directoryHandle = handle;
  }

  /**
   * Selects a single file from the directory with relative path
   */
  async selectFile(accept: Record<string, string[]>): Promise<{file: File, relativePath: string} | null> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('File System Access API is not supported in this browser.');
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'Files',
          accept,
        }],
        multiple: false,
        startIn: this.directoryHandle || 'documents',
      });

      const file = await fileHandle.getFile();
      
      // Try to get relative path if we have a directory handle
      let relativePath = file.name;
      if (this.directoryHandle) {
        const pathArray = await this.directoryHandle.resolve(fileHandle);
        if (pathArray && pathArray.length > 0) {
          relativePath = pathArray.join('/');
        }
      }

      return { file, relativePath };
    } catch (error) {
      // User cancelled
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Selects multiple files with relative paths
   */
  async selectFiles(accept: Record<string, string[]>): Promise<Array<{file: File, relativePath: string}>> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('File System Access API is not supported in this browser.');
    }

    try {
      const fileHandles = await window.showOpenFilePicker({
        types: [{
          description: 'Files',
          accept,
        }],
        multiple: true,
        startIn: this.directoryHandle || 'documents',
      });

      const filesWithPaths = await Promise.all(
        fileHandles.map(async handle => {
          const file = await handle.getFile();
          
          // Try to get relative path
          let relativePath = file.name;
          if (this.directoryHandle) {
            const pathArray = await this.directoryHandle.resolve(handle);
            if (pathArray && pathArray.length > 0) {
              relativePath = pathArray.join('/');
            }
          }
          
          return { file, relativePath };
        })
      );

      return filesWithPaths;
    } catch (error) {
      // User cancelled
      if ((error as Error).name === 'AbortError') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Reads a text file from the directory
   */
  async readTextFile(relativePath: string): Promise<string> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    const fileHandle = await this.getFileHandle(relativePath);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  /**
   * Gets a file handle from a relative path
   */
  private async getFileHandle(relativePath: string): Promise<FileSystemFileHandle> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    const parts = relativePath.split('/');
    let currentDir = this.directoryHandle;

    // Navigate through directories
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    }

    // Get the file
    return await currentDir.getFileHandle(parts[parts.length - 1]);
  }

  /**
   * Creates an object URL for a file (images, audio)
   */
  async getFileURL(relativePath: string): Promise<string> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    const fileHandle = await this.getFileHandle(relativePath);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  }

  /**
   * Gets a File object from relative path
   */
  async getFile(relativePath: string): Promise<File> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    const fileHandle = await this.getFileHandle(relativePath);
    return await fileHandle.getFile();
  }

  /**
   * Checks if File System Access API is supported
   */
  static isSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }
}

/**
 * Helper to get relative path from base directory
 */
export function getRelativePath(file: File, basePath: string): string {
  // For File System Access API, we use webkitRelativePath if available
  // Otherwise, we just use the name
  const fullPath = (file as any).webkitRelativePath || file.name;
  
  // If basePath is provided and the file path starts with it, remove it
  if (basePath && fullPath.startsWith(basePath)) {
    return fullPath.substring(basePath.length).replace(/^\//, '');
  }
  
  return fullPath;
}

/**
 * Helper to determine file type from extension
 */
export function getFileType(fileName: string): 'markdown' | 'image' | 'audio' | 'unknown' {
  const ext = fileName.toLowerCase().split('.').pop();
  
  if (ext === 'md' || ext === 'markdown') {
    return 'markdown';
  }
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
    return 'image';
  }
  
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext || '')) {
    return 'audio';
  }
  
  return 'unknown';
}

