/**
 * Extended type declarations for the File System Access API.
 * These supplement TypeScript's built-in DOM lib which does not yet
 * include some methods (values, removeEntry, getDirectoryHandle).
 */
declare global {
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    /** Async-iterate over entries (files and directories) in this directory. */
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
    /** Return a file handle for a named child file, optionally creating it. */
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    /** Return a directory handle for a named child directory, optionally creating it. */
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    /** Remove a named entry from this directory. */
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    /** Return the underlying File object for this handle. */
    getFile(): Promise<File>;
    /** Create a writable stream that writes to this file. */
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemHandle {
    /** Request permission to access this handle. */
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    /** Query current permission for this handle. */
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }

  interface Window {
    /** Open a native directory picker and return the chosen directory handle. */
    showDirectoryPicker(options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string | FileSystemHandle;
    }): Promise<FileSystemDirectoryHandle>;
  }
}

export {};
