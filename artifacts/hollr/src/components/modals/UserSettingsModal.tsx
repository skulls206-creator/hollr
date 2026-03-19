import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useGetMyProfile, useUpdateMyProfile } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function UserSettingsModal() {
  const { userSettingsModalOpen, setUserSettingsModalOpen } = useAppStore();
  const { data: profile, isLoading } = useGetMyProfile({ query: { enabled: userSettingsModalOpen } });
  const updateProfile = useUpdateMyProfile();

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
    updateProfile.mutate(
      {
        data: {
          displayName: displayName.trim() || undefined,
          customStatus: customStatus.trim() || null,
          avatarUrl: avatarUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => setUserSettingsModalOpen(false),
      }
    );
  };

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
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 shrink-0">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white text-xl">
                  {getInitials(displayName || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-sm font-semibold">{displayName || 'Your Name'}</span>
                {customStatus && (
                  <span className="text-xs text-muted-foreground truncate">{customStatus}</span>
                )}
              </div>
            </div>

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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="avatarUrl" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Avatar URL</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                className="bg-[#1E1F22] border-border/50 focus:border-primary"
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
