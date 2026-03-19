import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useGetMyProfile, useUpdateMyProfile } from '@workspace/api-client-react';
import { sendVoiceSignal } from '@/hooks/use-realtime';
import { useAuth } from '@workspace/replit-auth-web';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getInitials } from '@/lib/utils';
import { Loader2, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';

export function UserSettingsModal() {
  const { userSettingsModalOpen, setUserSettingsModalOpen, voiceConnection } = useAppStore();
  const { user, logout } = useAuth();
  const { data: profile, isLoading } = useGetMyProfile({ query: { enabled: userSettingsModalOpen } });
  const updateProfile = useUpdateMyProfile();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setCustomStatus(profile.customStatus ?? '');
      setAvatarUrl(profile.avatarUrl ?? '');
    }
  }, [profile]);

  const handleSave = () => {
    const newDisplayName = displayName.trim() || undefined;
    const newAvatarUrl = avatarUrl.trim() || undefined;
    updateProfile.mutate(
      {
        data: {
          displayName: newDisplayName,
          customStatus: customStatus.trim() || null,
          avatarUrl: newAvatarUrl,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['/api/users/me'] });
          if (voiceConnection.channelId && user?.id) {
            sendVoiceSignal({
              type: 'profile_update',
              channelId: voiceConnection.channelId,
              userId: user.id,
              displayName: newDisplayName,
              avatarUrl: newAvatarUrl ?? null,
            });
          }
          setUserSettingsModalOpen(false);
        },
      }
    );
  };

  const displayNameFallback = user
    ? getInitials([user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '?')
    : '?';

  return (
    <Dialog open={userSettingsModalOpen} onOpenChange={setUserSettingsModalOpen}>
      <DialogContent className="max-w-md bg-[#2B2D31] border-border/50">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">User Settings</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <ImageCropUploader
              current={avatarUrl}
              shape="circle"
              onComplete={(url) => setAvatarUrl(url)}
              placeholder={<span className="text-white text-2xl font-bold">{displayNameFallback}</span>}
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                className="bg-[#1E1F22] border-border/50 focus:border-primary"
                maxLength={80}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customStatus" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Custom Status</Label>
              <Input
                id="customStatus"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                placeholder="Set a custom status…"
                className="bg-[#1E1F22] border-border/50 focus:border-primary"
                maxLength={128}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setUserSettingsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>

            <div className="h-[1px] bg-border/30" />

            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={logout}
            >
              <LogOut size={16} />
              Sign Out
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
