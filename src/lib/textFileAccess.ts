// Open and save a local text file from the browser. With the File System
// Access API (Chrome, Edge) the file is written back in place; without it
// (Firefox, Safari) opening uses an <input type="file"> and saving downloads
// a file with the same name.

import { saveAs } from 'file-saver';

/** The slice of the File System Access API this module uses (not in TS's DOM lib yet). */
export interface WritableFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

type OpenPicker = (opts: {
  types: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}) => Promise<WritableFileHandle[]>;

type SavePicker = (opts: {
  suggestedName?: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<WritableFileHandle>;

export interface LocalTextFile {
  name: string;
  text: string;
  /** Present when the browser lets us write the same file back. */
  handle?: WritableFileHandle;
}

function openPicker(): OpenPicker | undefined {
  return (window as unknown as { showOpenFilePicker?: OpenPicker }).showOpenFilePicker;
}

function savePicker(): SavePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
}

const TXT = [{ description: 'Dibujo de texto', accept: { 'text/plain': ['.txt'] } }];

/** Can the browser write a file in place (Save overwrites the .txt)? */
export function canWriteInPlace(): boolean {
  return typeof window !== 'undefined' && typeof openPicker() === 'function';
}

function pickWithInput(multiple: boolean): Promise<LocalTextFile[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.multiple = multiple;
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      if (files.length === 0) { resolve([]); return; }
      Promise.all(files.map(f => f.text().then(text => ({ name: f.name, text })))).then(resolve, reject);
    });
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/**
 * Asks for one or more .txt (a drawing, and its `.retoque.txt` alongside when
 * there is one). Resolves empty when the person cancels.
 */
export async function pickTextFiles(): Promise<LocalTextFile[]> {
  const picker = openPicker();
  if (!picker) return pickWithInput(true);
  try {
    const handles = await picker.call(window, { types: TXT, multiple: true });
    return await Promise.all(handles.map(async handle => {
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    throw err;
  }
}

/** Asks for a .txt. Resolves null when the person cancels. */
export async function pickTextFile(): Promise<LocalTextFile | null> {
  return (await pickTextFiles())[0] ?? null;
}

/**
 * Asks where a new file goes (the retouch of a drawing, which has no handle
 * yet) and writes it. Without the File System Access API it downloads instead.
 */
export async function saveTextFileAs(name: string, text: string): Promise<{ how: 'written' | 'downloaded'; handle?: WritableFileHandle }> {
  const picker = savePicker();
  if (picker) {
    try {
      const handle = await picker.call(window, { suggestedName: name, types: TXT });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { how: 'written', handle };
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
      return { how: 'downloaded' };
    }
  }
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  return { how: 'downloaded' };
}

/** Writes the text back: in place when there is a handle, else as a download. */
export async function writeTextFile(file: { name: string; handle?: WritableFileHandle }, text: string): Promise<'written' | 'downloaded'> {
  const { handle } = file;
  if (handle) {
    let permission: PermissionState = 'granted';
    if (handle.queryPermission) permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && handle.requestPermission) permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return 'written';
    }
  }
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), file.name);
  return 'downloaded';
}
