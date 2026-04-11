import type { ImageSourcePropType } from "react-native";

export interface KhurkApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  gradient: [string, string];
  initials: string;
  icon: ImageSourcePropType;
  pwa: boolean;
}

export const KHURK_APPS: KhurkApp[] = [
  {
    id: 'playd',
    name: 'PLAYD',
    tagline: 'Local Music Player',
    description: 'Your local high-fidelity music library, organized perfectly.',
    url: 'https://playd.khurk.xyz',
    gradient: ['#c0340a', '#f07020'],
    initials: 'PL',
    icon: require('@/assets/images/khurk/playd.png'),
    pwa: true,
  },
  {
    id: 'foldr',
    name: 'FOLDR',
    tagline: 'File Browser',
    description: 'Browse, manage, and preview your local files directly in-app.',
    url: 'https://foldr.khurk.xyz',
    gradient: ['#0a5a9c', '#2ea8e0'],
    initials: 'FL',
    icon: require('@/assets/images/khurk/foldr.png'),
    pwa: true,
  },
  {
    id: 'rippd',
    name: 'RIPPD',
    tagline: 'MP3 Ripper',
    description: 'Rip MP3s from YouTube and SoundCloud links instantly.',
    url: 'https://rippd.khurk.xyz',
    gradient: ['#7e1d8f', '#0891b2'],
    initials: 'RP',
    icon: require('@/assets/images/khurk/rippd.png'),
    pwa: true,
  },
  {
    id: 'ghostd',
    name: 'GHOSTD',
    tagline: 'Crypto Exchange',
    description: 'Anonymous and lightning-fast cryptocurrency exchange.',
    url: 'https://ghostd.khurk.xyz',
    gradient: ['#006b4a', '#00c47a'],
    initials: 'GH',
    icon: require('@/assets/images/khurk/ghostd.png'),
    pwa: true,
  },
  {
    id: 'gasless',
    name: 'Gasless Wallet',
    tagline: 'USDT Web Wallet',
    description: 'USDT Web Wallet with zero network fee transactions.',
    url: 'https://gasless.khurk.xyz',
    gradient: ['#007a5a', '#00d4a0'],
    initials: 'GW',
    icon: require('@/assets/images/khurk/gasless.png'),
    pwa: true,
  },
  {
    id: 'ballpoint',
    name: 'Ballpoint Notes',
    tagline: 'Private Notes',
    description: 'Private, local Markdown notes stored as plain files on your device.',
    url: 'https://ballpoint.khurk.xyz',
    gradient: ['#5a10c0', '#a040f0'],
    initials: 'BP',
    icon: require('@/assets/images/khurk/ballpoint.png'),
    pwa: true,
  },
  {
    id: 'onlygames',
    name: 'OnlyGames',
    tagline: 'Game Search',
    description: 'Search and discover the best indie and AAA titles.',
    url: 'https://games.khurk.xyz',
    gradient: ['#1a1a2e', '#4a4a8a'],
    initials: 'OG',
    icon: require('@/assets/images/khurk/onlygames.png'),
    pwa: true,
  },
  {
    id: 'onlyxmr',
    name: 'OnlyXMR',
    tagline: 'Private Creator Platform',
    description: 'The private creator platform powered by Monero.',
    url: 'https://xmr.khurk.xyz',
    gradient: ['#8a2a00', '#e05010'],
    initials: 'XM',
    icon: require('@/assets/images/khurk/onlyxmr.png'),
    pwa: true,
  },
];
