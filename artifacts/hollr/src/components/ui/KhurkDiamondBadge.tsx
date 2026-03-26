import { cn } from '@/lib/utils';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const SIZES = {
  sm: 14,
  md: 16,
  lg: 20,
};

export function KhurkDiamondBadge({ size = 'sm', className, title = 'hollr Supporter' }: Props) {
  const px = SIZES[size];
  const uid = `kdb-${size}`;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block shrink-0 supporter-badge', className)}
      aria-label={title}
      role="img"
    >
      <defs>
        <linearGradient id={`${uid}-grad`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#bae6fd" />
          <stop offset="65%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow halo */}
      <polygon
        points="10,1 19,10 10,19 1,10"
        fill="#22d3ee"
        opacity="0.3"
        filter={`url(#${uid}-glow)`}
      />

      {/* Main diamond body */}
      <polygon
        points="10,2 18,10 10,18 2,10"
        fill={`url(#${uid}-grad)`}
      />

      {/* Upper-left facet — brighter */}
      <polygon
        points="10,2 2,10 8,10 10,4.5"
        fill="white"
        opacity="0.45"
      />

      {/* Upper-right facet — medium */}
      <polygon
        points="10,2 18,10 12,10 10,4.5"
        fill="white"
        opacity="0.12"
      />

      {/* Crown table highlight */}
      <polygon
        points="10,3.5 13,7.5 10,9 7,7.5"
        fill="white"
        opacity="0.55"
      />
    </svg>
  );
}
