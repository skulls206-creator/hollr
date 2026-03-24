import { useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';
import { ExternalLink, Menu, MonitorPlay, Pin, PinOff, Sparkles } from 'lucide-react';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { cn } from '@/lib/utils';

function AppCard({ app }: { app: KhurkApp }) {
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
      ],
    });
  }, [app, isTab, showMenu, handleLaunch]);

  return (
    <button
      onClick={handleLaunch}
      onContextMenu={handleContextMenu}
      className="group flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-200 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-card"
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
        <p className="text-[13px] font-bold text-foreground leading-tight">{app.name}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{app.description}</p>
      </div>

      {/* ── Launch button ── */}
      <div className="px-4 pb-4 pt-1">
        <div className="w-full h-9 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border/50 transition-all duration-150">
          {isTab ? 'Open' : 'Launch'}
          <ExternalLink size={11} className="opacity-40" />
        </div>
      </div>
    </button>
  );
}

interface DashboardViewProps {
  onOpenSidebar?: () => void;
}

export function DashboardView({ onOpenSidebar }: DashboardViewProps) {
  const { sidebarLocked, setSidebarLocked, layoutMode, setClassicChannelOpen } = useAppStore();

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
            <p className="text-[10px] font-bold uppercase mb-5 text-muted-foreground/60" style={{ letterSpacing: '0.2em' }}>
              All Apps
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {KHURK_APPS.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="w-full flex items-center justify-center gap-2 py-5 mt-auto border-t border-border text-muted-foreground/40">
            <Sparkles size={12} />
            <span className="text-[11px]">2026 ® KHURK OS · powered by Hollr Chat</span>
          </div>

        </div>
      </div>
    </div>
  );
}
