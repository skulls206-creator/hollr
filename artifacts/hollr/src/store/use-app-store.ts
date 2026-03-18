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

  // UI
  memberListOpen: boolean;
  mobileSidebarOpen: boolean;

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

  setMemberListOpen: (open: boolean) => void;
  toggleMemberList: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;

  setVoiceConnection: (conn: Partial<AppState['voiceConnection']>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeServerId: null,
  activeChannelId: null,
  activeDmThreadId: null,

  createServerModalOpen: false,
  createChannelModalOpen: false,
  joinServerModalOpen: false,
  serverSettingsModalOpen: false,
  inviteModalOpen: false,

  memberListOpen: true,
  mobileSidebarOpen: false,

  voiceConnection: {
    channelId: null,
    serverId: null,
    status: 'disconnected',
  },

  setActiveServer: (id) => set({ activeServerId: id, activeDmThreadId: null }),
  setActiveChannel: (id) => set({ activeChannelId: id, mobileSidebarOpen: false }),
  setActiveDmThread: (id) => set({ activeDmThreadId: id, activeServerId: null, activeChannelId: null, mobileSidebarOpen: false }),

  setCreateServerModalOpen: (open) => set({ createServerModalOpen: open }),
  setCreateChannelModalOpen: (open) => set({ createChannelModalOpen: open }),
  setJoinServerModalOpen: (open) => set({ joinServerModalOpen: open }),
  setServerSettingsModalOpen: (open) => set({ serverSettingsModalOpen: open }),
  setInviteModalOpen: (open) => set({ inviteModalOpen: open }),

  setMemberListOpen: (open) => set({ memberListOpen: open }),
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),

  setVoiceConnection: (conn) => set((state) => ({
    voiceConnection: { ...state.voiceConnection, ...conn },
  })),
}));
