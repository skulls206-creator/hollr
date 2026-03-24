import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PipWindowEntry {
  id: string;
  appId: string;
}

interface ProfileCardState {
  userId: string;
  joinedAt?: string;
  role?: string;
  position?: { x: number; y: number };
}

export interface VoiceChannelUser {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  streaming: boolean;
  hasCamera: boolean;
  isBot?: boolean;
}

interface AppState {
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmThreadId: string | null;

  // Modals
  createServerModalOpen: boolean;
  createChannelModalOpen: boolean;
  joinServerModalOpen: boolean;
  serverSettingsModalOpen: boolean;
  inviteModalOpen: boolean;
  helpModalOpen: boolean;
  newDmModalOpen: boolean;

  // UI panels
  memberListOpen: boolean;
  mobileSidebarOpen: boolean;
  pinnedPanelOpen: boolean;

  // Thread sidebar
  threadMessageId: string | null;
  threadChannelId: string | null;

  // User profile card
  profileCard: ProfileCardState | null;

  // Notification mutes: set of channelIds that are muted
  mutedChannels: Set<string>;

  // Voice connection state
  voiceConnection: {
    channelId: string | null;
    serverId: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
  };

  // Voice presence: which users are in each voice channel
  voiceChannelUsers: Record<string, VoiceChannelUser[]>;

  // Voice overlay minimized state (shared so ChatArea can add layout space)
  voiceMinimized: boolean;
  setVoiceMinimized: (v: boolean) => void;

  // Height of the expanded voice panel (px) — measured by ResizeObserver; 0 when hidden
  voicePanelHeight: number;
  setVoicePanelHeight: (h: number) => void;

  // Local audio state (persisted across voice sessions)
  micMuted: boolean;
  deafened: boolean;

  // Audio device preferences (persisted)
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  setAudioInputDeviceId: (id: string | null) => void;
  setAudioOutputDeviceId: (id: string | null) => void;

  // Modals (additional)
  userSettingsModalOpen: boolean;

  // KHURK OS app shell
  activeKhurkAppId: string | null;
  setActiveKhurkAppId: (id: string | null) => void;
  khurkPipMode: boolean;
  setKhurkPipMode: (v: boolean) => void;
  khurkDashboardOpen: boolean;
  setKhurkDashboardOpen: (v: boolean) => void;
  openKhurkDashboard: () => void;

  // Multi-PiP windows (max 4)
  pipWindows: PipWindowEntry[];
  addPipWindow: (appId: string) => void;
  removePipWindow: (windowId: string) => void;
  restorePipWindow: (windowId: string) => void;

  sidebarLocked: boolean;
  setSidebarLocked: (v: boolean) => void;

  // Actions
  setActiveServer: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;
  setActiveDmThread: (id: string | null) => void;

  setCreateServerModalOpen: (open: boolean) => void;
  setCreateChannelModalOpen: (open: boolean) => void;
  setJoinServerModalOpen: (open: boolean) => void;
  setServerSettingsModalOpen: (open: boolean) => void;
  setInviteModalOpen: (open: boolean) => void;
  setHelpModalOpen: (open: boolean) => void;
  setNewDmModalOpen: (open: boolean) => void;

  setMemberListOpen: (open: boolean) => void;
  toggleMemberList: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  setPinnedPanelOpen: (open: boolean) => void;
  togglePinnedPanel: () => void;

  openThread: (channelId: string, messageId: string) => void;
  closeThread: () => void;

  openProfileCard: (state: ProfileCardState) => void;
  closeProfileCard: () => void;

  toggleMuteChannel: (channelId: string) => void;
  isChannelMuted: (channelId: string) => boolean;

  setVoiceConnection: (conn: Partial<AppState['voiceConnection']>) => void;

  // Voice presence actions
  setVoiceRoomState: (channelId: string, users: VoiceChannelUser[]) => void;
  addVoiceChannelUser: (channelId: string, user: VoiceChannelUser) => void;
  removeVoiceChannelUser: (channelId: string, userId: string) => void;
  updateVoiceChannelUser: (channelId: string, userId: string, update: Partial<Pick<VoiceChannelUser, 'muted' | 'deafened' | 'speaking' | 'streaming' | 'hasCamera' | 'displayName' | 'avatarUrl'>>) => void;
  clearVoiceChannelUsers: (channelId: string) => void;

  // Local audio toggle actions
  toggleMicMuted: () => void;
  toggleDeafened: () => void;

  // User settings modal
  setUserSettingsModalOpen: (open: boolean) => void;

  // Unread message counts per channel
  unreadCounts: Record<string, number>;
  setUnreadCount: (channelId: string, count: number) => void;
  incrementUnreadCount: (channelId: string) => void;
  clearUnreadCount: (channelId: string) => void;

  // Unread DM counts per thread
  dmUnreadCounts: Record<string, number>;
  incrementDmUnreadCount: (threadId: string) => void;
  clearDmUnreadCount: (threadId: string) => void;

  // Per-participant voice volumes (shared between VoiceOverlay + sidebar)
  voiceVolumes: Record<string, number>;
  setVoiceVolume: (userId: string, volume: number) => void;

  // Pending mention to insert into the active composer
  pendingMention: string | null;
  triggerMention: (displayName: string) => void;
  clearPendingMention: () => void;

  // Pending slash command to insert into the active composer
  pendingCommand: string | null;
  triggerCommand: (cmd: string) => void;
  clearPendingCommand: () => void;

  // Layout mode
  layoutMode: 'classic' | 'dock';
  setLayoutMode: (mode: 'classic' | 'dock') => void;

  // Classic layout: channel panel visibility (can be toggled independently of icon rail)
  classicChannelOpen: boolean;
  toggleClassicChannel: () => void;
  setClassicChannelOpen: (open: boolean) => void;

  // Theme
  theme: 'midnight' | 'slate' | 'light' | 'abyss' | 'forest' | 'void';
  setTheme: (theme: 'midnight' | 'slate' | 'light' | 'abyss' | 'forest' | 'void') => void;

  // Music bot volume (0–100), persisted so it never resets on rejoin
  musicVolume: number;
  setMusicVolume: (v: number) => void;

  // Mic gain (0–200, default 100 = unity)
  micGain: number;
  setMicGain: (gain: number) => void;

  // Music bot EQ effects
  musicEffects: { bassBoost: boolean; nightcore: boolean; normalize: boolean };
  setMusicEffect: (effect: 'bassBoost' | 'nightcore' | 'normalize', enabled: boolean) => void;

  // KHURK OS on/off (persisted)
  khurkOsEnabled: boolean;
  toggleKhurkOs: () => void;

  // KHURK dismissed app IDs (shared so all consumers stay in sync)
  khurkDismissedIds: string[];
  setKhurkDismissedIds: (ids: string[]) => void;

  // Explicit neutral mode — user clicked Ø to opt out of All/None management
  khurkAppsExplicitNeutral: boolean;
  setKhurkAppsExplicitNeutral: (v: boolean) => void;

  // Chat message text size preference
  chatFontSize: 'sm' | 'md' | 'lg';
  setChatFontSize: (size: 'sm' | 'md' | 'lg') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  activeServerId: null,
  activeChannelId: null,
  activeDmThreadId: null,

  createServerModalOpen: false,
  createChannelModalOpen: false,
  joinServerModalOpen: false,
  serverSettingsModalOpen: false,
  inviteModalOpen: false,
  helpModalOpen: false,
  newDmModalOpen: false,

  memberListOpen: false,
  mobileSidebarOpen: false,
  pinnedPanelOpen: false,

  threadMessageId: null,
  threadChannelId: null,

  profileCard: null,

  mutedChannels: new Set<string>(),

  voiceConnection: {
    channelId: null,
    serverId: null,
    status: 'disconnected',
  },

  voiceChannelUsers: {},

  voiceMinimized: false,
  setVoiceMinimized: (v) => set({ voiceMinimized: v }),

  voicePanelHeight: 0,
  setVoicePanelHeight: (h) => set({ voicePanelHeight: h }),

  micMuted: false,
  deafened: false,
  audioInputDeviceId: null,
  audioOutputDeviceId: null,
  setAudioInputDeviceId: (id) => set({ audioInputDeviceId: id }),
  setAudioOutputDeviceId: (id) => set({ audioOutputDeviceId: id }),
  userSettingsModalOpen: false,

  // KHURK OS app shell state
  activeKhurkAppId: null,
  setActiveKhurkAppId: (id) => set({ activeKhurkAppId: id, khurkPipMode: false }),
  khurkPipMode: false,
  setKhurkPipMode: (v) => set({ khurkPipMode: v }),
  khurkDashboardOpen: true,
  setKhurkDashboardOpen: (v) => set({ khurkDashboardOpen: v }),
  openKhurkDashboard: () => set({
    khurkDashboardOpen: true,
    activeServerId: null,
    activeDmThreadId: null,
    activeKhurkAppId: null,
    khurkPipMode: false,
    mobileSidebarOpen: false,
    pinnedPanelOpen: false,
    threadMessageId: null,
    threadChannelId: null,
  }),

  // Multi-PiP windows
  pipWindows: [],
  addPipWindow: (appId) => set((state) => {
    if (state.pipWindows.length >= 4) return {};
    // Don't duplicate the same app
    if (state.pipWindows.some(w => w.appId === appId)) return {};
    const id = crypto.randomUUID();
    return { pipWindows: [...state.pipWindows, { id, appId }] };
  }),
  removePipWindow: (windowId) => set((state) => ({
    pipWindows: state.pipWindows.filter(w => w.id !== windowId),
  })),
  restorePipWindow: (windowId) => set((state) => {
    const entry = state.pipWindows.find(w => w.id === windowId);
    if (!entry) return {};
    return {
      pipWindows: state.pipWindows.filter(w => w.id !== windowId),
      activeKhurkAppId: entry.appId,
      khurkPipMode: false,
    };
  }),

  // When navigating to content (server/channel/DM), exit the full AppWindow and
  // close the dashboard. PiP windows (pipWindows array) survive navigation.
  setActiveServer: (id) => set({
    activeServerId: id,
    activeDmThreadId: null,
    pinnedPanelOpen: false,
    threadMessageId: null,
    threadChannelId: null,
    khurkDashboardOpen: false,
    activeKhurkAppId: null,
  }),
  setActiveChannel: (id) => set({
    activeChannelId: id,
    mobileSidebarOpen: false,
    pinnedPanelOpen: false,
    threadMessageId: null,
    threadChannelId: null,
    // Only close the KHURK OS dashboard when navigating TO a real channel.
    // Cleanup calls (id === null) fire from ChannelSidebar's server-change effect
    // and must not kill a dashboard that was just opened.
    ...(id !== null ? { khurkDashboardOpen: false, activeKhurkAppId: null } : {}),
  }),
  setActiveDmThread: (id) => set({
    activeDmThreadId: id,
    activeServerId: null,
    activeChannelId: null,
    mobileSidebarOpen: false,
    pinnedPanelOpen: false,
    threadMessageId: null,
    threadChannelId: null,
    khurkDashboardOpen: false,
    activeKhurkAppId: null,
  }),

  setCreateServerModalOpen: (open) => set({ createServerModalOpen: open }),
  setCreateChannelModalOpen: (open) => set({ createChannelModalOpen: open }),
  setJoinServerModalOpen: (open) => set({ joinServerModalOpen: open }),
  setServerSettingsModalOpen: (open) => set({ serverSettingsModalOpen: open }),
  setInviteModalOpen: (open) => set({ inviteModalOpen: open }),
  setHelpModalOpen: (open) => set({ helpModalOpen: open }),
  setNewDmModalOpen: (open) => set({ newDmModalOpen: open }),

  setMemberListOpen: (open) => set({ memberListOpen: open }),
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setPinnedPanelOpen: (open) => set({ pinnedPanelOpen: open }),
  togglePinnedPanel: () => set((state) => ({
    pinnedPanelOpen: !state.pinnedPanelOpen,
    threadMessageId: null,
    threadChannelId: null,
  })),

  openThread: (channelId, messageId) => set({ threadChannelId: channelId, threadMessageId: messageId, pinnedPanelOpen: false }),
  closeThread: () => set({ threadMessageId: null, threadChannelId: null }),

  openProfileCard: (state) => set({ profileCard: state }),
  closeProfileCard: () => set({ profileCard: null }),

  toggleMuteChannel: (channelId) => set((state) => {
    const next = new Set(state.mutedChannels);
    if (next.has(channelId)) next.delete(channelId);
    else next.add(channelId);
    return { mutedChannels: next };
  }),
  isChannelMuted: (channelId) => get().mutedChannels.has(channelId),

  setVoiceConnection: (conn) => set((state) => ({
    voiceConnection: { ...state.voiceConnection, ...conn },
  })),

  setVoiceRoomState: (channelId, users) => set((state) => ({
    voiceChannelUsers: { ...state.voiceChannelUsers, [channelId]: users },
  })),

  addVoiceChannelUser: (channelId, user) => set((state) => {
    const existing = state.voiceChannelUsers[channelId] ?? [];
    if (existing.some(u => u.userId === user.userId)) {
      return {
        voiceChannelUsers: {
          ...state.voiceChannelUsers,
          [channelId]: existing.map(u => u.userId === user.userId ? user : u),
        },
      };
    }
    return {
      voiceChannelUsers: { ...state.voiceChannelUsers, [channelId]: [...existing, user] },
    };
  }),

  removeVoiceChannelUser: (channelId, userId) => set((state) => ({
    voiceChannelUsers: {
      ...state.voiceChannelUsers,
      [channelId]: (state.voiceChannelUsers[channelId] ?? []).filter(u => u.userId !== userId),
    },
  })),

  updateVoiceChannelUser: (channelId, userId, update) => set((state) => ({
    voiceChannelUsers: {
      ...state.voiceChannelUsers,
      [channelId]: (state.voiceChannelUsers[channelId] ?? []).map(u =>
        u.userId === userId ? { ...u, ...update } : u
      ),
    },
  })),

  clearVoiceChannelUsers: (channelId) => set((state) => {
    const next = { ...state.voiceChannelUsers };
    delete next[channelId];
    return { voiceChannelUsers: next };
  }),

  toggleMicMuted: () => set((state) => ({ micMuted: !state.micMuted })),
  toggleDeafened: () => set((state) => ({ deafened: !state.deafened })),
  setUserSettingsModalOpen: (open) => set({ userSettingsModalOpen: open }),

  unreadCounts: {},
  setUnreadCount: (channelId, count) => set((state) => ({ unreadCounts: { ...state.unreadCounts, [channelId]: count } })),
  incrementUnreadCount: (channelId) => set((state) => ({ unreadCounts: { ...state.unreadCounts, [channelId]: (state.unreadCounts[channelId] ?? 0) + 1 } })),
  clearUnreadCount: (channelId) => set((state) => { const n = { ...state.unreadCounts }; delete n[channelId]; return { unreadCounts: n }; }),

  dmUnreadCounts: {},
  incrementDmUnreadCount: (threadId) => set((state) => ({ dmUnreadCounts: { ...state.dmUnreadCounts, [threadId]: (state.dmUnreadCounts[threadId] ?? 0) + 1 } })),
  clearDmUnreadCount: (threadId) => set((state) => { const n = { ...state.dmUnreadCounts }; delete n[threadId]; return { dmUnreadCounts: n }; }),

  voiceVolumes: {},
  setVoiceVolume: (userId, volume) => set((state) => ({ voiceVolumes: { ...state.voiceVolumes, [userId]: volume } })),

  pendingMention: null,
  triggerMention: (displayName) => set({ pendingMention: displayName }),
  clearPendingMention: () => set({ pendingMention: null }),

  pendingCommand: null,
  triggerCommand: (cmd) => set({ pendingCommand: cmd }),
  clearPendingCommand: () => set({ pendingCommand: null }),

  layoutMode: 'classic',
  setLayoutMode: (mode) => set({ layoutMode: mode }),

  classicChannelOpen: true,
  toggleClassicChannel: () => set((state) => ({ classicChannelOpen: !state.classicChannelOpen })),
  setClassicChannelOpen: (open) => set({ classicChannelOpen: open }),

  theme: 'void',
  setTheme: (theme) => set({ theme }),

  musicVolume: 80,
  setMusicVolume: (v) => set({ musicVolume: v }),

  micGain: 100,
  setMicGain: (gain) => set({ micGain: gain }),

  musicEffects: { bassBoost: false, nightcore: false, normalize: false },
  setMusicEffect: (effect, enabled) => set((state) => ({
    musicEffects: { ...state.musicEffects, [effect]: enabled },
  })),

  sidebarLocked: false,
  setSidebarLocked: (v) => set({ sidebarLocked: v }),

  khurkOsEnabled: true,
  toggleKhurkOs: () => set((state) => ({ khurkOsEnabled: !state.khurkOsEnabled })),

  khurkDismissedIds: [],
  setKhurkDismissedIds: (ids) => set({ khurkDismissedIds: ids }),

  khurkAppsExplicitNeutral: false,
  setKhurkAppsExplicitNeutral: (v) => set({ khurkAppsExplicitNeutral: v }),

  chatFontSize: 'md',
  setChatFontSize: (size) => set({ chatFontSize: size }),
    }),
    {
      name: 'hollr-nav',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeServerId: state.activeServerId,
        activeChannelId: state.activeChannelId,
        audioInputDeviceId: state.audioInputDeviceId,
        audioOutputDeviceId: state.audioOutputDeviceId,
        layoutMode: state.layoutMode,
        classicChannelOpen: state.classicChannelOpen,
        theme: state.theme,
        musicVolume: state.musicVolume,
        micGain: state.micGain,
        musicEffects: state.musicEffects,
        khurkDashboardOpen: state.khurkDashboardOpen,
        khurkOsEnabled: state.khurkOsEnabled,
        sidebarLocked: state.sidebarLocked,
        chatFontSize: state.chatFontSize,
      }),
    }
  )
);
