import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { EmojiPickerPopover } from '@/components/chat/EmojiPickerPopover';
import { RefreshCw } from 'lucide-react';

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
  /** Optional title shown at the very top of the menu (e.g. app name, username) */
  title?: string;
  /** Optional smaller subtitle shown below the title */
  subtitle?: string;
  /** Optional small icon/image src shown left of the title */
  titleIcon?: string;
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

  // Rough pre-render height estimate to avoid visible jump on first frame
  const estimatedHeight =
    (config.title ? 52 : 0) +
    (config.quickReactions ? 56 : 0) +
    config.actions.filter(a => a.dividerBefore).length * 5 +
    config.actions.length * 36 + 16;

  const clampX = (px: number) => Math.min(Math.max(px, 8), window.innerWidth - MENU_WIDTH - 8);
  const clampY = (py: number, h: number) => {
    const PADDING = 8;
    // Prefer opening below; flip above if it would overflow the bottom
    if (py + h + PADDING > window.innerHeight) return Math.max(py - h - PADDING, PADDING);
    return Math.max(py, PADDING);
  };

  const [pos, setPos] = useState({ x: clampX(config.x), y: clampY(config.y, estimatedHeight) });

  // After render, measure actual height and reposition precisely
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const h = menuRef.current.getBoundingClientRect().height;
    setPos({ x: clampX(config.x), y: clampY(config.y, h) });
  }, [config.x, config.y]);

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
      onClick={onClose}
    >
      <div
        ref={menuRef}
        className="absolute w-[220px] bg-[#111214] border border-[#ffffff0f] rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.6)] py-1.5 overflow-visible"
        style={{ left: pos.x, top: pos.y }}
        onClick={e => e.stopPropagation()}
      >
        {/* App/item title header */}
        {config.title && (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2">
              {config.titleIcon && (
                <img
                  src={config.titleIcon}
                  alt=""
                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#f2f3f5] truncate leading-tight">
                  {config.title}
                </p>
                {config.subtitle && (
                  <p className="text-[10px] text-[#87898c] truncate leading-tight">
                    {config.subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="h-px bg-white/[0.06] mx-1 mb-1" />
          </>
        )}

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

        {/* Always-present Reload footer */}
        <div className="h-px bg-white/[0.06] mx-1 my-1" />
        <button
          onClick={() => { onClose(); window.location.reload(); }}
          className="w-[calc(100%-8px)] flex items-center gap-2.5 px-2 py-[7px] mx-1 rounded text-[14px] font-medium transition-colors text-left text-[#b5bac1] hover:bg-[#5865f2] hover:text-white"
        >
          <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-80">
            <RefreshCw size={14} />
          </span>
          <span className="flex-1 min-w-0">Reload App</span>
          <span className="text-[11px] opacity-50 font-normal shrink-0 ml-2">F5</span>
        </button>
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

  // iOS long-press → fire a synthetic contextmenu event so all onContextMenu
  // handlers work exactly as on desktop.  Also temporarily suppresses native
  // text selection so the blue handles never appear during the hold.
  useEffect(() => {
    const HOLD_MS = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0, startY = 0;

    const reset = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      // Restore text selection a beat after the touch ends
      setTimeout(() => {
        document.body.style.webkitUserSelect = '';
        (document.body.style as any).userSelect = '';
      }, 80);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { reset(); return; }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      // Suppress native text selection during the hold
      document.body.style.webkitUserSelect = 'none';
      (document.body.style as any).userSelect = 'none';
      timer = setTimeout(() => {
        const el = document.elementFromPoint(startX, startY);
        if (el) {
          el.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
            view: window,
          }));
        }
        reset();
      }, HOLD_MS);
    };

    const onMove = (e: TouchEvent) => {
      if (!timer) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) reset();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', reset);
    document.addEventListener('touchcancel', reset);

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', reset);
      document.removeEventListener('touchcancel', reset);
      if (timer) clearTimeout(timer);
    };
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
