import uStreamImg from '@assets/download_(1)_1774290216897.png';
import playdImg from '@assets/5957_1774286181393.png';
import foldrImg from '@assets/5996_1774290216887.png';
import instaGhostImg from '@assets/5952_1774286181402.png';
import gaslessImg from '@assets/5963_1774286181380.png';
import ballpointImg from '@assets/5955_1774286181397.png';
import onlyGamesImg from '@assets/5961_1774286181406.png';
import onlyXmrImg from '@assets/5959_1774286181386.png';

import uStreamBanner from '@assets/generated_images/banner_ustream.png';
import playdBanner from '@assets/generated_images/banner_playd.png';
import foldrBanner from '@assets/generated_images/banner_foldr.png';
import instaGhostBanner from '@assets/generated_images/banner_instaghost.png';
import gaslessBanner from '@assets/generated_images/banner_gasless.png';
import ballpointBanner from '@assets/generated_images/banner_ballpoint.png';
import onlyGamesBanner from '@assets/generated_images/banner_onlygames.png';
import onlyXmrBanner from '@assets/generated_images/banner_onlyxmr.png';

export interface KhurkApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  imageSrc?: string;
  bannerSrc?: string;
  iconFit?: 'cover' | 'contain';
  gradient: [string, string];
  openMode?: 'iframe' | 'tab';
}

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
    description: 'High-definition streaming of movies and television series.',
    url: 'https://ustream.khurk.services',
    imageSrc: uStreamImg,
    bannerSrc: uStreamBanner,
    gradient: ['#1a1f8f', '#4a54d4'],
  },
  {
    id: 'playd',
    name: 'Playd Music',
    tagline: 'Local Music Player',
    description: 'Your local high-fidelity music library, organized perfectly.',
    url: 'https://playd.khurk.services',
    imageSrc: playdImg,
    bannerSrc: playdBanner,
    gradient: ['#c0340a', '#f07020'],
  },
  {
    id: 'foldr',
    name: 'Foldr Storage',
    tagline: 'Encrypted IPFS Storage',
    description: 'Encrypted IPFS storage solution for your sensitive data.',
    url: 'https://foldr.khurk.services',
    imageSrc: foldrImg,
    bannerSrc: foldrBanner,
    gradient: ['#0a5a9c', '#2ea8e0'],
  },
  {
    id: 'instaghost',
    name: 'InstaGhost Exchange',
    tagline: 'Crypto Exchange',
    description: 'Anonymous and lightning-fast cryptocurrency exchange.',
    url: 'https://instaghost.khurk.services',
    imageSrc: instaGhostImg,
    bannerSrc: instaGhostBanner,
    gradient: ['#006b4a', '#00c47a'],
  },
  {
    id: 'gasless',
    name: 'Gasless Wallet',
    tagline: 'USDT Web Wallet',
    description: 'USDT Web Wallet with zero network fee transactions.',
    url: 'https://gasless.khurk.services',
    imageSrc: onlyXmrImg,
    bannerSrc: gaslessBanner,
    gradient: ['#007a5a', '#00d4a0'],
  },
  {
    id: 'ballpoint',
    name: 'Ballpoint Notes',
    tagline: 'Private Notes',
    description: 'Private, end-to-end encrypted notes and journaling.',
    url: 'https://ballpoint.khurk.services',
    imageSrc: gaslessImg,
    bannerSrc: ballpointBanner,
    gradient: ['#5a10c0', '#a040f0'],
  },
  {
    id: 'onlygames',
    name: 'OnlyGames',
    tagline: 'Game Search',
    description: 'Search and discover the best indie and AAA titles.',
    url: 'https://onlygames.khurk.services',
    imageSrc: onlyGamesImg,
    bannerSrc: onlyGamesBanner,
    gradient: ['#1a1a2e', '#4a4a8a'],
  },
  {
    id: 'onlyxmr',
    name: 'OnlyXMR',
    tagline: 'Private Creator Platform',
    description: 'The private creator platform powered by Monero.',
    url: 'https://onlyxmr.khurk.services',
    imageSrc: ballpointImg,
    bannerSrc: onlyXmrBanner,
    gradient: ['#8a2a00', '#e05010'],
  },
];

export const ALL_KHURK_APP_IDS = KHURK_APPS.map((a) => a.id);
