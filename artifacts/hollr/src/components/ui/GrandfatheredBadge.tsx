import { cn } from '@/lib/utils';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const SIZES = {
  sm: { w: 38, h: 16 },
  md: { w: 44, h: 18 },
  lg: { w: 54, h: 22 },
};

export function GrandfatheredBadge({ size = 'sm', className, title = 'Hollr Grandfathered — General Tier' }: Props) {
  const { w, h } = SIZES[size];
  const uid = `gfb-${size}`;

  const cx = w / 2;
  const cy = h / 2;
  const rx = cx - 1.5;
  const ry = cy - 1.5;

  const ds = size === 'sm' ? 5.5 : size === 'md' ? 6.2 : 7.5;
  const gap = size === 'sm' ? 11 : size === 'md' ? 12.5 : 15;

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
        <linearGradient id={`${uid}-oval`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="40%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>

        <linearGradient id={`${uid}-oval-inner`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e2535" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>

        <linearGradient id={`${uid}-gem`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#bae6fd" />
          <stop offset="65%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <filter id={`${uid}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={`${uid}-oval-glow`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer silver oval border */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={`url(#${uid}-oval)`}
        filter={`url(#${uid}-oval-glow)`}
      />

      {/* Inner dark fill */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx - 1.5}
        ry={ry - 1.5}
        fill={`url(#${uid}-oval-inner)`}
      />

      {/* Three diamonds */}
      {diamonds.map((dx, i) => (
        <g key={i} filter={`url(#${uid}-glow)`}>
          {/* Outer glow halo */}
          <polygon
            points={`${dx},${cy - ds * 0.95} ${dx + ds * 0.95},${cy} ${dx},${cy + ds * 0.95} ${dx - ds * 0.95},${cy}`}
            fill="#22d3ee"
            opacity="0.25"
          />
          {/* Main body */}
          <polygon
            points={`${dx},${cy - ds * 0.82} ${dx + ds * 0.82},${cy} ${dx},${cy + ds * 0.82} ${dx - ds * 0.82},${cy}`}
            fill={`url(#${uid}-gem)`}
          />
          {/* Upper-left facet */}
          <polygon
            points={`${dx},${cy - ds * 0.82} ${dx - ds * 0.82},${cy} ${dx - ds * 0.25},${cy} ${dx},${cy - ds * 0.38}`}
            fill="white"
            opacity="0.42"
          />
          {/* Upper-right facet */}
          <polygon
            points={`${dx},${cy - ds * 0.82} ${dx + ds * 0.82},${cy} ${dx + ds * 0.25},${cy} ${dx},${cy - ds * 0.38}`}
            fill="white"
            opacity="0.1"
          />
          {/* Crown table highlight */}
          <polygon
            points={`${dx},${cy - ds * 0.6} ${dx + ds * 0.28},${cy - ds * 0.1} ${dx},${cy + ds * 0.05} ${dx - ds * 0.28},${cy - ds * 0.1}`}
            fill="white"
            opacity="0.52"
          />
        </g>
      ))}
    </svg>
  );
}
