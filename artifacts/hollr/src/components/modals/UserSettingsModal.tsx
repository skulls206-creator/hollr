import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useGetMyProfile, useUpdateMyProfile } from '@workspace/api-client-react';
import { sendVoiceSignal, sendPresenceUpdate } from '@/hooks/use-realtime';
import { useAuth } from '@workspace/replit-auth-web';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getInitials } from '@/lib/utils';
import { Loader2, LogOut, Mic, Volume2, User, Headphones, Bell, BellOff, BellRing, MessageSquare, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';
import { cn } from '@/lib/utils';
import { usePushNotifications } from '@/hooks/use-push-notifications';

type Tab = 'profile' | 'audio' | 'notifications';
type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible';

interface AudioDevice {
  deviceId: string;
  label: string;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; description: string; color: string }[] = [
  { value: 'online',    label: 'Online',           description: 'Appear active to others',    color: 'bg-emerald-500' },
  { value: 'idle',      label: 'Idle',             description: 'Appear away',                 color: 'bg-yellow-500' },
  { value: 'dnd',       label: 'Do Not Disturb',   description: 'Mute notifications',          color: 'bg-destructive' },
  { value: 'invisible', label: 'Invisible',         description: 'Appear offline to others',   color: 'bg-zinc-500' },
];

function DeviceSelect({
  label,
  icon,
  devices,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ReactNode;
  devices: AudioDevice[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded-md bg-[#1E1F22] border border-border/50 text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary appearance-none"
      >
        <option value="">{placeholder}</option>
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Device ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function UserSettingsModal() {
  const {
    userSettingsModalOpen, setUserSettingsModalOpen, voiceConnection,
    audioInputDeviceId, audioOutputDeviceId,
    setAudioInputDeviceId, setAudioOutputDeviceId,
  } = useAppStore();
  const { user, logout } = useAuth();
  const { data: profile, isLoading } = useGetMyProfile({ query: { enabled: userSettingsModalOpen } });
  const updateProfile = useUpdateMyProfile();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('profile');
  const [displayName, setDisplayName] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>('online');
  const [statusSaving, setStatusSaving] = useState(false);

  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const push = usePushNotifications();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setCustomStatus(profile.customStatus ?? '');
      setAvatarUrl(profile.avatarUrl ?? '');
      const s = profile.status as UserStatus | undefined;
      if (s && ['online', 'idle', 'dnd', 'invisible'].includes(s)) {
        setSelectedStatus(s);
      }
    }
  }, [profile]);

  // Enumerate audio devices when the Audio tab is opened
  useEffect(() => {
    if (!userSettingsModalOpen || tab !== 'audio') return;
    setDevicesLoading(true);
    navigator.mediaDevices
      .enumerateDevices()
      .then(devs => {
        const rank = (id: string) => id === 'default' ? 0 : id === 'communications' ? 1 : 2;
        const sortDevices = (arr: AudioDevice[]) =>
          arr.sort((a, b) => rank(a.deviceId) - rank(b.deviceId));
        setInputDevices(sortDevices(
          devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label }))
        ));
        setOutputDevices(sortDevices(
          devs.filter(d => d.kind === 'audiooutput').map(d => ({ deviceId: d.deviceId, label: d.label }))
        ));
      })
      .catch(() => {})
      .finally(() => setDevicesLoading(false));
  }, [userSettingsModalOpen, tab]);

  const handleStatusChange = async (newStatus: UserStatus) => {
    if (!user?.id || statusSaving) return;
    setSelectedStatus(newStatus);
    setStatusSaving(true);
    try {
      await updateProfile.mutateAsync({ data: { status: newStatus } });
      qc.invalidateQueries({ queryKey: ['/api/users/me'] });
      // Broadcast status change in real-time — server will persist it and relay to all clients
      sendPresenceUpdate(user.id, newStatus);
    } catch { /* non-fatal */ } finally {
      setStatusSaving(false);
    }
  };

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

  const TAB_BTN = (t: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        tab === t
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Dialog open={userSettingsModalOpen} onOpenChange={setUserSettingsModalOpen}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] bg-[#2B2D31] border-border/50 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">User Settings</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border/30 pb-2 -mt-1">
          {TAB_BTN('profile', <User size={14} />, 'Profile')}
          {TAB_BTN('audio', <Headphones size={14} />, 'Voice & Audio')}
          {TAB_BTN('notifications', <Bell size={14} />, 'Notifications')}
        </div>

        {/* Profile tab */}
        {tab === 'profile' && (
          isLoading ? (
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

              {/* Status picker */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      disabled={statusSaving}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                        selectedStatus === opt.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border/30 bg-[#1E1F22] hover:border-border/60 hover:bg-[#252628]'
                      )}
                    >
                      <span className={cn('w-3 h-3 rounded-full shrink-0', opt.color)} />
                      <span className="flex flex-col min-w-0">
                        <span className={cn(
                          'text-sm font-medium truncate',
                          selectedStatus === opt.value ? 'text-primary' : 'text-foreground'
                        )}>
                          {opt.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">{opt.description}</span>
                      </span>
                      {selectedStatus === opt.value && statusSaving && (
                        <Loader2 size={12} className="animate-spin ml-auto text-muted-foreground shrink-0" />
                      )}
                    </button>
                  ))}
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
                className="w-full justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={logout}
              >
                <LogOut size={16} />
                Sign Out
              </Button>
            </div>
          )
        )}

        {/* Audio tab */}
        {tab === 'audio' && (
          <div className="flex flex-col gap-5">
            {devicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <DeviceSelect
                  label="Microphone (Input)"
                  icon={<Mic size={12} />}
                  devices={inputDevices}
                  value={audioInputDeviceId}
                  onChange={setAudioInputDeviceId}
                  placeholder="System Default"
                />

                <DeviceSelect
                  label="Speaker / Headset (Output)"
                  icon={<Volume2 size={12} />}
                  devices={outputDevices}
                  value={audioOutputDeviceId}
                  onChange={setAudioOutputDeviceId}
                  placeholder="System Default"
                />

                <p className="text-xs text-muted-foreground bg-[#1E1F22] rounded-lg px-3 py-2.5 leading-relaxed">
                  Changes apply immediately to new voice connections. If you're currently in a voice channel, rejoin to switch your microphone. Speaker changes apply in real-time.
                </p>

                {outputDevices.length === 0 && inputDevices.length === 0 && (
                  <p className="text-xs text-yellow-400/80 bg-yellow-500/10 rounded-lg px-3 py-2.5">
                    No devices found. Grant microphone permission to see your audio devices.
                  </p>
                )}
              </>
            )}

            <div className="h-[1px] bg-border/30" />

            <Button
              variant="ghost"
              className="w-full justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={logout}
            >
              <LogOut size={16} />
              Sign Out
            </Button>
          </div>
        )}
        {/* Notifications tab */}
        {tab === 'notifications' && (
          <div className="flex flex-col gap-4">
            {push.permission === 'unsupported' ? (
              <p className="text-sm text-muted-foreground bg-[#1E1F22] rounded-lg px-3 py-3">
                Push notifications are not supported in this browser.
              </p>
            ) : (
              <>
                {/* Subscribe / unsubscribe */}
                <div className="flex items-start justify-between gap-4 bg-[#1E1F22] rounded-lg px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {push.isSubscribed ? <BellRing size={15} className="text-primary" /> : <Bell size={15} />}
                      {push.isSubscribed ? 'Notifications on' : 'Enable notifications'}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {push.isSubscribed
                        ? 'You\'ll receive notifications for new messages when the app is in the background.'
                        : 'Get notified of new messages and DMs even when hollr is not open.'}
                    </p>
                    {push.permission === 'denied' && (
                      <p className="text-xs text-yellow-400/80 mt-1">
                        Permission was denied. Enable notifications in your browser settings and reload.
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={push.isSubscribed ? 'outline' : 'default'}
                    disabled={push.isLoading || push.permission === 'denied'}
                    onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                    className="shrink-0"
                  >
                    {push.isLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : push.isSubscribed ? (
                      'Turn off'
                    ) : (
                      'Enable'
                    )}
                  </Button>
                </div>

                {/* Preferences (only shown when subscribed) */}
                {push.isSubscribed && (
                  <>
                    <div className="h-[1px] bg-border/30" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Preferences
                    </p>

                    {/* Mute DMs */}
                    <button
                      onClick={() => push.updatePrefs({ muteDms: !push.prefs.muteDms })}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                        push.prefs.muteDms
                          ? 'border-border/30 bg-[#1E1F22]'
                          : 'border-primary/30 bg-primary/5'
                      )}
                    >
                      <MessageSquare size={15} className={push.prefs.muteDms ? 'text-muted-foreground' : 'text-primary'} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">Direct Messages</span>
                        <span className="text-xs text-muted-foreground">
                          {push.prefs.muteDms ? 'Notifications muted' : 'Notifying you on new DMs'}
                        </span>
                      </div>
                      {!push.prefs.muteDms && <Check size={14} className="text-primary shrink-0" />}
                      {push.prefs.muteDms && (
                        <BellOff size={14} className="text-muted-foreground shrink-0" />
                      )}
                    </button>

                    <p className="text-xs text-muted-foreground leading-relaxed bg-[#1E1F22] rounded-lg px-3 py-2.5">
                      To mute a specific channel, right-click it in the channel list and choose <span className="text-foreground font-medium">Mute channel</span>.
                    </p>
                  </>
                )}
              </>
            )}

            <div className="h-[1px] bg-border/30" />
            <Button
              variant="ghost"
              className="w-full justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
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
