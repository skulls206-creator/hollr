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
      className="group flex flex-col rounded-xl overflow-hidden border border-border/20 bg-surface-1/80 hover:border-border/50 hover:bg-surface-2/80 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 text-left"
    >
      <div
        className="w-full h-14 flex items-center justify-center relative overflow-hidden shrink-0"
        style={{
          background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        }}
      >
        {app.imageSrc ? (
          <img
            src={app.imageSrc}
            alt={app.name}
            className="w-9 h-9 object-cover rounded-lg shadow-md"
          />
        ) : (
          <div className="w-9 h-9 flex items-center justify-center">
            <HollrIcon size={24} />
          </div>
        )}
        {isTab && (
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={10} className="text-white/70" />
          </div>
        )}
      </div>

      <div className="px-2.5 py-2 flex flex-col gap-0.5 flex-1">
        <p className="text-xs font-semibold text-foreground leading-tight truncate">{app.name}</p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">{app.tagline}</p>
      </div>

      <div className="px-2.5 pb-2">
        <div
          className="w-full h-6 flex items-center justify-center rounded-md text-[10px] font-semibold transition-all"
          style={{
            background: `linear-gradient(135deg, ${app.gradient[0]}cc 0%, ${app.gradient[1]}cc 100%)`,
            color: 'white',
          }}
        >
          {isTab ? 'Open' : 'Launch'}
          {isTab && <ExternalLink size={9} className="ml-1 opacity-70" />}
        </div>
      </div>
    </button>
  );
}

interface DashboardViewProps {
  onOpenMobileSidebar?: () => void;
}

export function DashboardView({ onOpenMobileSidebar }: DashboardViewProps) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto no-scrollbar"
      style={{
        background: 'var(--background)',
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(93,55,177,0.10) 0%, transparent 55%)',
      }}
    >
      {/* Mobile top bar — only shows on small screens; gives access to sidebar */}
      <div className="flex md:hidden items-center gap-3 px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={onOpenMobileSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shadow shrink-0"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={13} />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">KHURK OS</span>
        </div>
      </div>

      <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-3 pt-6 pb-12 md:pt-10 md:pb-16 md:px-4">

        {/* Header — hidden on mobile (replaced by top bar) */}
        <div className="hidden md:flex flex-col items-center gap-3 mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={30} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground tracking-tight">KHURK OS</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Your apps, all in one place</p>
          </div>
        </div>

        {/* Section divider */}
        <div className="w-full flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-border/30" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 shrink-0">
            All Apps
          </span>
          <div className="h-px flex-1 bg-border/30" />
        </div>

        {/* App grid — 3 cols on mobile, 4 on md+ */}
        <div className="w-full grid grid-cols-3 md:grid-cols-4 gap-2.5">
          {KHURK_APPS.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>

        <p className="mt-8 text-[11px] text-muted-foreground/40 text-center">
          KHURK ecosystem · powered by hollr.chat
        </p>
      </div>
    </div>
  );
}
