import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';
import { ExternalLink } from 'lucide-react';

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
      className="group flex flex-col rounded-2xl overflow-hidden border border-border/20 bg-surface-1 hover:border-border/50 hover:bg-surface-2 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 text-left"
    >
      {/* Icon banner */}
      <div
        className="w-full h-20 flex items-center justify-center relative overflow-hidden shrink-0"
        style={{
          background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        }}
      >
        {app.imageSrc ? (
          <img
            src={app.imageSrc}
            alt={app.name}
            className="w-12 h-12 object-cover rounded-xl shadow-md"
          />
        ) : (
          <div className="w-12 h-12 flex items-center justify-center">
            <HollrIcon size={32} />
          </div>
        )}
        {isTab && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={12} className="text-white/70" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5 flex flex-col gap-0.5 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight truncate">{app.name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight truncate">{app.tagline}</p>
      </div>

      {/* Launch bar */}
      <div className="px-3 pb-2.5">
        <div
          className="w-full h-7 flex items-center justify-center rounded-lg text-[11px] font-semibold transition-all"
          style={{
            background: `linear-gradient(135deg, ${app.gradient[0]}cc 0%, ${app.gradient[1]}cc 100%)`,
            color: 'white',
          }}
        >
          {isTab ? 'Open' : 'Launch'}
          {isTab && <ExternalLink size={10} className="ml-1 opacity-70" />}
        </div>
      </div>
    </button>
  );
}

export function DashboardView() {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto bg-background no-scrollbar">
      <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 pt-10 pb-16">

        {/* ── KHURK OS header ── */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={34} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">KHURK OS</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your apps, all in one place
            </p>
          </div>
        </div>

        {/* ── Section label ── */}
        <div className="w-full flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-border/30" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 shrink-0">
            All Apps
          </span>
          <div className="h-px flex-1 bg-border/30" />
        </div>

        {/* ── App grid ── */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {KHURK_APPS.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>

        {/* ── Footer ── */}
        <p className="mt-10 text-[11px] text-muted-foreground/40 text-center">
          KHURK ecosystem · powered by hollr.chat
        </p>
      </div>
    </div>
  );
}
