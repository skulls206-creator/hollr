import uStreamImg from '@assets/download_(1)_1774290216897.png';
import playdImg from '@assets/5957_1774286181393.png';
import foldrImg from '@assets/5996_1774290216887.png';
import instaGhostImg from '@assets/5952_1774286181402.png';
import gaslessImg from '@assets/5963_1774286181380.png';
import ballpointImg from '@assets/5955_1774286181397.png';
import onlyGamesImg from '@assets/5961_1774286181406.png';
import onlyXmrImg from '@assets/5959_1774286181386.png';

export interface KhurkApp {
  id: string;
  name: string;
  tagline: string;
  url: string;
  imageSrc?: string;
  /** 'cover' fills the icon (default); 'contain' shows the whole image with gradient bg */
  iconFit?: 'cover' | 'contain';
  gradient: [string, string];
}

// Hollr icon — rendered inline so it matches the brand
export function HollrIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none">
      <path
        d="M13 3C7.48 3 3 7.03 3 12c0 2.37 1 4.52 2.64 6.1L4.5 22l4.36-1.38C10.14 21.5 11.54 22 13 22c5.52 0 10-4.03 10-9S18.52 3 13 3z"
        fill="white"
        fillOpacity="0.95"
      />
      <path
        d="M8.5 12h9M8.5 9h5.5"
        stroke="rgba(99,91,255,1)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const KHURK_APPS: KhurkApp[] = [
  {
    id: 'ustream',
    name: 'uStream',
    tagline: 'Movies & TV',
    url: 'https://ustream.khurk.services',
    imageSrc: uStreamImg,
    gradient: ['#1a1a6e', '#3a3abf'],
  },
  {
    id: 'playd',
    name: 'Playd Music',
    tagline: 'Local Music Player',
    url: 'https://playd.khurk.services',
    imageSrc: playdImg,
    gradient: ['#1a0800', '#7a2c00'],
  },
  {
    id: 'foldr',
    name: 'foldr.storage',
    tagline: 'Encrypted IPFS Storage',
    url: 'https://foldr.khurk.services',
    imageSrc: foldrImg,
    gradient: ['#0d1b6e', '#3b4fcf'],
  },
  {
    id: 'instaghost',
    name: 'InstaGhost',
    tagline: 'Crypto Exchange',
    url: 'https://instaghost.khurk.services',
    imageSrc: instaGhostImg,
    gradient: ['#00544a', '#00bfa0'],
  },
  {
    id: 'gasless',
    name: 'Gasless',
    tagline: 'USDT Web Wallet',
    url: 'https://gasless.khurk.services',
    imageSrc: onlyXmrImg,
    gradient: ['#003a3a', '#007070'],
  },
  {
    id: 'ballpoint',
    name: 'Ballpoint.one',
    tagline: 'Private Notes',
    url: 'https://ballpoint.one',
    imageSrc: gaslessImg,
    gradient: ['#2a006e', '#7b2fff'],
  },
  {
    id: 'onlygames',
    name: 'OnlyGames',
    tagline: 'Game Search',
    url: 'https://onlygames.khurk.services',
    imageSrc: onlyGamesImg,
    gradient: ['#1a0050', '#6b00c8'],
  },
  {
    id: 'onlyxmr',
    name: 'OnlyXMR',
    tagline: 'Private Creator Platform',
    url: 'https://onlyxmr.khurk.services',
    imageSrc: ballpointImg,
    gradient: ['#5a1a00', '#c04a00'],
  },
];

export const ALL_KHURK_APP_IDS = KHURK_APPS.map((a) => a.id);
