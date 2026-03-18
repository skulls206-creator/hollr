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
  
  voiceConnection: {
    channelId: null,
    serverId: null,
    status: 'disconnected',
  },
  
  setActiveServer: (id) => set({ activeServerId: id, activeDmThreadId: null }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
  setActiveDmThread: (id) => set({ activeDmThreadId: id, activeServerId: null, activeChannelId: null }),
  
  setCreateServerModalOpen: (open) => set({ createServerModalOpen: open }),
  setCreateChannelModalOpen: (open) => set({ createChannelModalOpen: open }),
  setJoinServerModalOpen: (open) => set({ joinServerModalOpen: open }),
  setServerSettingsModalOpen: (open) => set({ serverSettingsModalOpen: open }),
  
  setVoiceConnection: (conn) => set((state) => ({ 
    voiceConnection: { ...state.voiceConnection, ...conn } 
  })),
}));
