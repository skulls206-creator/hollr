import { cn } from '@/lib/utils';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const SIZES = {
  sm: { w: 36, h: 14, ds: 4.2, gap: 9 },
  md: { w: 42, h: 16, ds: 4.8, gap: 10.5 },
  lg: { w: 52, h: 20, ds: 6.0, gap: 13 },
};

export function GrandfatheredBadge({ size = 'sm', className, title = 'Hollr Grandfathered — General Tier' }: Props) {
  const { w, h, ds, gap } = SIZES[size];
  const uid = `gfb-${size}`;
  const r = h / 2;
  const cx = w / 2;
  const cy = h / 2;

  const diamonds = [cx - gap, cx, cx + gap];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block shrink-0 grandfathered-badge', className)}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <linearGradient id={`${uid}-border`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>

        <linearGradient id={`${uid}-gem`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#bae6fd" />
          <stop offset="65%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.9" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pill border */}
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx={r} fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-border)`} strokeWidth="0.8" />

      {/* Three diamonds */}
      {diamonds.map((dx, i) => (
        <g key={i} filter={`url(#${uid}-glow)`}>
          <polygon
            points={`${dx},${cy - ds} ${dx + ds},${cy} ${dx},${cy + ds} ${dx - ds},${cy}`}
            fill={`url(#${uid}-gem)`}
          />
          <polygon
            points={`${dx},${cy - ds} ${dx - ds},${cy} ${dx - ds * 0.3},${cy} ${dx},${cy - ds * 0.45}`}
            fill="white"
            opacity="0.45"
          />
          <polygon
            points={`${dx},${cy - ds * 0.65} ${dx + ds * 0.3},${cy - ds * 0.1} ${dx},${cy + ds * 0.05} ${dx - ds * 0.3},${cy - ds * 0.1}`}
            fill="white"
            opacity="0.5"
          />
        </g>
      ))}
    </svg>
  );
}
