import { useAppStore } from "@/store/use-app-store";

export interface PendingNav {
  type: string;
  serverId?: string;
  channelId?: string;
  threadId?: string;
}

// Captured from URL params before React mounts (see main.tsx).
// Layout.tsx reads and applies this once auth resolves.
export let pendingNav: PendingNav | null = null;

export function setPendingNav(nav: PendingNav | null) {
  pendingNav = nav;
}

export function applyNav(nav: PendingNav | null) {
  if (!nav) return;
  const store = useAppStore.getState();
  if (nav.type === "channel" && nav.serverId && nav.channelId) {
    store.setActiveServer(nav.serverId);
    store.setActiveChannel(nav.channelId);
  } else if (nav.type === "dm" && nav.threadId) {
    store.setActiveDmThread(nav.threadId);
  }
}
