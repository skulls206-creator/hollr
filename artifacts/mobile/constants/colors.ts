export type ThemeId = 'void' | 'ember' | 'bloom' | 'slate' | 'blueapple' | 'light';

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  border: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveForeground: string;
  radius: number;
}

export const THEMES: Record<ThemeId, ThemeColors> = {
  void: {
    background: '#09090f',
    foreground: '#f0f0f5',
    card: '#0f0f1a',
    border: '#1a1a28',
    primary: '#8b5cf6',
    primaryForeground: '#ffffff',
    secondary: '#161625',
    secondaryForeground: '#f0f0f5',
    muted: '#161625',
    mutedForeground: '#6b6b8a',
    destructive: '#ef4444',
    destructiveForeground: '#f0f0f5',
    radius: 8,
  },
  ember: {
    background: '#120c06',
    foreground: '#f7f5f2',
    card: '#1e1409',
    border: '#271d12',
    primary: '#f07320',
    primaryForeground: '#ffffff',
    secondary: '#221a0f',
    secondaryForeground: '#f7f5f2',
    muted: '#221a0f',
    mutedForeground: '#8a7760',
    destructive: '#ef4444',
    destructiveForeground: '#f7f5f2',
    radius: 8,
  },
  bloom: {
    background: '#120a0e',
    foreground: '#f5f3f4',
    card: '#1f1015',
    border: '#2a1820',
    primary: '#e84498',
    primaryForeground: '#ffffff',
    secondary: '#281620',
    secondaryForeground: '#f5f3f4',
    muted: '#281620',
    mutedForeground: '#856875',
    destructive: '#ef4444',
    destructiveForeground: '#f5f3f4',
    radius: 8,
  },
  slate: {
    background: '#2d3039',
    foreground: '#f5f5f5',
    card: '#32353f',
    border: '#3d4050',
    primary: '#5865f2',
    primaryForeground: '#ffffff',
    secondary: '#3c4052',
    secondaryForeground: '#f5f5f5',
    muted: '#3c4052',
    mutedForeground: '#8a919d',
    destructive: '#ef4444',
    destructiveForeground: '#f5f5f5',
    radius: 8,
  },
  blueapple: {
    background: '#000000',
    foreground: '#f5f5f5',
    card: '#0d0d0e',
    border: '#1f1f22',
    primary: '#007AFF',
    primaryForeground: '#ffffff',
    secondary: '#161618',
    secondaryForeground: '#f5f5f5',
    muted: '#161618',
    mutedForeground: '#8e8e94',
    destructive: '#ff3b30',
    destructiveForeground: '#ffffff',
    radius: 12,
  },
  light: {
    background: '#ffffff',
    foreground: '#111827',
    card: '#fafafa',
    border: '#dde0e6',
    primary: '#4752e9',
    primaryForeground: '#ffffff',
    secondary: '#e8ecf2',
    secondaryForeground: '#111827',
    muted: '#e8ecf2',
    mutedForeground: '#626f7e',
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',
    radius: 8,
  },
};

export const THEME_LABELS: Record<ThemeId, string> = {
  void: 'Void',
  ember: 'Ember',
  bloom: 'Bloom',
  slate: 'Slate',
  blueapple: 'Blue Apple',
  light: 'Snow',
};

const colors = {
  light: {
    text: '#0a0a0a',
    tint: '#8b5cf6',
    background: '#09090f',
    foreground: '#f0f0f5',
    card: '#0f0f1a',
    border: '#1a1a28',
    primary: '#8b5cf6',
    primaryForeground: '#ffffff',
    secondary: '#161625',
    secondaryForeground: '#f0f0f5',
    muted: '#161625',
    mutedForeground: '#6b6b8a',
    destructive: '#ef4444',
    destructiveForeground: '#f0f0f5',
  },
  radius: 8,
};

export default colors;
