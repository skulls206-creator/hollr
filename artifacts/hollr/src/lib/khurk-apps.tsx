import { lazy } from 'react';
import type { ComponentType } from 'react';

import uStreamImg from '@assets/download_(1)_1774290216897.png';
import playdImg from '@assets/5957_1774286181393.png';
import foldrImg from '@assets/5996_1774290216887.png';
import instaGhostImg from '@assets/5952_1774286181402.png';
import gaslessImg from '@assets/5963_1774286181380.png';
import ballpointImg from '@assets/5955_1774286181397.png';
import onlyGamesImg from '@assets/5961_1774286181406.png';
import onlyXmrImg from '@assets/5959_1774286181386.png';
import rippdImg from '@assets/Screenshot_2026-03-28_002535_1774671950475.png';

import uStreamBanner from '@assets/generated_images/banner_ustream.png';
import playdBanner from '@assets/generated_images/banner_playd.png';
import foldrBanner from '@assets/generated_images/banner_foldr.png';
import instaGhostBanner from '@assets/generated_images/banner_instaghost.png';
import gaslessBanner from '@assets/generated_images/banner_gasless.png';
import ballpointBanner from '@assets/generated_images/banner_ballpoint.png';
import onlyGamesBanner from '@assets/generated_images/banner_onlygames.png';
import onlyXmrBanner from '@assets/generated_images/banner_onlyxmr.png';

export interface NativePanelProps {
  /** App ID — used for any app-specific local preferences (e.g. sidebar collapsed). */
  storagePrefix: string;
  /**
   * For apps that need local folder access — the FileSystemDirectoryHandle
   * currently connected by the user (null = none yet). Managed by AppWindow.
   */
  dirHandle: FileSystemDirectoryHandle | null;
  /**
   * Callback to open the OS folder picker (delegates to AppWindow so the
   * connected folder name shows correctly in the header).
   */
  onPickFolder: () => void;
}

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
  /**
   * When set, the AppWindow renders this React component instead of an iframe.
   * The component receives the connected FileSystemDirectoryHandle and an
   * onPickFolder callback so it can prompt the user to connect a folder.
   * "Open in new tab" still navigates to `url`.
   */
  nativePanel?: ReturnType<typeof lazy<ComponentType<NativePanelProps>>>;
  /**
   * Controls which postMessage protocol is used when the user connects a folder
   * for iframe-based apps (not used when nativePanel is set).
   * - 'vault'        (default) — reads all .md/.txt/.json files and posts khurk:vault-open
   * - 'fs-directory' — skips file reading, posts khurk:fs-directory with the raw handle
   */
  folderProtocol?: 'vault' | 'fs-directory';
}

const BallpointPanel = lazy(() =>
  import('@/components/khurk/apps/BallpointPanel').then(m => ({ default: m.BallpointPanel }))
);
const FoldrPanel = lazy(() =>
  import('@/components/khurk/apps/FoldrPanel').then(m => ({ default: m.FoldrPanel }))
);
const PlaydPanel = lazy(() =>
  import('@/components/khurk/apps/PlaydPanel').then(m => ({ default: m.PlaydPanel }))
);
const RippdPanel = lazy(() =>
  import('@/components/khurk/apps/RippdPanel').then(m => ({ default: m.RippdPanel }))
);

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
    name: 'PLAYD',
    tagline: 'Local Music Player',
    description: 'Your local high-fidelity music library, organized perfectly.',
    url: 'https://playd.khurk.services',
    imageSrc: playdImg,
    bannerSrc: playdBanner,
    gradient: ['#c0340a', '#f07020'],
    nativePanel: PlaydPanel,
  },
  {
    id: 'foldr',
    name: 'FOLDR',
    tagline: 'File Browser',
    description: 'Browse, manage, and preview your local files directly in-app.',
    url: 'https://foldr.khurk.services',
    imageSrc: foldrImg,
    bannerSrc: foldrBanner,
    gradient: ['#0a5a9c', '#2ea8e0'],
    nativePanel: FoldrPanel,
  },
  {
    id: 'rippd',
    name: 'RIPPD',
    tagline: 'MP3 Ripper',
    description: 'Rip MP3s from YouTube and SoundCloud links instantly.',
    url: 'https://rippd.khurk.services',
    imageSrc: rippdImg,
    gradient: ['#7e1d8f', '#0891b2'],
    nativePanel: RippdPanel,
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
    description: 'Private, local Markdown notes stored as plain files on your device.',
    url: 'https://ballpoint.khurk.services',
    imageSrc: gaslessImg,
    bannerSrc: ballpointBanner,
    gradient: ['#5a10c0', '#a040f0'],
    nativePanel: BallpointPanel,
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
