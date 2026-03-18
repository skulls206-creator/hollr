import { create } from 'zustand';

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

  // Notification mutes: set of channelIds that are muted
  mutedChannels: Set<string>;

  // Voice connection state
  voiceConnection: {
    channelId: string | null;
    serverId: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
  };

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

  toggleMuteChannel: (channelId: string) => void;
  isChannelMuted: (channelId: string) => boolean;

  setVoiceConnection: (conn: Partial<AppState['voiceConnection']>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
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

  mutedChannels: new Set<string>(),

  voiceConnection: {
    channelId: null,
    serverId: null,
    status: 'disconnected',
  },

  setActiveServer: (id) => set({ activeServerId: id, activeDmThreadId: null, pinnedPanelOpen: false }),
  setActiveChannel: (id) => set({ activeChannelId: id, mobileSidebarOpen: false, pinnedPanelOpen: false }),
  setActiveDmThread: (id) => set({ activeDmThreadId: id, activeServerId: null, activeChannelId: null, mobileSidebarOpen: false, pinnedPanelOpen: false }),

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
  togglePinnedPanel: () => set((state) => ({ pinnedPanelOpen: !state.pinnedPanelOpen })),

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
}));
