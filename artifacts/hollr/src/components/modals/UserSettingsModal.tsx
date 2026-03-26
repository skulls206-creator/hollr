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
import { Loader2, LogOut, Mic, Volume2, User, Headphones, Bell, BellOff, BellRing, MessageSquare, Check, Monitor, Smartphone, Trash2, Volume, VolumeX, Pencil, X, Layers, LayoutPanelTop, Mail, KeyRound, Eye, EyeOff, LayoutGrid, Palette, Settings2, ShieldCheck, Phone, PhoneOff, Users, Play, Gem, ExternalLink } from 'lucide-react';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import { RINGTONES, previewRingtone } from '@/lib/notification-sound';
import type { RingtoneId } from '@/lib/notification-sound';
import { useQueryClient } from '@tanstack/react-query';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';
import { cn } from '@/lib/utils';
import { usePushNotifications, PushDevice } from '@/hooks/use-push-notifications';

type Tab = 'profile' | 'account' | 'appearance' | 'audio' | 'notifications' | 'privacy' | 'supporter';
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
    khurkDashboardOpen, setKhurkDashboardOpen,
    chatFontSize, setChatFontSize,
    allowCallsFrom, setAllowCallsFrom,
    ringtoneId, setRingtoneId,
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
  const [previewingRingtone, setPreviewingRingtone] = useState<RingtoneId | null>(null);

  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const push = usePushNotifications();

  const [supporterLoading, setSupporterLoading] = useState(false);
  const [supporterStatus, setSupporterStatus] = useState<{ isSupporter: boolean; hasCustomerId: boolean } | null>(null);
  const [supporterPrices, setSupporterPrices] = useState<Array<{ price_id: string; unit_amount: number; currency: string; recurring: any }>>([]);

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

  const BASE = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!userSettingsModalOpen || tab !== 'supporter') return;
    const controller = new AbortController();
    Promise.all([
      fetch(`${BASE}api/supporter/status`, { credentials: 'include', signal: controller.signal }).then(r => r.json()),
      fetch(`${BASE}api/supporter/prices`, { credentials: 'include', signal: controller.signal }).then(r => r.json()),
    ]).then(([statusData, pricesData]) => {
      setSupporterStatus(statusData);
      setSupporterPrices(pricesData.prices ?? []);
    }).catch(() => {});
    return () => controller.abort();
  }, [userSettingsModalOpen, tab]);

  const handleSupporterCheckout = async (priceId: string) => {
    if (supporterLoading) return;
    setSupporterLoading(true);
    try {
      const res = await fetch(`${BASE}api/supporter/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch {
      // ignore
    } finally {
      setSupporterLoading(false);
    }
  };

  const handleSupporterPortal = async () => {
    if (supporterLoading) return;
    setSupporterLoading(true);
    try {
      const res = await fetch(`${BASE}api/supporter/portal`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch {
      // ignore
    } finally {
      setSupporterLoading(false);
    }
  };

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

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!currentPw) { setPwMsg({ type: 'error', text: 'Enter your current password' }); return; }
    if (newPw.length < 8) { setPwMsg({ type: 'error', text: 'New password must be at least 8 characters' }); return; }
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'New passwords do not match' }); return; }
    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ type: 'error', text: data.error ?? 'Failed to change password' });
      } else {
        setPwMsg({ type: 'success', text: 'Password changed successfully' });
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      }
    } catch {
      setPwMsg({ type: 'error', text: 'Network error, please try again' });
    } finally {
      setPwSaving(false);
    }
  };

  const displayNameFallback = user
    ? getInitials(user.username || '?')
    : '?';

  const NAV: { id: Tab; icon: React.ReactNode; label: string; group: string }[] = [
    { id: 'profile',       icon: <User size={15} />,         label: 'Profile',       group: 'USER' },
    { id: 'account',       icon: <KeyRound size={15} />,     label: 'Account',       group: 'USER' },
    { id: 'appearance',    icon: <Palette size={15} />,      label: 'Appearance',    group: 'USER' },
    { id: 'audio',         icon: <Headphones size={15} />,   label: 'Audio',         group: 'APP' },
    { id: 'notifications', icon: <Bell size={15} />,         label: 'Notifications', group: 'APP' },
    { id: 'privacy',       icon: <ShieldCheck size={15} />,  label: 'Privacy',       group: 'APP' },
    { id: 'supporter',     icon: <Gem size={15} />,          label: 'Supporter',     group: 'APP' },
  ];

  const groups = [...new Set(NAV.map(n => n.group))];

  return (
    <Dialog open={userSettingsModalOpen} onOpenChange={setUserSettingsModalOpen}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl bg-surface-1 border-border/50 overflow-hidden max-h-[92dvh] flex flex-col sm:flex-row p-0 gap-0 [&>button:last-child]:hidden">

        {/* ── Mobile header (hidden on desktop) ── */}
        <div className="sm:hidden flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <p className="text-xs font-black tracking-widest text-muted-foreground/50 uppercase">Settings</p>
          <button
            onClick={() => setUserSettingsModalOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Mobile tab bar (hidden on desktop) ── */}
        <div className="sm:hidden flex gap-1 px-3 pb-2 overflow-x-auto no-scrollbar shrink-0 border-b border-border/20">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl shrink-0 transition-all',
                tab === item.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}
            >
              {item.icon}
              <span className="text-[10px] font-semibold whitespace-nowrap">{item.label}</span>
            </button>
          ))}
          <div className="shrink-0 ml-auto pl-1">
            <button
              onClick={logout}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut size={15} />
              <span className="text-[10px] font-semibold whitespace-nowrap">Sign Out</span>
            </button>
          </div>
        </div>

        {/* ── Desktop left nav sidebar (hidden on mobile) ── */}
        <div className="hidden sm:flex w-44 shrink-0 bg-surface-0 border-r border-border/30 flex-col py-3 overflow-hidden">
          <p className="px-4 pt-1 pb-3 text-[11px] font-black tracking-widest text-muted-foreground/50 uppercase select-none">
            Settings
          </p>

          {groups.map((group, gi) => (
            <div key={group} className={cn(gi > 0 && 'mt-2 pt-2 border-t border-border/20')}>
              <p className="px-4 pb-1 text-[9px] font-black tracking-[0.18em] text-muted-foreground/40 uppercase select-none">
                {group}
              </p>
              {NAV.filter(n => n.group === group).map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-sm font-medium transition-colors text-left',
                    'w-[calc(100%-8px)]',
                    tab === item.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ))}

          <div className="mt-auto pt-3 border-t border-border/20 mx-1">
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Right content panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Desktop top bar: section title + close (hidden on mobile — mobile has its own header) */}
          <div className="hidden sm:flex items-center justify-between px-5 py-3 border-b border-border/20 shrink-0">
            <p className="text-sm font-bold text-foreground">
              {NAV.find(n => n.id === tab)?.label ?? 'Settings'}
            </p>
            <button
              onClick={() => setUserSettingsModalOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mobile: current section label */}
          <div className="sm:hidden px-4 pt-3 pb-1 shrink-0">
            <p className="text-base font-bold text-foreground">
              {NAV.find(n => n.id === tab)?.label ?? 'Settings'}
            </p>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 sm:px-5 py-4">

            {/* ── PROFILE ── */}
            {tab === 'profile' && (
              isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Avatar + name side-by-side */}
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      <ImageCropUploader
                        current={avatarUrl}
                        shape="circle"
                        onComplete={(url) => setAvatarUrl(url)}
                        placeholder={<span className="text-white text-xl font-bold">{displayNameFallback}</span>}
                      />
                    </div>
                    <div className="flex flex-col gap-3 flex-1 min-w-0 pt-1">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="displayName" className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest">Display Name</Label>
                        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" className="bg-surface-0 border-border/50 focus:border-primary h-9 text-sm" maxLength={80} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="customStatus" className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest">Custom Status</Label>
                        <Input id="customStatus" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="What's on your mind?" className="bg-surface-0 border-border/50 focus:border-primary h-9 text-sm" maxLength={128} />
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest">Status</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleStatusChange(opt.value)}
                          disabled={statusSaving}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                            selectedStatus === opt.value
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-border/30 bg-surface-0 hover:border-border/60 hover:bg-surface-2'
                          )}
                        >
                          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', opt.color)} />
                          <span className={cn('text-sm font-medium truncate', selectedStatus === opt.value ? 'text-primary' : 'text-foreground')}>
                            {opt.label}
                          </span>
                          {selectedStatus === opt.value && statusSaving && (
                            <Loader2 size={11} className="animate-spin ml-auto shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setUserSettingsModalOpen(false)}>Cancel</Button>
                    <Button className="flex-1" onClick={handleSave} disabled={updateProfile.isPending}>
                      {updateProfile.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              )
            )}

            {/* ── ACCOUNT ── */}
            {tab === 'account' && (
              <div className="flex flex-col gap-5">
                {/* Email */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest flex items-center gap-1.5">
                    <Mail size={11} /> Email Address
                  </Label>
                  {user?.email && (
                    <p className="text-sm text-foreground/60 bg-surface-0 border border-border/30 rounded-lg px-3 py-2">{user.email}</p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={emailInput}
                      onChange={(e) => { setEmailInput(e.target.value); setEmailMsg(null); }}
                      placeholder={user?.email ? 'Update email…' : 'Add an email address…'}
                      className="bg-surface-0 border-border/50 focus:border-primary flex-1 h-9"
                    />
                    <Button onClick={handleSaveEmail} disabled={emailSaving || !emailInput.trim()} variant="outline" size="sm" className="shrink-0 h-9">
                      {emailSaving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  {!user?.email && <p className="text-[11px] text-muted-foreground/50">No email set — add one to sign in with email.</p>}
                  {emailMsg && <p className={cn('text-xs px-2 py-1 rounded', emailMsg.type === 'success' ? 'text-emerald-400' : 'text-destructive')}>{emailMsg.text}</p>}
                </div>

                <div className="h-px bg-border/20" />

                {/* Password */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest flex items-center gap-1.5">
                    <KeyRound size={11} /> Change Password
                  </Label>
                  <div className="relative">
                    <Input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setPwMsg(null); }} placeholder="Current password" className="bg-surface-0 border-border/50 focus:border-primary pr-9 h-9" />
                    <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwMsg(null); }} placeholder="New password (min 8 chars)" className="bg-surface-0 border-border/50 focus:border-primary pr-9 h-9" />
                    <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input type="password" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwMsg(null); }} placeholder="Confirm new password" className="bg-surface-0 border-border/50 focus:border-primary flex-1 h-9" />
                    <Button onClick={handleChangePassword} disabled={pwSaving || !currentPw || !newPw || !confirmPw} variant="outline" size="sm" className="shrink-0 h-9">
                      {pwSaving ? <Loader2 size={13} className="animate-spin" /> : 'Update'}
                    </Button>
                  </div>
                  {pwMsg && <p className={cn('text-xs px-2 py-1 rounded', pwMsg.type === 'success' ? 'text-emerald-400' : 'text-destructive')}>{pwMsg.text}</p>}
                </div>
              </div>
            )}

            {/* ── APPEARANCE ── */}
            {tab === 'appearance' && (
              <div className="flex flex-col gap-5">
                {/* Theme */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest">Theme</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'void',     label: 'Void',     swatches: ['#060609', '#0C0C10', '#8B5CF6'] },
                      { id: 'midnight', label: 'Midnight', swatches: ['#0A0D14', '#1E1F22', '#2B2D31'] },
                      { id: 'abyss',    label: 'Abyss',    swatches: ['#060710', '#111215', '#191B1F'] },
                      { id: 'slate',    label: 'Slate',    swatches: ['#2C2F33', '#36393F', '#40444B'] },
                      { id: 'forest',   label: 'Forest',   swatches: ['#060E08', '#101612', '#16201B'] },
                      { id: 'light',    label: 'Snow',     swatches: ['#ffffff', '#f2f3f5', '#e3e5e8'] },
                    ] as const).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all',
                          theme === opt.id ? 'border-primary bg-primary/10' : 'border-border/30 bg-surface-0 hover:border-border/60 hover:bg-surface-2'
                        )}
                      >
                        <div className="flex gap-0.5 rounded overflow-hidden w-full h-5 shadow-sm">
                          {opt.swatches.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
                        </div>
                        <span className={cn('font-semibold text-xs', theme === opt.id ? 'text-primary' : 'text-foreground')}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border/20" />

                {/* Layout */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest flex items-center gap-1.5">
                    <Layers size={10} /> Layout Style
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'classic' as const, icon: <Layers size={16} />, label: 'Classic', desc: 'Side panel' },
                      { id: 'dock'    as const, icon: <LayoutPanelTop size={16} />, label: 'Dock', desc: 'Bottom bar' },
                    ]).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setLayoutMode(opt.id)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left',
                          layoutMode === opt.id
                            ? 'border-primary/60 bg-primary/10 text-primary'
                            : 'border-border/30 bg-surface-0 text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground'
                        )}
                      >
                        {opt.icon}
                        <span className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold">{opt.label}</span>
                          <span className="text-[11px] opacity-60">{opt.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border/20" />

                {/* Font size */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest">Message Text Size</Label>
                  <div className="flex rounded-lg border border-border/30 overflow-hidden bg-surface-0">
                    {([{ id: 'sm', label: 'Small' }, { id: 'md', label: 'Normal' }, { id: 'lg', label: 'Large' }] as const).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setChatFontSize(opt.id)}
                        className={cn(
                          'flex-1 py-2 text-sm font-medium transition-all border-r last:border-r-0 border-border/30',
                          chatFontSize === opt.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className={cn('px-3 py-2 rounded-lg bg-surface-0 border border-border/20 text-foreground', chatFontSize === 'sm' ? 'text-sm' : chatFontSize === 'lg' ? 'text-lg' : 'text-[15px]')}>
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>

                <div className="h-px bg-border/20" />

                {/* KHURK OS toggle */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/20 bg-surface-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <LayoutGrid size={14} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">KHURK OS Dashboard</p>
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Show app launcher when no channel is open</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKhurkDashboardOpen(!khurkDashboardOpen)}
                    className={cn('relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none', khurkDashboardOpen ? 'bg-primary' : 'bg-border/60')}
                    style={{ width: 36, height: 20 }}
                    aria-label="Toggle KHURK OS Dashboard"
                  >
                    <span className="absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform duration-200" style={{ width: 16, height: 16, transform: khurkDashboardOpen ? 'translateX(16px)' : 'translateX(0)' }} />
                  </button>
                </div>
              </div>
            )}

            {/* ── AUDIO ── */}
            {tab === 'audio' && (
              <div className="flex flex-col gap-4">
                {devicesLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <DeviceSelect label="Microphone (Input)" icon={<Mic size={12} />} devices={inputDevices} value={audioInputDeviceId} onChange={setAudioInputDeviceId} placeholder="System Default" />
                    <DeviceSelect label="Speaker / Headset (Output)" icon={<Volume2 size={12} />} devices={outputDevices} value={audioOutputDeviceId} onChange={setAudioOutputDeviceId} placeholder="System Default" />
                    <p className="text-xs text-muted-foreground bg-surface-0 rounded-lg px-3 py-2.5 leading-relaxed">
                      Changes apply to new voice connections. Rejoin a voice channel to switch microphone. Speaker changes apply in real-time.
                    </p>
                    {outputDevices.length === 0 && inputDevices.length === 0 && (
                      <p className="text-xs text-yellow-400/80 bg-yellow-500/10 rounded-lg px-3 py-2.5">
                        No devices found. Grant microphone permission to see your audio devices.
                      </p>
                    )}

                    {/* ── Ringtone picker ── */}
                    <div className="h-px bg-border/20 my-1" />
                    <div className="flex flex-col gap-2">
                      <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                        <Phone size={9} /> Ringtone
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
                        Plays when someone calls you.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                        {RINGTONES.map((rt) => {
                          const isSelected = ringtoneId === rt.id;
                          const isPreviewing = previewingRingtone === rt.id;
                          return (
                            <button
                              key={rt.id}
                              onClick={() => setRingtoneId(rt.id)}
                              className={cn(
                                'relative flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border text-left transition-all',
                                isSelected
                                  ? 'border-primary/60 bg-primary/8'
                                  : 'border-border/30 bg-surface-0 hover:border-border/60 hover:bg-surface-1',
                              )}
                            >
                              {isSelected && (
                                <span className="absolute top-2 right-2">
                                  <Check size={11} className="text-primary" />
                                </span>
                              )}
                              <span className={cn('text-xs font-semibold', isSelected ? 'text-primary' : 'text-foreground')}>
                                {rt.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground leading-tight pr-4">{rt.description}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewingRingtone(rt.id);
                                  previewRingtone(rt.id);
                                  setTimeout(() => setPreviewingRingtone(null), 1800);
                                }}
                                className={cn(
                                  'mt-1 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors',
                                  isPreviewing
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-border/20 text-muted-foreground hover:bg-border/40 hover:text-foreground',
                                )}
                              >
                                <Play size={9} className={isPreviewing ? 'animate-pulse' : ''} />
                                {isPreviewing ? 'Playing…' : 'Preview'}
                              </button>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {tab === 'notifications' && (
              <div className="flex flex-col gap-4">
                {push.permission === 'unsupported' ? (
                  <p className="text-sm text-muted-foreground bg-surface-0 rounded-lg px-3 py-3">Push notifications are not supported in this browser.</p>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4 bg-surface-0 rounded-lg px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {push.isSubscribed ? <BellRing size={14} className="text-primary" /> : <Bell size={14} />}
                          {push.isSubscribed ? 'This device is subscribed' : 'Enable notifications'}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {push.isSubscribed ? "You'll receive push notifications when HOLLR is in the background." : 'Get notified of new messages even when HOLLR is not open.'}
                        </p>
                        {push.permission === 'denied' && (
                          <p className="text-xs text-yellow-400/80 mt-1">Permission denied. Enable in browser settings and reload.</p>
                        )}
                      </div>
                      <Button size="sm" variant={push.isSubscribed ? 'outline' : 'default'} disabled={push.isLoading || push.permission === 'denied'} onClick={push.isSubscribed ? push.unsubscribe : push.subscribe} className="shrink-0">
                        {push.isLoading ? <Loader2 size={13} className="animate-spin" /> : push.isSubscribed ? 'Turn off' : 'Enable'}
                      </Button>
                    </div>

                    {push.isSubscribed && (
                      <>
                        <div className="h-px bg-border/20" />
                        <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Preferences</p>
                        <button
                          onClick={() => push.updatePrefs({ muteDms: !push.prefs.muteDms })}
                          className={cn('flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all', push.prefs.muteDms ? 'border-border/30 bg-surface-0' : 'border-primary/30 bg-primary/5')}
                        >
                          <MessageSquare size={14} className={push.prefs.muteDms ? 'text-muted-foreground' : 'text-primary'} />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground">Direct Messages</span>
                            <span className="text-xs text-muted-foreground">{push.prefs.muteDms ? 'Muted' : 'Notifying on new DMs'}</span>
                          </div>
                          {!push.prefs.muteDms ? <Check size={13} className="text-primary shrink-0" /> : <BellOff size={13} className="text-muted-foreground shrink-0" />}
                        </button>
                        <p className="text-xs text-muted-foreground bg-surface-0 rounded-lg px-3 py-2.5 leading-relaxed">
                          To mute a specific channel, right-click it and choose <span className="text-foreground font-medium">Mute channel</span>.
                        </p>
                      </>
                    )}

                    {push.devices.length > 0 && (
                      <>
                        <div className="h-px bg-border/20" />
                        <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Registered Devices</p>
                        <div className="flex flex-col gap-2">
                          {push.devices.map((device) => (
                            <DeviceRow key={device.id} device={device} isCurrent={device.endpoint === push.currentEndpoint} onUpdate={push.updateDevice} onRemove={push.removeDevice} />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Use <span className="text-foreground font-medium">Quiet mode</span> to silence sound on specific devices without unsubscribing.
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── PRIVACY ── */}
            {tab === 'privacy' && (
              <div className="flex flex-col gap-4">
                <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Voice & Video Calls</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Control who can start a voice call with you in Direct Messages.
                </p>

                {[
                  {
                    value: 'everyone' as const,
                    icon: <Users size={14} />,
                    label: 'Everyone',
                    desc: 'Anyone you have a DM with can ring you directly.',
                  },
                  {
                    value: 'approved_only' as const,
                    icon: <Phone size={14} />,
                    label: 'Approved only',
                    desc: 'Unknown callers must request permission first. You approve or deny per-call.',
                  },
                  {
                    value: 'nobody' as const,
                    icon: <PhoneOff size={14} />,
                    label: 'Nobody',
                    desc: 'All incoming DM calls are silently declined.',
                  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAllowCallsFrom(opt.value)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                      allowCallsFrom === opt.value
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/30 bg-surface-0 hover:bg-surface-0/80'
                    )}
                  >
                    <span className={cn('mt-0.5 shrink-0', allowCallsFrom === opt.value ? 'text-primary' : 'text-muted-foreground')}>
                      {opt.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    {allowCallsFrom === opt.value && <Check size={13} className="text-primary shrink-0 mt-0.5" />}
                  </button>
                ))}

                <p className="text-xs text-muted-foreground bg-surface-0 rounded-lg px-3 py-2.5 leading-relaxed">
                  This setting only applies to DM calls. Voice channels in servers are always open to members.
                </p>
              </div>
            )}

            {/* ── SUPPORTER ── */}
            {tab === 'supporter' && (
              <div className="flex flex-col gap-5">
                {/* Hero */}
                <div className="flex items-center gap-3 px-4 py-4 bg-gradient-to-br from-cyan-500/10 via-sky-500/10 to-indigo-500/10 border border-cyan-500/20 rounded-xl">
                  <KhurkDiamondBadge size="lg" className="shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-foreground">hollr Supporter</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Show your support and get a glowing diamond badge next to your name everywhere in hollr.
                    </p>
                  </div>
                </div>

                {supporterStatus?.isSupporter ? (
                  /* ── Active supporter ── */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <Check size={14} className="text-emerald-400 shrink-0" />
                      <p className="text-sm font-semibold text-emerald-400">Active supporter — badge is live!</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your diamond badge is showing next to your name in chat messages, the member list, and profile cards.
                      To update your payment method or cancel, open the billing portal below.
                    </p>
                    <Button
                      onClick={handleSupporterPortal}
                      disabled={supporterLoading}
                      variant="outline"
                      className="w-full flex items-center gap-2"
                    >
                      {supporterLoading
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ExternalLink size={14} />}
                      Manage Billing
                    </Button>
                  </div>
                ) : (
                  /* ── Not a supporter yet ── */
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Choose a plan to become a hollr Supporter. Your badge activates instantly after payment.
                    </p>

                    {supporterPrices.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {supporterPrices.map(p => {
                          const dollars = ((p.unit_amount ?? 0) / 100).toFixed(2);
                          const interval = p.recurring?.interval ?? 'month';
                          const isYearly = interval === 'year';
                          return (
                            <button
                              key={p.price_id}
                              onClick={() => handleSupporterCheckout(p.price_id)}
                              disabled={supporterLoading}
                              className="flex flex-col items-start gap-1 px-4 py-3 bg-surface-0 border border-border/40 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded-xl transition-all text-left disabled:opacity-60"
                            >
                              <div className="flex items-center gap-2">
                                <KhurkDiamondBadge size="sm" />
                                <span className="text-base font-bold text-foreground">
                                  ${dollars}
                                  <span className="text-xs font-normal text-muted-foreground">/{interval}</span>
                                </span>
                                {isYearly && (
                                  <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full">
                                    Save ~17%
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {isYearly ? 'Yearly · billed once a year' : 'Monthly · cancel anytime'}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            disabled
                            className="flex flex-col items-start gap-1 px-4 py-3 bg-surface-0 border border-border/40 rounded-xl text-left opacity-60"
                          >
                            <div className="flex items-center gap-2">
                              <KhurkDiamondBadge size="sm" />
                              <span className="text-base font-bold text-foreground">
                                $1.00<span className="text-xs font-normal text-muted-foreground">/month</span>
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Monthly · cancel anytime</p>
                          </button>
                          <button
                            disabled
                            className="flex flex-col items-start gap-1 px-4 py-3 bg-surface-0 border border-border/40 rounded-xl text-left opacity-60"
                          >
                            <div className="flex items-center gap-2">
                              <KhurkDiamondBadge size="sm" />
                              <span className="text-base font-bold text-foreground">
                                $10.00<span className="text-xs font-normal text-muted-foreground">/year</span>
                              </span>
                              <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full">Save ~17%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Yearly · billed once a year</p>
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 text-center">
                          Stripe payments coming soon — check back shortly.
                        </p>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed text-center">
                      Secure checkout via Stripe. Cancel anytime from the billing portal.
                    </p>

                    {supporterStatus?.hasCustomerId && (
                      <Button
                        onClick={handleSupporterPortal}
                        disabled={supporterLoading}
                        variant="ghost"
                        size="sm"
                        className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground"
                      >
                        {supporterLoading
                          ? <Loader2 size={12} className="animate-spin" />
                          : <ExternalLink size={12} />}
                        Manage Billing
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>{/* end scrollable content */}
        </div>{/* end right panel */}
      </DialogContent>
    </Dialog>
  );
}
