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
      className="group flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-200 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        background: '#111116',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {/* ── Cinematic banner ── */}
      <div
        className="w-full relative overflow-hidden shrink-0"
        style={{
          height: '170px',
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

        {/* Dark vignette overlay — keeps icon readable + cinematic feel */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)',
          }}
        />

        {/* App icon centered on top of banner */}
        <div className="absolute inset-0 flex items-center justify-center">
          {app.imageSrc ? (
            <img
              src={app.imageSrc}
              alt={app.name}
              className="w-[72px] h-[72px] object-contain drop-shadow-2xl mix-blend-screen"
              style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.8))' }}
            />
          ) : (
            <HollrIcon size={60} />
          )}
        </div>

        {/* External link badge */}
        {isTab && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <ExternalLink size={13} className="text-white/70" />
          </div>
        )}

        {/* Subtle hover shine sweep */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* ── Info body ── */}
      <div className="px-4 pt-3 pb-2 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-bold text-white leading-tight">{app.name}</p>
        <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {app.description}
        </p>
      </div>

      {/* ── Launch button ── */}
      <div className="px-4 pb-4 pt-1">
        <div
          className="w-full h-9 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all duration-150"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {isTab ? 'Open' : 'Launch'}
          <ExternalLink size={11} style={{ opacity: 0.5 }} />
        </div>
      </div>
    </button>
  );
}

interface DashboardViewProps {
  onOpenSidebar?: () => void;
}

export function DashboardView({ onOpenSidebar }: DashboardViewProps) {
  const { sidebarLocked, setSidebarLocked, layoutMode, setClassicChannelOpen, setMobileSidebarOpen } = useAppStore();

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full" style={{ background: '#06060a' }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-1 px-4 shrink-0 border-b"
        style={{ height: '52px', background: '#0c0c10', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => { if (!sidebarLocked) onOpenSidebar?.(); }}
          className={cn('w-8 h-8 flex items-center justify-center rounded-lg transition-colors', !sidebarLocked && 'hover:bg-white/5')}
          style={{ color: sidebarLocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)', cursor: sidebarLocked ? 'default' : 'pointer' }}
          title={sidebarLocked ? 'Sidebar is pinned' : 'Open sidebar'}
        >
          <Menu size={18} />
        </button>
        <button
          onClick={() => { const next = !sidebarLocked; setSidebarLocked(next); if (next) { if (layoutMode === 'classic') setClassicChannelOpen(true); else { onOpenSidebar?.(); setMobileSidebarOpen(true); } } }}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
          style={{ color: sidebarLocked ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.2)' }}
          title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
        >
          {sidebarLocked ? <Pin size={13} /> : <PinOff size={13} />}
        </button>
        <div className="flex items-center gap-2 ml-1">
          <img src="/khurk-logo.png" alt="KHURK OS" className="w-6 h-6 rounded-md object-cover shrink-0" draggable={false} />
          <span className="text-sm font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.8)' }}>KHURK OS</span>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center min-h-full">

          {/* ── Hero ── */}
          <div className="relative w-full flex flex-col items-center pt-12 pb-10 px-4 overflow-hidden">
            {/* Cyan circuit glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(34,211,238,0.14) 0%, transparent 70%)',
              }}
            />
            {/* Circuit grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(34,211,238,0.12) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px)
                `,
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse 80% 65% at 50% 0%, black 0%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 65% at 50% 0%, black 0%, transparent 80%)',
                opacity: 0.4,
              }}
            />
            {/* Processor chip silhouette (decorative SVG lines at top) */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-64 pointer-events-none"
              style={{ opacity: 0.25 }}
            >
              <svg width="256" height="40" viewBox="0 0 256 40" fill="none">
                <rect x="88" y="0" width="80" height="4" rx="2" fill="rgba(34,211,238,0.8)" />
                <rect x="72" y="8" width="112" height="2" rx="1" fill="rgba(34,211,238,0.5)" />
                <line x1="60" y1="2" x2="40" y2="2" stroke="rgba(34,211,238,0.6)" strokeWidth="2" />
                <line x1="196" y1="2" x2="216" y2="2" stroke="rgba(34,211,238,0.6)" strokeWidth="2" />
                <line x1="40" y1="2" x2="40" y2="20" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
                <line x1="216" y1="2" x2="216" y2="20" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
              </svg>
            </div>

            {/* Logo with halo */}
            <div className="relative mb-5 mt-2">
              <div
                className="absolute -inset-3 rounded-[28px] pointer-events-none"
                style={{ boxShadow: '0 0 60px 16px rgba(34,211,238,0.18)' }}
              />
              <img
                src="/khurk-logo.png"
                alt="KHURK OS"
                draggable={false}
                className="relative w-[88px] h-[88px] rounded-[22px] object-cover"
                style={{ boxShadow: '0 0 0 1.5px rgba(34,211,238,0.45), 0 12px 40px rgba(0,0,0,0.7)' }}
              />
            </div>

            <h1 className="text-[28px] font-black tracking-wide text-white mb-1.5" style={{ letterSpacing: '0.04em' }}>
              KHURK OS
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Your apps, all in one place
            </p>
          </div>

          {/* ── Apps section ── */}
          <div className="w-full max-w-5xl px-6 md:px-10 pb-12">
            <p
              className="text-[10px] font-bold uppercase mb-5"
              style={{ letterSpacing: '0.2em', color: 'rgba(255,255,255,0.28)' }}
            >
              All Apps
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {KHURK_APPS.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            className="w-full flex items-center justify-center gap-2 py-5 mt-auto border-t"
            style={{ borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.18)' }}
          >
            <Sparkles size={12} />
            <span className="text-[11px]">2026 ® KHURK OS · powered by Hollr Chat</span>
          </div>

        </div>
      </div>
    </div>
  );
}
