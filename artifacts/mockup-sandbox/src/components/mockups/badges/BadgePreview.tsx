function KhurkDiamondBadge({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 14 : size === 'md' ? 16 : 20;
  const uid = `kdb-${size}`;
  return (
    <svg width={px} height={px} viewBox="0 0 20 20" fill="none" aria-label="HOLLR Supporter" role="img">
      <defs>
        <linearGradient id={`${uid}-grad`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#bae6fd" />
          <stop offset="65%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <polygon points="10,1 19,10 10,19 1,10" fill="#22d3ee" opacity="0.3" filter={`url(#${uid}-glow)`} />
      <polygon points="10,2 18,10 10,18 2,10" fill={`url(#${uid}-grad)`} />
      <polygon points="10,2 2,10 8,10 10,4.5" fill="white" opacity="0.45" />
      <polygon points="10,2 18,10 12,10 10,4.5" fill="white" opacity="0.12" />
      <polygon points="10,3.5 13,7.5 10,9 7,7.5" fill="white" opacity="0.55" />
    </svg>
  );
}

function GrandfatheredBadge({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const SIZES = {
    sm: { w: 36, h: 14, ds: 4.2, gap: 9 },
    md: { w: 42, h: 16, ds: 4.8, gap: 10.5 },
    lg: { w: 52, h: 20, ds: 6.0, gap: 13 },
  };
  const { w, h, ds, gap } = SIZES[size];
  const uid = `gfb-${size}`;
  const r = h / 2;
  const cx = w / 2;
  const cy = h / 2;
  const diamonds = [cx - gap, cx, cx + gap];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-label="Grandfathered — General Tier" role="img">
      <title>Hollr Grandfathered — General Tier</title>
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" /><stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={`${uid}-border`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94a3b8" /><stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id={`${uid}-gem`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="30%" stopColor="#bae6fd" />
          <stop offset="65%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.9" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx={r} fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-border)`} strokeWidth="0.8" />
      {diamonds.map((dx, i) => (
        <g key={i} filter={`url(#${uid}-glow)`}>
          <polygon points={`${dx},${cy - ds} ${dx + ds},${cy} ${dx},${cy + ds} ${dx - ds},${cy}`} fill={`url(#${uid}-gem)`} />
          <polygon points={`${dx},${cy - ds} ${dx - ds},${cy} ${dx - ds * 0.3},${cy} ${dx},${cy - ds * 0.45}`} fill="white" opacity="0.45" />
          <polygon points={`${dx},${cy - ds * 0.65} ${dx + ds * 0.3},${cy - ds * 0.1} ${dx},${cy + ds * 0.05} ${dx - ds * 0.3},${cy - ds * 0.1}`} fill="white" opacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

export function BadgePreview() {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-10">
      <div className="flex flex-col gap-8 bg-[#1e293b] rounded-2xl p-8 border border-slate-700/50 shadow-2xl min-w-[400px]">
        <h2 className="text-slate-200 text-sm font-semibold tracking-widest uppercase">Badge Comparison</h2>

        {/* Supporter (single diamond) */}
        <div className="flex flex-col gap-3">
          <p className="text-slate-500 text-xs font-medium">Supporter — 1 diamond</p>
          <Row label="sm (14px)"><KhurkDiamondBadge size="sm" /></Row>
          <Row label="md (16px)"><KhurkDiamondBadge size="md" /></Row>
          <Row label="lg (20px)"><KhurkDiamondBadge size="lg" /></Row>
        </div>

        <div className="border-t border-slate-700" />

        {/* Grandfathered (3 diamonds pill) */}
        <div className="flex flex-col gap-3">
          <p className="text-slate-500 text-xs font-medium">Grandfathered — 3 diamond pill</p>
          <Row label="sm (36×14)"><GrandfatheredBadge size="sm" /></Row>
          <Row label="md (42×16)"><GrandfatheredBadge size="md" /></Row>
          <Row label="lg (52×20)"><GrandfatheredBadge size="lg" /></Row>
        </div>

        <div className="border-t border-slate-700" />

        {/* In-context mockup */}
        <div className="flex flex-col gap-3">
          <p className="text-slate-500 text-xs font-medium">In context (DM list style)</p>
          <div className="flex items-center gap-2.5 bg-[#0f172a] rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">S</div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-200 text-sm font-semibold">skulls</span>
                <KhurkDiamondBadge size="sm" />
              </div>
              <span className="text-slate-500 text-xs truncate">Hey what's up</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-[#0f172a] rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">T</div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-200 text-sm font-semibold">Test Badge</span>
                <GrandfatheredBadge size="sm" />
              </div>
              <span className="text-slate-500 text-xs truncate">Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
