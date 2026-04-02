import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline' | 'invisible' | string;

interface AvatarProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string;
  size?: number;
  style?: ViewStyle;
  online?: boolean;
  status?: PresenceStatus;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function statusColor(status: PresenceStatus | undefined, online: boolean | undefined): string | null {
  if (status === 'online') return '#22c55e';
  if (status === 'idle') return '#facc15';
  if (status === 'dnd') return '#ef4444';
  if (status === 'offline' || status === 'invisible') return '#6b7280';
  if (online === true) return '#22c55e';
  if (online === false) return '#6b7280';
  return null;
}

export function Avatar({ avatarUrl, username, displayName, size = 36, style, online, status }: AvatarProps) {
  const { colors } = useTheme();
  const initials = getInitials(displayName || username);
  const dotColor = statusColor(status, online);
  const showDot = dotColor !== null && (status !== undefined || online !== undefined);

  return (
    <View style={[{ width: size, height: size }, style]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primary,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.38, color: colors.primaryForeground }]}>
            {initials}
          </Text>
        </View>
      )}
      {showDot && (
        <View
          style={[
            styles.dot,
            {
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: size * 0.15,
              backgroundColor: dotColor!,
              borderColor: colors.background,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    objectFit: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  dot: {
    position: 'absolute',
    borderWidth: 2,
  },
});
