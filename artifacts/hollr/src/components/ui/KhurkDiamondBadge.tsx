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
        <radialGradient id="kdb-fill" cx="50%" cy="25%" r="75%" fx="50%" fy="10%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#7dd3fc" stopOpacity="1" />
          <stop offset="70%" stopColor="#22d3ee" stopOpacity="1" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="1" />
        </radialGradient>

        <filter id="kdb-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="kdb-outer-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow halo (cyan) */}
      <polygon
        points="10,1 19,18 1,18"
        fill="#22d3ee"
        opacity="0.25"
        filter="url(#kdb-outer-glow)"
      />

      {/* Main triangle with radial gradient */}
      <polygon
        points="10,2 18.5,17.5 1.5,17.5"
        fill="url(#kdb-fill)"
        filter="url(#kdb-glow)"
      />

      {/* Inner bright highlight at the tip */}
      <polygon
        points="10,3 12.5,7.5 7.5,7.5"
        fill="white"
        opacity="0.6"
      />
    </svg>
  );
}
