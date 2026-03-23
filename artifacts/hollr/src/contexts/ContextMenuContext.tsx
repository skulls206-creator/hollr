import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { EmojiPickerPopover } from '@/components/chat/EmojiPickerPopover';

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  shortcut?: string;
}

export interface ContextMenuConfig {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  quickReactions?: (emoji: string) => void;
}

interface ContextMenuState {
  show: (config: ContextMenuConfig) => void;
  hide: () => void;
}

const ContextMenuCtx = createContext<ContextMenuState | null>(null);

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
const MENU_WIDTH = 220;

function AppContextMenu({
  config,
  onClose,
}: {
  config: ContextMenuConfig;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const emojiPickerBtnRef = useRef<HTMLButtonElement>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const estimatedHeight =
    (config.quickReactions ? 56 : 0) +
    config.actions.filter(a => a.dividerBefore).length * 5 +
    config.actions.length * 36 + 16;

  const x = Math.min(config.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(config.y, window.innerHeight - estimatedHeight - 8);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const handleAction = (action: ContextMenuAction) => {
    if (action.disabled) return;
    onClose();
    action.onClick();
  };

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onContextMenu={e => { e.preventDefault(); onClose(); }}
    >
      <div
        ref={menuRef}
        className="absolute w-[220px] bg-[#111214] border border-[#ffffff0f] rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.6)] py-1.5 overflow-visible"
        style={{ left: x, top: y }}
      >
        {/* Quick reaction strip */}
        {config.quickReactions && (
          <>
            <div className="flex items-center px-2 py-1.5 gap-1">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    config.quickReactions!(emoji);
                    onClose();
                  }}
                  className="flex-1 flex items-center justify-center text-[20px] h-9 rounded-md hover:bg-white/10 transition-all hover:scale-125 active:scale-110"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
              <div className="relative flex-1">
                <button
                  ref={emojiPickerBtnRef}
                  onClick={() => setEmojiPickerOpen(v => !v)}
                  className="w-full flex items-center justify-center h-9 rounded-md hover:bg-white/10 transition-all text-[#b5bac1] hover:text-white text-[18px]"
                  title="More reactions"
                >
                  +
                </button>
                {emojiPickerOpen && (
                  <EmojiPickerPopover
                    onEmojiClick={emoji => {
                      config.quickReactions!(emoji);
                      onClose();
                    }}
                    onClose={() => setEmojiPickerOpen(false)}
                    anchorRef={emojiPickerBtnRef as any}
                    align="right"
                  />
                )}
              </div>
            </div>
            <div className="h-px bg-white/[0.06] mx-1 my-1" />
          </>
        )}

        {/* Action items */}
        {config.actions.map(action => (
          <div key={action.id}>
            {action.dividerBefore && (
              <div className="h-px bg-white/[0.06] mx-1 my-1" />
            )}
            <button
              onClick={() => handleAction(action)}
              disabled={action.disabled}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-[7px] mx-1 rounded text-[14px] font-medium transition-colors text-left',
                'w-[calc(100%-8px)]',
                action.disabled
                  ? 'opacity-40 cursor-not-allowed text-[#b5bac1]'
                  : action.danger
                    ? 'text-[#f23f42] hover:bg-[#f23f42] hover:text-white'
                    : 'text-[#dbdee1] hover:bg-[#5865f2] hover:text-white'
              )}
            >
              {action.icon && (
                <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-80">
                  {action.icon}
                </span>
              )}
              <span className="flex-1 min-w-0">{action.label}</span>
              {action.shortcut && (
                <span className="text-[11px] opacity-50 font-normal shrink-0 ml-2">
                  {action.shortcut}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ContextMenuConfig | null>(null);

  const show = useCallback((config: ContextMenuConfig) => {
    setCurrent(config);
  }, []);

  const hide = useCallback(() => {
    setCurrent(null);
  }, []);

  return (
    <ContextMenuCtx.Provider value={{ show, hide }}>
      <div
        className="contents"
        onContextMenu={e => {
          if ((e.target as HTMLElement).closest('[data-ctx-suppress]')) return;
          e.preventDefault();
        }}
      >
        {children}
      </div>
      {current && <AppContextMenu config={current} onClose={hide} />}
    </ContextMenuCtx.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) throw new Error('useContextMenu must be used inside ContextMenuProvider');
  return ctx;
}
