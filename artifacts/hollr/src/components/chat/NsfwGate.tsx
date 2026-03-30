import { useState, useEffect } from 'react';
import { Flame, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SESSION_KEY_PREFIX = 'nsfw_confirmed_';

export function useNsfwConfirmed(channelId: string): [boolean, () => void] {
  const [confirmed, setConfirmed] = useState(() => {
    if (!channelId) return false;
    return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${channelId}`) === '1';
  });

  useEffect(() => {
    if (!channelId) { setConfirmed(false); return; }
    setConfirmed(sessionStorage.getItem(`${SESSION_KEY_PREFIX}${channelId}`) === '1');
  }, [channelId]);

  const confirm = () => {
    if (!channelId) return;
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${channelId}`, '1');
    setConfirmed(true);
  };

  return [confirmed, confirm];
}

interface NsfwGateProps {
  channelName: string;
  onConfirm: () => void;
  onGoBack: () => void;
}

export function NsfwGate({ channelName, onConfirm, onGoBack }: NsfwGateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center select-none">
      {/* Icon cluster */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-orange-500/15 flex items-center justify-center">
          <Flame size={40} className="text-orange-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface-2 border border-border/30 flex items-center justify-center">
          <ShieldAlert size={16} className="text-orange-400" />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-2 max-w-xs">
        <h2 className="text-xl font-bold text-foreground">Age-Restricted Channel</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">#{channelName}</span> is marked as age-restricted. You must confirm you are 18 or older to view this content.
        </p>
      </div>

      {/* Warning note */}
      <div className="flex items-start gap-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 max-w-xs text-left">
        <Flame size={15} className="text-orange-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          This channel may contain content that is not suitable for all audiences. By continuing you confirm you are of legal age in your jurisdiction.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Button
          variant="primary"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
          onClick={onConfirm}
        >
          I am 18 or older — Enter Channel
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2"
          onClick={onGoBack}
        >
          <ArrowLeft size={15} />
          Go Back
        </Button>
        <p className="text-[11px] text-muted-foreground/60">
          This confirmation is valid for the current session only.
        </p>
      </div>
    </div>
  );
}
