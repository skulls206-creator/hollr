import { lazy } from 'react';
import type { ComponentType } from 'react';

import uStreamImg from '@assets/IMG_0053_1774901986488.png';
import playdImg from '@assets/IMG_0052_1774901386511.png';
import foldrImg from '@assets/IMG_0047_1774898186170.png';
import ghostdImg from '@assets/IMG_0056_1774903687425.png';
import gaslessImg from '@assets/IMG_0051_1774901156456.png';
import ballpointImg from '@assets/IMG_0048_1774899223660.png';
import onlyGamesImg from '@assets/IMG_0055_1774902599575.png';
import onlyXmrImg from '@assets/IMG_0054_1774902599574.png';
import rippdImg from '@assets/IMG_0050_1774900796709.png';

import hollrLogoImg from '@assets/generated_images/hollr_logo_final.png';
import uStreamBanner from '@assets/generated_images/banner_ustream.png';
import playdBanner from '@assets/generated_images/banner_playd.png';
import foldrBanner from '@assets/generated_images/banner_foldr.png';
import rippdBanner from '@assets/generated_images/banner_rippd.png';
import ghostdBanner from '@assets/generated_images/banner_instaghost.png';
import gaslessBanner from '@assets/generated_images/banner_gasless.png';
import ballpointBanner from '@assets/generated_images/banner_ballpoint.png';
import onlyGamesBanner from '@assets/generated_images/banner_onlygames.png';
import onlyXmrBanner from '@assets/generated_images/banner_onlyxmr.png';

export type KhurkThemeId = 'void' | 'ember' | 'bloom' | 'slate' | 'blueapple' | 'light';

/**
 * Returns a CSS filter string for tinting khurk app icons to match the
 * current theme. onlyxmr is always excluded — it stays its own gold colour.
 */
export function getKhurkIconFilter(theme: KhurkThemeId, appId: string): string {
  if (appId === 'onlyxmr') return '';
  switch (theme) {
    case 'ember':
      // purple → warm amber/orange
      return 'hue-rotate(130deg) saturate(1.5)';
    case 'bloom':
      // purple → vivid rose-pink
      return 'hue-rotate(55deg) saturate(1.35)';
    case 'blueapple':
      // purple → dense sky-blue
      return 'hue-rotate(-65deg) saturate(1.3) brightness(1.1)';
    case 'light':
      // Snow — bleach colour out, crank brightness → clear diamond with icy shimmer
      return 'saturate(0.06) brightness(2) contrast(1.4) drop-shadow(0 0 6px rgba(190,220,255,0.9)) drop-shadow(0 0 2px rgba(255,255,255,0.95))';
    default:
      // void / slate — keep natural purple
      return '';
  }
}

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
    <img
      src={hollrLogoImg}
      alt="hollr"
      width={size}
      height={size}
      style={{ objectFit: 'cover', borderRadius: '22%', display: 'block' }}
      draggable={false}
    />
  );
}

export const KHURK_APPS: KhurkApp[] = [
  {
    id: 'streamd',
    name: 'STREAMD',
    tagline: 'Movies & TV',
    description: 'High-definition streaming of movies and television series.',
    url: 'https://streamd.khurk.services',
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
    bannerSrc: rippdBanner,
    gradient: ['#7e1d8f', '#0891b2'],
    nativePanel: RippdPanel,
  },
  {
    id: 'ghostd',
    name: 'GHOSTD',
    tagline: 'Crypto Exchange',
    description: 'Anonymous and lightning-fast cryptocurrency exchange.',
    url: 'https://ghostd.khurk.services',
    imageSrc: ghostdImg,
    bannerSrc: ghostdBanner,
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
