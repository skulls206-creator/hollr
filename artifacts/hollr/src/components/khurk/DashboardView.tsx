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
      className="group flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ background: '#0d0d11', boxShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
    >
      {/* Banner */}
      <div
        className="w-full relative overflow-hidden shrink-0"
        style={{
          height: '160px',
          background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        }}
      >
        {/* Radial highlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.06) 0%, transparent 60%), radial-gradient(circle at 75% 20%, rgba(255,255,255,0.05) 0%, transparent 50%)',
          }}
        />
        {/* Centered icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {app.imageSrc ? (
            <img
              src={app.imageSrc}
              alt={app.name}
              className="w-20 h-20 object-contain drop-shadow-2xl mix-blend-screen"
            />
          ) : (
            <HollrIcon size={60} />
          )}
        </div>
        {isTab && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <ExternalLink size={13} className="text-white/60" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 pt-3 pb-2 flex flex-col gap-1 flex-1">
        <p className="text-sm font-bold text-white leading-tight">{app.name}</p>
        <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {app.description}
        </p>
      </div>

      {/* Launch button */}
      <div className="px-4 pb-4 pt-1">
        <div
          className="w-full h-9 flex items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all duration-150 group-hover:brightness-125"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {isTab ? 'Open' : 'Launch'}
          <ExternalLink size={11} style={{ opacity: 0.6 }} />
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
    <div className="flex flex-col flex-1 min-h-0 h-full" style={{ background: '#07070a' }}>

      {/* Top bar */}
      <div
        className="flex items-center gap-1 px-4 shrink-0 border-b"
        style={{ height: '52px', background: '#0c0c10', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => { if (!sidebarLocked) onOpenSidebar?.(); }}
          className={cn('w-8 h-8 flex items-center justify-center rounded-lg transition-colors', sidebarLocked ? 'cursor-default' : 'hover:bg-white/5')}
          style={{ color: sidebarLocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)' }}
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
          <img
            src="/khurk-logo.png"
            alt="KHURK OS"
            className="w-6 h-6 rounded-md object-cover shrink-0"
            draggable={false}
          />
          <span className="text-sm font-bold tracking-tight text-white/80">
            KHURK OS
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center min-h-full">

          {/* ── Hero ── */}
          <div className="relative w-full flex flex-col items-center pt-12 pb-10 px-4 overflow-hidden">
            {/* Circuit glow backdrop */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(34,211,238,0.13) 0%, transparent 70%)',
              }}
            />
            {/* Circuit grid lines (decorative) */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(34,211,238,0.15) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(34,211,238,0.15) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 80%)',
              }}
            />
            {/* Horizontal circuit traces */}
            <div
              className="absolute top-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)' }}
            />

            {/* Logo */}
            <div className="relative mb-4">
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{ boxShadow: '0 0 48px 12px rgba(34,211,238,0.25)', borderRadius: '20px' }}
              />
              <img
                src="/khurk-logo.png"
                alt="KHURK OS"
                draggable={false}
                className="relative w-24 h-24 rounded-3xl object-cover"
                style={{ boxShadow: '0 0 0 1px rgba(34,211,238,0.35), 0 8px 32px rgba(0,0,0,0.6)' }}
              />
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white mb-1">
              KHURK OS
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Your apps, all in one place
            </p>
          </div>

          {/* ── Apps section ── */}
          <div className="w-full max-w-5xl px-6 md:px-10 pb-12">
            <p
              className="text-xs font-bold uppercase mb-5"
              style={{ letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)' }}
            >
              All Apps
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {KHURK_APPS.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="w-full flex items-center justify-center gap-2 py-5 mt-auto border-t"
            style={{ borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}
          >
            <Sparkles size={12} />
            <span className="text-xs">2026 ® KHURK OS · powered by Hollr Chat</span>
          </div>

        </div>
      </div>
    </div>
  );
}
