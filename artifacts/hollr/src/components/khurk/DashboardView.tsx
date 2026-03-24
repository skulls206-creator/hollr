import { useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';
import { ExternalLink, Menu, MonitorPlay } from 'lucide-react';
import { useContextMenu } from '@/contexts/ContextMenuContext';

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
      className="group flex flex-col rounded-xl overflow-hidden text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Gradient thumbnail */}
      <div
        className="w-full flex items-center justify-center relative overflow-hidden shrink-0"
        style={{
          height: '130px',
          background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        }}
      >
        {app.imageSrc ? (
          <img
            src={app.imageSrc}
            alt={app.name}
            className="w-12 h-12 object-contain drop-shadow-lg"
          />
        ) : (
          <HollrIcon size={40} />
        )}
        {isTab && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={12} className="text-white/70" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 pt-3 pb-2 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-white leading-tight">{app.name}</p>
        <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {app.description}
        </p>
      </div>

      {/* Launch button */}
      <div className="px-3 pb-3">
        <div
          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors group-hover:bg-white/10"
          style={{ background: '#252525', color: 'rgba(255,255,255,0.7)' }}
        >
          {isTab ? 'Open' : 'Launch'}
          <ExternalLink size={10} className="opacity-50" />
        </div>
      </div>
    </button>
  );
}

interface DashboardViewProps {
  onOpenSidebar?: () => void;
}

export function DashboardView({ onOpenSidebar }: DashboardViewProps) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full"
      style={{ background: '#111111' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: '52px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={onOpenSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.45)' }}
          title="Open sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={11} />
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.85)' }}>
            KHURK OS
          </span>
        </div>
      </div>

      {/* Scrollable content — vertically centered on large screens */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center justify-center min-h-full py-8 px-4 md:px-10">

          {/* Header */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)',
                boxShadow: '0 0 32px rgba(91,33,182,0.4)',
              }}
            >
              <HollrIcon size={32} />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
                KHURK OS
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Your apps, all in one place
              </p>
            </div>
          </div>

          {/* Section label */}
          <p
            className="w-full max-w-5xl text-xs font-bold uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}
          >
            All Apps
          </p>

          {/* Grid — full width up to a generous max, 2 cols mobile / 4 desktop */}
          <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {KHURK_APPS.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>

          <p className="mt-10 text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>
            KHURK ecosystem · powered by hollr.chat
          </p>
        </div>
      </div>
    </div>
  );
}
