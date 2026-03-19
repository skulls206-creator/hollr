import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  speaking: boolean;
  streaming: boolean;
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

  // Local audio state (persisted across voice sessions)
  micMuted: boolean;
  deafened: boolean;

  // Modals (additional)
  userSettingsModalOpen: boolean;

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
  updateVoiceChannelUser: (channelId: string, userId: string, update: Partial<Pick<VoiceChannelUser, 'muted' | 'speaking' | 'streaming' | 'displayName' | 'avatarUrl'>>) => void;
  clearVoiceChannelUsers: (channelId: string) => void;

  // Local audio toggle actions
  toggleMicMuted: () => void;
  toggleDeafened: () => void;

  // User settings modal
  setUserSettingsModalOpen: (open: boolean) => void;

  // Pending mention to insert into the active composer
  pendingMention: string | null;
  triggerMention: (displayName: string) => void;
  clearPendingMention: () => void;
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

  memberListOpen: true,
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

  micMuted: false,
  deafened: false,
  userSettingsModalOpen: false,

  setActiveServer: (id) => set({ activeServerId: id, activeDmThreadId: null, pinnedPanelOpen: false, threadMessageId: null, threadChannelId: null }),
  setActiveChannel: (id) => set({ activeChannelId: id, mobileSidebarOpen: false, pinnedPanelOpen: false, threadMessageId: null, threadChannelId: null }),
  setActiveDmThread: (id) => set({ activeDmThreadId: id, activeServerId: null, activeChannelId: null, mobileSidebarOpen: false, pinnedPanelOpen: false, threadMessageId: null, threadChannelId: null }),

  setCreateServerModalOpen: (open) => set({ createServerModalOpen: open }),
  setCreateChannelModalOpen: (open) => set({ createChannelModalOpen: open }),
  setJoinServerModalOpen: (open) => set({ joinServerModalOpen: open }),
  setServerSettingsModalOpen: (open) => set({ serverSettingsModalOpen: open }),
  setInviteModalOpen: (open) => set({ inviteModalOpen: open }),
  setHelpModalOpen: (open) => set({ helpModalOpen: open }),

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
    // Don't duplicate
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

  pendingMention: null,
  triggerMention: (displayName) => set({ pendingMention: displayName }),
  clearPendingMention: () => set({ pendingMention: null }),
    }),
    {
      name: 'hollr-nav',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeServerId: state.activeServerId,
        activeChannelId: state.activeChannelId,
      }),
    }
  )
);
