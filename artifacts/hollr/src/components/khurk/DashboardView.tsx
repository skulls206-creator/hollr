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
      className="group flex flex-col rounded-xl overflow-hidden text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-surface-0 border border-border"
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
            className="w-20 h-20 object-contain drop-shadow-xl mix-blend-screen"
          />
        ) : (
          <HollrIcon size={64} />
        )}
        {isTab && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={12} className="text-white/70" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 pt-3 pb-2 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">{app.name}</p>
        <p className="text-xs leading-snug text-muted-foreground">
          {app.description}
        </p>
      </div>

      {/* Launch button */}
      <div className="px-3 pb-3">
        <div className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors bg-secondary text-secondary-foreground group-hover:bg-secondary/70">
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
    <div className="flex flex-col flex-1 min-h-0 h-full bg-surface-2">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 shrink-0 bg-surface-1 border-b border-border"
        style={{ height: '52px' }}
      >
        <button
          onClick={onOpenSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          title="Open sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <img
            src="/khurk-logo.png"
            alt="KHURK OS"
            className="w-6 h-6 rounded-md object-cover shrink-0"
            draggable={false}
          />
          <span className="text-sm font-bold tracking-tight text-foreground">
            KHURK OS
          </span>
        </div>
      </div>

      {/* Scrollable content — vertically centered on large screens */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center justify-center min-h-full py-8 px-4 md:px-10">

          {/* Header */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <img
              src="/khurk-logo.png"
              alt="KHURK OS"
              draggable={false}
              className="w-20 h-20 rounded-2xl object-cover shadow-lg"
              style={{ boxShadow: '0 0 32px rgba(34,211,238,0.35)' }}
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                KHURK OS
              </h1>
              <p className="text-sm mt-0.5 text-muted-foreground">
                Your apps, all in one place
              </p>
            </div>
          </div>

          {/* Section label */}
          <p
            className="w-full max-w-5xl text-xs font-bold uppercase mb-4 text-muted-foreground/60"
            style={{ letterSpacing: '0.15em' }}
          >
            All Apps
          </p>

          {/* Grid — full width up to a generous max, 2 cols mobile / 4 desktop */}
          <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {KHURK_APPS.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>

          <p className="mt-10 text-xs text-muted-foreground/40">
            2026 ® KHURK OS · powered by Hollr Chat
          </p>
        </div>
      </div>
    </div>
  );
}
