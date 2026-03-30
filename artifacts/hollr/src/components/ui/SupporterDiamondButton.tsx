import { useState, useEffect, useRef, useCallback } from 'react';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/store/use-app-store';
import { useAuth } from '@workspace/replit-auth-web';
import { cn } from '@/lib/utils';
import { useIsSupporter } from '@/hooks/use-supporter-status';

function dismissKey(userId: string | undefined): string {
  return userId ? `hollr:supporter-button:dismissed:${userId}` : 'hollr:supporter-button:dismissed';
}
function isDismissed(userId: string | undefined): boolean {
  try { return localStorage.getItem(dismissKey(userId)) === '1'; } catch { return false; }
}
function persistDismiss(userId: string | undefined) {
  try { localStorage.setItem(dismissKey(userId), '1'); } catch {}
}

export function useSupporterButtonState() {
  const isSupporter = useIsSupporter();
  const { user } = useAuth();
  const userId = user?.id;

  const [dismissed, setDismissedState] = useState(() => isDismissed(userId));
  const { openUserSettingsToTab } = useAppStore();

  // Re-check dismissal when userId resolves (async auth)
  useEffect(() => {
    setDismissedState(isDismissed(userId));
  }, [userId]);

  const visible = isSupporter === false && !dismissed;

  const handleClick = useCallback(() => {
    openUserSettingsToTab('supporter');
  }, [openUserSettingsToTab]);

  const handleHide = useCallback(() => {
    persistDismiss(userId);
    setDismissedState(true);
  }, [userId]);

  return { visible, handleClick, handleHide };
}

/**
 * Shared hook that encapsulates context-menu and long-press logic.
 * Returns event handlers and the current menu position (null = closed).
 */
export function useSupporterContextMenu(onHide: () => void) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActivated = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressActivated.current = false;
    const touch = e.touches[0];
    const touchX = touch?.clientX ?? 0;
    const touchY = touch?.clientY ?? 0;
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true;
      setContextMenu({ x: touchX, y: touchY });
    }, 600);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Prevent click from firing after a long-press activated the menu.
  const handleClickGuard = useCallback((originalClick: () => void, e?: React.MouseEvent) => {
    if (longPressActivated.current) {
      e?.preventDefault();
      e?.stopPropagation();
      longPressActivated.current = false;
      return;
    }
    originalClick();
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onMenuHide = useCallback(() => {
    onHide();
    setContextMenu(null);
  }, [onHide]);

  // Close on outside click/touch
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [contextMenu]);

  return {
    contextMenu,
    menuRef,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleClickGuard,
    closeContextMenu,
    onMenuHide,
  };
}

export function SupporterContextMenuPopup({
  x,
  y,
  onHide,
  menuRef,
}: {
  x: number;
  y: number;
  onHide: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: y || '50%',
        left: x || '50%',
        transform: x ? 'none' : 'translate(-50%, -50%)',
        zIndex: 9999,
      }}
      className="bg-surface-1 border border-border/50 rounded-lg shadow-2xl py-1 min-w-[140px]"
    >
      <button
        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground"
        onClick={onHide}
      >
        Hide button
      </button>
    </div>
  );
}

export function SupporterDiamondButton({ variant }: { variant: 'sidebar' | 'dock' }) {
  const { visible, handleClick, handleHide } = useSupporterButtonState();
  const {
    contextMenu, menuRef, handleContextMenu, handleTouchStart, handleTouchEnd,
    handleClickGuard, onMenuHide,
  } = useSupporterContextMenu(handleHide);

  if (!visible) return null;

  const tooltipSide = variant === 'sidebar' ? ('right' as const) : ('top' as const);
  const tooltipClassName = variant === 'sidebar' ? 'ml-2 font-semibold' : 'mb-1 font-semibold';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => handleClickGuard(handleClick, e)}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            aria-label="Become a Supporter"
            className={cn(
              'relative group flex items-center justify-center',
              variant === 'sidebar' ? 'w-full h-12' : 'w-10 h-10 shrink-0',
            )}
          >
            <div className={cn(
              'flex items-center justify-center transition-all duration-300',
              variant === 'sidebar'
                ? 'w-12 h-12 rounded-[24px] group-hover:rounded-2xl'
                : 'w-full h-full rounded-xl',
              'bg-[#0a1a22] group-hover:bg-[#0f2533]',
              'shadow-[0_0_12px_rgba(34,211,238,0.25)] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.45)]',
              'border border-[#22d3ee]/20 group-hover:border-[#22d3ee]/50',
            )}>
              <KhurkDiamondBadge size="lg" title="Become a Supporter" />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className={tooltipClassName}>
          Become a Supporter
        </TooltipContent>
      </Tooltip>

      {contextMenu && (
        <SupporterContextMenuPopup
          x={contextMenu.x}
          y={contextMenu.y}
          onHide={onMenuHide}
          menuRef={menuRef}
        />
      )}
    </>
  );
}
