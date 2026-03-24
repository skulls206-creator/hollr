import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';
import { ExternalLink, Menu } from 'lucide-react';

function AppCard({ app }: { app: KhurkApp }) {
  const { setActiveKhurkAppId } = useAppStore();

  const handleLaunch = () => {
    if (app.openMode === 'tab') {
      window.open(app.url, '_blank', 'noopener');
    } else {
      setActiveKhurkAppId(app.id);
    }
  };

  const isTab = app.openMode === 'tab';

  return (
    <button
      onClick={handleLaunch}
      className="group flex flex-col rounded-xl overflow-hidden text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Gradient thumbnail */}
      <div
        className="w-full flex items-center justify-center relative overflow-hidden shrink-0"
        style={{
          height: '120px',
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
        <p className="text-sm font-semibold text-white leading-tight truncate">{app.name}</p>
        <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.45)', minHeight: '2.5rem' }}>
          {app.description}
        </p>
      </div>

      {/* Launch button */}
      <div className="px-3 pb-3">
        <div
          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: '#2a2a2a', color: 'rgba(255,255,255,0.75)' }}
        >
          {isTab ? 'Open' : 'Launch'}
          <ExternalLink size={10} className="opacity-60" />
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
      className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto no-scrollbar"
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
          style={{ color: 'rgba(255,255,255,0.5)' }}
          title="Open sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={13} />
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
            KHURK OS
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-6 md:px-8 md:py-8">
        {/* Section label */}
        <p
          className="text-xs font-bold uppercase tracking-widest mb-5"
          style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' }}
        >
          All Apps
        </p>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {KHURK_APPS.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>

        <p className="mt-10 text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          KHURK ecosystem · powered by hollr.chat
        </p>
      </div>
    </div>
  );
}
