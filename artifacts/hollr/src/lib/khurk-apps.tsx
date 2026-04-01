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

const SNOW_IMG_FILTER =
  'saturate(0.06) brightness(2) contrast(1.4) drop-shadow(0 0 6px rgba(190,220,255,0.9)) drop-shadow(0 0 2px rgba(255,255,255,0.95))';

/**
 * CSS filter for the icon *container* div (gradient background + image together).
 * Snow/light is intentionally excluded here — it uses a white container instead
 * so the filter is not applied to a dark background (which stays dark).
 */
export function getKhurkIconFilter(theme: KhurkThemeId, appId: string): string {
  if (appId === 'onlyxmr') return '';
  switch (theme) {
    case 'ember':    return 'hue-rotate(130deg) saturate(1.5)';
    case 'bloom':    return 'hue-rotate(55deg) saturate(1.35)';
    case 'blueapple':return 'hue-rotate(-65deg) saturate(1.3) brightness(1.1)';
    default:         return ''; // void / slate / light — handled separately
  }
}

/**
 * Returns the full style object for an icon *container* div.
 * For Snow theme: replaces the gradient with an icy-white background so the
 * Snow img filter has a clean surface to work on.
 * For other themes: keeps the gradient and applies the hue-rotate filter.
 */
export function getKhurkContainerStyle(
  theme: KhurkThemeId,
  appId: string,
  gradient: [string, string],
): React.CSSProperties {
  if (theme === 'light' && appId !== 'onlyxmr') {
    return {
      background: 'linear-gradient(135deg, rgba(232,238,255,0.96) 0%, rgba(255,255,255,0.99) 100%)',
      transition: 'background 0.4s ease',
    };
  }
  const filter = getKhurkIconFilter(theme, appId);
  return {
    background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
    ...(filter ? { filter, transition: 'filter 0.4s ease' } : {}),
  };
}

/**
 * CSS filter to apply to the <img> element only.
 * Only used for Snow theme — other themes tint the whole container.
 */
export function getKhurkImgFilter(theme: KhurkThemeId, appId: string): string {
  if (theme === 'light' && appId !== 'onlyxmr') return SNOW_IMG_FILTER;
  return '';
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
  /** When true the app is hidden from all user-facing lists (sidebar, dock, dashboard).
   *  The code and assets stay in place so it can be re-enabled by removing this flag. */
  hidden?: boolean;
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
    hidden: true,
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

/** All apps that are not flagged as hidden — use this everywhere users see app lists. */
export const VISIBLE_KHURK_APPS = KHURK_APPS.filter((a) => !a.hidden);
