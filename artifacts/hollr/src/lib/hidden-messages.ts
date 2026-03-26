const KEY = 'hollr:hidden-messages';

function loadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSet(s: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...s]));
}

export function isMessageHidden(id: string): boolean {
  return loadSet().has(id);
}

export function hideMessage(id: string) {
  const s = loadSet();
  s.add(id);
  saveSet(s);
}

export function unhideMessage(id: string) {
  const s = loadSet();
  s.delete(id);
  saveSet(s);
}

export function toggleMessageHidden(id: string): boolean {
  const s = loadSet();
  if (s.has(id)) {
    s.delete(id);
    saveSet(s);
    return false;
  }
  s.add(id);
  saveSet(s);
  return true;
}
