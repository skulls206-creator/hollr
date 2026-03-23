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
import { Loader2, LogOut, Mic, Volume2, User, Headphones, Bell, BellOff, BellRing, MessageSquare, Check, Monitor, Smartphone, Trash2, Volume, VolumeX, Pencil, X, Layers, LayoutPanelTop, Mail } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';
import { cn } from '@/lib/utils';
import { usePushNotifications, PushDevice } from '@/hooks/use-push-notifications';

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
        className="w-full rounded-md bg-surface-0 border border-border/50 text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary appearance-none"
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

function DeviceRow({
  device,
  isCurrent,
  onUpdate,
  onRemove,
}: {
  device: PushDevice;
  isCurrent: boolean;
  onUpdate: (id: string, patch: { label?: string | null; quiet?: boolean }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.label ?? '');

  const isMobile = /iPhone|iPad|Android|Mobile/i.test(device.label ?? '');
  const DeviceIcon = isMobile ? Smartphone : Monitor;

  const commitLabel = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (device.label ?? '')) {
      onUpdate(device.id, { label: trimmed || null });
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
      isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border/20 bg-surface-0'
    )}>
      <DeviceIcon size={16} className={isCurrent ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'} />

      <div className="flex flex-col flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
            className="bg-transparent border-b border-primary text-sm text-foreground outline-none w-full"
            maxLength={64}
          />
        ) : (
          <button
            onClick={() => { setDraft(device.label ?? ''); setEditing(true); }}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground text-left hover:text-primary transition-colors group"
          >
            {device.label || <span className="text-muted-foreground italic">Unnamed device</span>}
            <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}
        <span className="text-[10px] text-muted-foreground mt-0.5">
          {isCurrent ? 'This device · ' : ''}
          Added {new Date(device.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Quiet mode toggle */}
      <button
        title={device.quiet ? 'Quiet mode on — no sound/vibration' : 'Quiet mode off — click to silence'}
        onClick={() => onUpdate(device.id, { quiet: !device.quiet })}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          device.quiet ? 'text-muted-foreground hover:text-foreground' : 'text-primary hover:text-primary/80'
        )}
      >
        {device.quiet ? <VolumeX size={14} /> : <Volume size={14} />}
      </button>

      {/* Remove device */}
      <button
        title="Remove this device"
        onClick={() => onRemove(device.id)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function UserSettingsModal() {
  const {
    userSettingsModalOpen, setUserSettingsModalOpen, voiceConnection,
    audioInputDeviceId, audioOutputDeviceId,
    setAudioInputDeviceId, setAudioOutputDeviceId,
    layoutMode, setLayoutMode,
    theme, setTheme,
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

  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleSaveEmail = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed.includes('@')) {
      setEmailMsg({ type: 'error', text: 'Enter a valid email address' });
      return;
    }
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const res = await fetch('/api/auth/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailMsg({ type: 'error', text: data.error ?? 'Failed to save email' });
      } else {
        setEmailMsg({ type: 'success', text: 'Email saved! You can now sign in with it.' });
        setEmailInput('');
      }
    } catch {
      setEmailMsg({ type: 'error', text: 'Network error, please try again' });
    } finally {
      setEmailSaving(false);
    }
  };

  const displayNameFallback = user
    ? getInitials(user.username || '?')
    : '?';

  const TAB_BTN = (t: Tab, icon: React.ReactNode, label: string, shortLabel?: string) => (
    <button
      onClick={() => setTab(t)}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
        tab === t
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
    </button>
  );

  return (
    <Dialog open={userSettingsModalOpen} onOpenChange={setUserSettingsModalOpen}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] bg-surface-1 border-border/50 overflow-hidden max-h-[92dvh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header with title + close button */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <DialogHeader className="p-0">
            <DialogTitle className="text-lg font-bold">User Settings</DialogTitle>
          </DialogHeader>
          <button
            onClick={() => setUserSettingsModalOpen(false)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10 transition-colors shrink-0 -mr-1"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border/30 pb-2 px-4 shrink-0">
          {TAB_BTN('profile', <User size={14} />, 'Profile')}
          {TAB_BTN('audio', <Headphones size={14} />, 'Voice & Audio', 'Audio')}
          {TAB_BTN('notifications', <Bell size={14} />, 'Notifications', 'Alerts')}
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 no-scrollbar">

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
                          : 'border-border/30 bg-surface-0 hover:border-border/60 hover:bg-surface-2'
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
                  className="bg-surface-0 border-border/50 focus:border-primary"
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
                  className="bg-surface-0 border-border/50 focus:border-primary"
                  maxLength={128}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setUserSettingsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={updateProfile.isPending}>
                  {updateProfile.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
                  Save Changes
                </Button>
              </div>

              <div className="h-[1px] bg-border/30" />

              {/* Email (optional — for sign-in recovery) */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Mail size={13} /> Email Address
                </Label>
                {user?.email ? (
                  <p className="text-sm text-foreground/70 bg-surface-0 border border-border/30 rounded-lg px-3 py-2">
                    {user.email}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60">No email set — add one to sign in with email.</p>
                )}
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setEmailMsg(null); }}
                    placeholder={user?.email ? 'Update email address…' : 'Add an email address…'}
                    className="bg-surface-0 border-border/50 focus:border-primary flex-1"
                  />
                  <Button
                    onClick={handleSaveEmail}
                    disabled={emailSaving || !emailInput.trim()}
                    variant="outline"
                    className="shrink-0"
                  >
                    {emailSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </Button>
                </div>
                {emailMsg && (
                  <p className={cn('text-xs px-2 py-1 rounded', emailMsg.type === 'success' ? 'text-emerald-400' : 'text-destructive')}>
                    {emailMsg.text}
                  </p>
                )}
              </div>

              <div className="h-[1px] bg-border/30" />

              {/* Theme */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'midnight', label: 'Midnight', desc: 'Deep blue-black', swatches: ['#0A0D14', '#1E1F22', '#2B2D31'] },
                    { id: 'abyss',    label: 'Abyss',    desc: 'Darker indigo',   swatches: ['#060710', '#111215', '#191B1F'] },
                    { id: 'slate',    label: 'Slate',    desc: 'Warm charcoal',   swatches: ['#2C2F33', '#36393F', '#40444B'] },
                    { id: 'forest',   label: 'Forest',   desc: 'Deep emerald',    swatches: ['#060E08', '#101612', '#16201B'] },
                    { id: 'light',    label: 'Snow',     desc: 'Clean & bright',  swatches: ['#ffffff', '#f2f3f5', '#e3e5e8'] },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 px-2 py-3 rounded-lg border transition-all text-sm',
                        theme === opt.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/30 bg-surface-0 hover:border-border/60 hover:bg-surface-2'
                      )}
                    >
                      <div className="flex gap-0.5 rounded-md overflow-hidden w-full h-6 shadow-sm">
                        {opt.swatches.map((c, i) => (
                          <div key={i} className="flex-1" style={{ background: c }} />
                        ))}
                      </div>
                      <span className={cn('font-medium text-xs', theme === opt.id ? 'text-primary' : 'text-foreground')}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Appearance */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Layers size={12} />
                  Layout Style
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLayoutMode('classic')}
                    className={cn(
                      'flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-all text-sm',
                      layoutMode === 'classic'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/30 bg-surface-0 text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <Layers size={18} />
                    <span className="font-medium">Classic</span>
                    <span className="text-[11px] opacity-70 leading-tight text-center">Side panel with servers &amp; channels</span>
                  </button>
                  <button
                    onClick={() => setLayoutMode('dock')}
                    className={cn(
                      'flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-all text-sm',
                      layoutMode === 'dock'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/30 bg-surface-0 text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <LayoutPanelTop size={18} />
                    <span className="font-medium">Dock</span>
                    <span className="text-[11px] opacity-70 leading-tight text-center">macOS-style server bar at the bottom</span>
                  </button>
                </div>
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

                <p className="text-xs text-muted-foreground bg-surface-0 rounded-lg px-3 py-2.5 leading-relaxed">
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
              <p className="text-sm text-muted-foreground bg-surface-0 rounded-lg px-3 py-3">
                Push notifications are not supported in this browser.
              </p>
            ) : (
              <>
                {/* Subscribe / unsubscribe this device */}
                <div className="flex items-start justify-between gap-4 bg-surface-0 rounded-lg px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {push.isSubscribed ? <BellRing size={15} className="text-primary" /> : <Bell size={15} />}
                      {push.isSubscribed ? 'This device is subscribed' : 'Enable notifications'}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {push.isSubscribed
                        ? 'You\'ll receive push notifications on this device when hollr is in the background.'
                        : 'Get notified of new messages even when hollr is not open.'}
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
                    {push.isLoading ? <Loader2 size={14} className="animate-spin" /> : push.isSubscribed ? 'Turn off' : 'Enable'}
                  </Button>
                </div>

                {/* Preferences (only shown when subscribed) */}
                {push.isSubscribed && (
                  <>
                    <div className="h-[1px] bg-border/30" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Preferences</p>

                    {/* Mute DMs */}
                    <button
                      onClick={() => push.updatePrefs({ muteDms: !push.prefs.muteDms })}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                        push.prefs.muteDms ? 'border-border/30 bg-surface-0' : 'border-primary/30 bg-primary/5'
                      )}
                    >
                      <MessageSquare size={15} className={push.prefs.muteDms ? 'text-muted-foreground' : 'text-primary'} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">Direct Messages</span>
                        <span className="text-xs text-muted-foreground">
                          {push.prefs.muteDms ? 'Notifications muted' : 'Notifying you on new DMs'}
                        </span>
                      </div>
                      {!push.prefs.muteDms ? <Check size={14} className="text-primary shrink-0" /> : <BellOff size={14} className="text-muted-foreground shrink-0" />}
                    </button>

                    <p className="text-xs text-muted-foreground leading-relaxed bg-surface-0 rounded-lg px-3 py-2.5">
                      To mute a specific channel, right-click it in the channel list and choose <span className="text-foreground font-medium">Mute channel</span>.
                    </p>
                  </>
                )}

                {/* Device list — visible even if this device isn't subscribed, so you can manage other devices */}
                {push.devices.length > 0 && (
                  <>
                    <div className="h-[1px] bg-border/30" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Registered Devices</p>
                    <div className="flex flex-col gap-2">
                      {push.devices.map((device) => (
                        <DeviceRow
                          key={device.id}
                          device={device}
                          isCurrent={device.endpoint === push.currentEndpoint}
                          onUpdate={push.updateDevice}
                          onRemove={push.removeDevice}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Each device you subscribe on is listed here. Use <span className="text-foreground font-medium">Quiet mode</span> to silence sound and vibration on specific devices without unsubscribing.
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

        </div>{/* end scrollable content */}
      </DialogContent>
    </Dialog>
  );
}
