import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';
import { ExternalLink, EyeOff, Grid2x2, LayoutList, Menu, MonitorPlay, Pin, PinOff, RotateCcw, Sparkles } from 'lucide-react';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useKhurkDismissals } from '@/hooks/use-khurk-dismissals';
import { useDockOrder } from '@/hooks/use-dock-order';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/notifications/NotificationBell';

function AppCard({ app, onDismiss }: { app: KhurkApp; onDismiss?: () => void }) {
  const { setActiveKhurkAppId } = useAppStore();
  const { show: showMenu } = useContextMenu();

  const handleLaunch = () => {
    if (app.openMode === 'tab') {
      window.open(app.url, '_blank', 'noopener');
    } else {
      setActiveKhurkAppId(app.id);
    }
  };

  const isTab = app.openMode === 'tab';

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu({
      x: e.clientX, y: e.clientY,
      title: app.name,
      subtitle: app.tagline,
      titleIcon: app.imageSrc,
      actions: [
        {
          id: 'launch',
          label: isTab ? 'Open' : 'Launch in Window',
          icon: isTab ? <ExternalLink size={14} /> : <MonitorPlay size={14} />,
          onClick: handleLaunch,
        },
        {
          id: 'open-tab',
          label: 'Open in New Tab',
          icon: <ExternalLink size={14} />,
          onClick: () => window.open(app.url, '_blank', 'noopener'),
        },
        ...(onDismiss ? [{
          id: 'hide',
          label: 'Hide from dock & dashboard',
          icon: <EyeOff size={14} />,
          onClick: onDismiss,
          danger: true,
          dividerBefore: true,
        }] : []),
      ],
    });
  }, [app, isTab, showMenu, handleLaunch, onDismiss]);

  const handleExternalOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(app.url, '_blank', 'noopener');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleLaunch}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter') { handleLaunch(); }
        if (e.key === ' ') { e.preventDefault(); handleLaunch(); }
      }}
      className="group flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-200 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-card cursor-pointer"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}
    >
      {/* ── Cinematic banner ── */}
      <div
        className="w-full relative overflow-hidden shrink-0 h-[130px] sm:h-[160px]"
        style={{
          background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        }}
      >
        {/* Full-bleed photorealistic background image */}
        {app.bannerSrc && (
          <img
            src={app.bannerSrc}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {/* Dark vignette overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.78) 100%)' }}
        />

        {/* App icon centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          {app.imageSrc ? (
            <div
              className="rounded-2xl p-3 flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.13)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
              }}
            >
              <img
                src={app.imageSrc}
                alt={app.name}
                className="w-11 h-11 object-contain"
                style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }}
              />
            </div>
          ) : (
            <HollrIcon size={52} />
          )}
        </div>

        {/* External link badge */}
        {isTab && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <ExternalLink size={13} className="text-white/70" />
          </div>
        )}

        {/* Hover shine */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }}
        />
      </div>

      {/* ── Info body ── */}
      <div className="px-4 pt-3 pb-2 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-bold text-foreground leading-tight text-center">{app.name}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{app.description}</p>
      </div>

      {/* ── Launch bar with external open button ── */}
      <div className="px-4 pb-4 pt-1 flex items-center gap-2">
        <div className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border/50 transition-all duration-150">
          {isTab ? 'Open' : 'Launch'}
        </div>
        <button
          onClick={handleExternalOpen}
          title="Open in new tab to install as app"
          aria-label="Open in new tab to install as app"
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-secondary border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}

function AppListRow({ app, onDismiss }: { app: KhurkApp; onDismiss?: () => void }) {
  const { setActiveKhurkAppId } = useAppStore();
  const { show: showMenu } = useContextMenu();
  const isTab = app.openMode === 'tab';

  const handleLaunch = () => {
    if (isTab) window.open(app.url, '_blank', 'noopener');
    else setActiveKhurkAppId(app.id);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu({
      x: e.clientX, y: e.clientY,
      title: app.name,
      subtitle: app.tagline,
      titleIcon: app.imageSrc,
      actions: [
        { id: 'launch', label: isTab ? 'Open' : 'Launch in Window', icon: isTab ? <ExternalLink size={14} /> : <MonitorPlay size={14} />, onClick: handleLaunch },
        { id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
        ...(onDismiss ? [{ id: 'hide', label: 'Hide from dock & dashboard', icon: <EyeOff size={14} />, onClick: onDismiss, danger: true, dividerBefore: true }] : []),
      ],
    });
  }, [app, isTab, showMenu, handleLaunch, onDismiss]);

  const handleExternalOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(app.url, '_blank', 'noopener');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleLaunch}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter') { handleLaunch(); }
        if (e.key === ' ') { e.preventDefault(); handleLaunch(); }
      }}
      className="group w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-left cursor-pointer"
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
      >
        {app.imageSrc ? (
          <img src={app.imageSrc} alt={app.name} className="w-7 h-7 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
        ) : (
          <HollrIcon size={28} />
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-bold text-foreground leading-tight truncate">{app.name}</span>
        <span className="text-xs text-muted-foreground leading-snug truncate">{app.description}</span>
      </div>

      {/* Launch + external open */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-secondary-foreground border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {isTab ? 'Open' : 'Launch'}
        </div>
        <button
          onClick={handleExternalOpen}
          title="Open in new tab to install as app"
          aria-label="Open in new tab to install as app"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}

interface DashboardViewProps {
  onOpenSidebar?: () => void;
}

export function DashboardView({ onOpenSidebar }: DashboardViewProps) {
  const { sidebarLocked, setSidebarLocked, layoutMode, setClassicChannelOpen } = useAppStore();
  const { visibleApps, hasAnyDismissed, dismissOne, restoreAll } = useKhurkDismissals();
  const dockOrder = useDockOrder();
  // Temporarily show all apps (ignores user's hidden list until they navigate away)
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Sort a list of apps to match the user's dock order.
  // Apps that appear in the dock come first (in dock sequence).
  // Apps not in the dock order (e.g. dismissed) fall to the end in their
  // original KHURK_APPS index order.
  const applyDockOrder = useCallback((apps: KhurkApp[]): KhurkApp[] => {
    // dockOrder contains server IDs too — filter to only app IDs
    const appIdSet = new Set(KHURK_APPS.map(a => a.id));
    const orderedAppIds = dockOrder.filter(id => appIdSet.has(id));
    if (!orderedAppIds.length) return apps;
    return [...apps].sort((a, b) => {
      const ia = orderedAppIds.indexOf(a.id);
      const ib = orderedAppIds.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;   // both unlisted → keep relative order
      if (ia === -1) return 1;                 // a unlisted → a goes after b
      if (ib === -1) return -1;                // b unlisted → b goes after a
      return ia - ib;                          // both listed → sort by position
    });
  }, [dockOrder]);

  const displayedApps = useMemo(
    () => applyDockOrder(showAll ? KHURK_APPS : visibleApps),
    [applyDockOrder, showAll, visibleApps],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full bg-background">

      {/* ── Top bar ── */}
      <div className="relative z-50 flex items-center gap-1 px-4 shrink-0 border-b border-border bg-surface-2" style={{ height: '52px' }}>
        <button
          onClick={() => { if (!sidebarLocked) onOpenSidebar?.(); }}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            sidebarLocked
              ? 'text-muted-foreground/25 cursor-default'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
          title={sidebarLocked ? 'Sidebar is pinned' : 'Toggle sidebar'}
        >
          <Menu size={18} />
        </button>
        <button
          onClick={() => {
            const next = !sidebarLocked;
            setSidebarLocked(next);
            if (next && layoutMode === 'classic') setClassicChannelOpen(true);
          }}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-accent',
            sidebarLocked ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground',
          )}
          title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
        >
          {sidebarLocked ? <Pin size={13} /> : <PinOff size={13} />}
        </button>
        <div className="flex items-center gap-2 ml-1">
          <img src="/khurk-logo.png" alt="KHURK OS" className="w-6 h-6 rounded-md object-cover shrink-0" draggable={false} />
          <span className="text-sm font-bold tracking-tight text-foreground">KHURK OS</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <NotificationBell />
          <div className="w-px h-5 bg-border/50 mx-1" />
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
              viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground/50 hover:text-foreground hover:bg-accent/60',
            )}
            title="Grid view"
          >
            <Grid2x2 size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
              viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground/50 hover:text-foreground hover:bg-accent/60',
            )}
            title="List view"
          >
            <LayoutList size={14} />
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center min-h-full">

          {/* ── Hero ── */}
          <div className="relative w-full flex flex-col items-center pt-12 pb-10 px-4 overflow-hidden">
            {/* Primary-color radial glow — follows theme */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--primary) / 0.12) 0%, transparent 70%)',
              }}
            />
            {/* Circuit grid — uses primary accent */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(hsl(var(--primary) / 0.10) 1px, transparent 1px),
                  linear-gradient(90deg, hsl(var(--primary) / 0.10) 1px, transparent 1px)
                `,
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse 80% 65% at 50% 0%, black 0%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 65% at 50% 0%, black 0%, transparent 80%)',
                opacity: 0.5,
              }}
            />
            {/* Processor chip decorative traces */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-64 pointer-events-none"
              style={{ opacity: 0.22, color: 'hsl(var(--primary))' }}
            >
              <svg width="256" height="40" viewBox="0 0 256 40" fill="none">
                <rect x="88" y="0" width="80" height="4" rx="2" fill="currentColor" fillOpacity="0.9" />
                <rect x="72" y="8" width="112" height="2" rx="1" fill="currentColor" fillOpacity="0.55" />
                <line x1="60" y1="2" x2="40" y2="2" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" />
                <line x1="196" y1="2" x2="216" y2="2" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" />
                <line x1="40" y1="2" x2="40" y2="20" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
                <line x1="216" y1="2" x2="216" y2="20" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
              </svg>
            </div>

            {/* Logo with primary-colored halo */}
            <div className="relative mb-5 mt-2">
              <div
                className="absolute -inset-3 rounded-[28px] pointer-events-none"
                style={{ boxShadow: '0 0 60px 16px hsl(var(--primary) / 0.16)' }}
              />
              <img
                src="/khurk-logo.png"
                alt="KHURK OS"
                draggable={false}
                className="relative w-[88px] h-[88px] rounded-[22px] object-cover"
                style={{ boxShadow: '0 0 0 1.5px hsl(var(--primary) / 0.4), 0 12px 40px rgba(0,0,0,0.5)' }}
              />
            </div>

            <h1 className="text-[28px] font-black tracking-wide text-foreground mb-1.5" style={{ letterSpacing: '0.04em' }}>
              KHURK OS
            </h1>
            <p className="text-sm text-muted-foreground">Your apps, all in one place</p>
          </div>

          {/* ── Apps grid ── */}
          <div className="w-full max-w-5xl px-6 md:px-10 pb-12">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[10px] font-bold uppercase text-muted-foreground/60" style={{ letterSpacing: '0.2em' }}>
                {showAll ? 'All Apps' : `My Apps${hasAnyDismissed ? ` · ${visibleApps.length} of ${KHURK_APPS.length}` : ''}`}
              </p>
              {hasAnyDismissed && !showAll && (
                <button
                  onClick={() => restoreAll()}
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-primary/70 hover:text-primary transition-colors"
                  style={{ letterSpacing: '0.1em' }}
                >
                  <RotateCcw size={11} />
                  Restore all
                </button>
              )}
            </div>

            {displayedApps.length === 0 ? (
              /* Empty state — user has dismissed all apps */
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center">
                  <Grid2x2 size={28} className="text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground/60">All apps are hidden.</p>
                <button
                  onClick={() => restoreAll()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors"
                >
                  <RotateCcw size={14} />
                  Restore all apps
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {displayedApps.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    onDismiss={showAll ? undefined : () => dismissOne(app.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {displayedApps.map((app) => (
                  <AppListRow
                    key={app.id}
                    app={app}
                    onDismiss={showAll ? undefined : () => dismissOne(app.id)}
                  />
                ))}
              </div>
            )}

            {/* Show all / back to my apps toggle */}
            <div className="flex justify-center mt-8">
              {showAll ? (
                <button
                  onClick={() => setShowAll(false)}
                  className="flex items-center gap-2 px-5 py-2 rounded-full border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
                >
                  <EyeOff size={13} />
                  Back to my apps
                </button>
              ) : hasAnyDismissed ? (
                <button
                  onClick={() => setShowAll(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded-full border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
                >
                  <Grid2x2 size={13} />
                  Show all {KHURK_APPS.length} apps
                </button>
              ) : null}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="w-full flex items-center justify-center gap-2 py-5 mt-auto border-t border-border text-muted-foreground/40">
            <Sparkles size={12} />
            <span className="text-[11px]">2026 ® KHURK OS · Powered by HOLLR CHAT</span>
          </div>

        </div>
      </div>
    </div>
  );
}
