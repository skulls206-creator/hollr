import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hollr:dm-seen-v2";

type SeenMap = Record<string, string>;

async function loadSeenMap(): Promise<SeenMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

async function saveSeenMap(map: SeenMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export async function markDmThreadSeen(threadId: string, lastMessageId: string): Promise<void> {
  const map = await loadSeenMap();
  map[threadId] = lastMessageId;
  await saveSeenMap(map);
}

export async function getDmSeenMap(): Promise<SeenMap> {
  return loadSeenMap();
}

export async function isDmThreadUnread(threadId: string, lastMessageId: string | null | undefined): Promise<boolean> {
  if (!lastMessageId) return false;
  const map = await loadSeenMap();
  return map[threadId] !== lastMessageId;
}
