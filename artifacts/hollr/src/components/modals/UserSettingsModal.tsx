import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useGetMyProfile, useUpdateMyProfile } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { getInitials } from '@/lib/utils';
import { Loader2, Camera, ZoomIn, RotateCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const PREVIEW_SIZE = 200;
const OUTPUT_SIZE = 256;

interface CropState {
  src: string;
  img: HTMLImageElement;
  offsetX: number;
  offsetY: number;
  zoom: number;
  baseScale: number;
}

function AvatarCropUploader({ current, onComplete }: {
  current: string;
  onComplete: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [uploading, setUploading] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const baseScale = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight);
        setCrop({ src, img, offsetX: 0, offsetY: 0, zoom: 1, baseScale });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
    e.target.value = '';
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!crop) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: crop.offsetX, startOffY: crop.offsetY };
  }, [crop]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !crop) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const scale = crop.baseScale * crop.zoom;
    const halfW = (crop.img.naturalWidth * scale) / 2;
    const halfH = (crop.img.naturalHeight * scale) / 2;
    const maxX = Math.max(0, halfW - PREVIEW_SIZE / 2);
    const maxY = Math.max(0, halfH - PREVIEW_SIZE / 2);
    setCrop(prev => prev ? {
      ...prev,
      offsetX: Math.max(-maxX, Math.min(maxX, dragRef.current!.startOffX + dx)),
      offsetY: Math.max(-maxY, Math.min(maxY, dragRef.current!.startOffY + dy)),
    } : prev);
  }, [crop]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const setZoom = (zoom: number) => {
    if (!crop) return;
    const scale = crop.baseScale * zoom;
    const halfW = (crop.img.naturalWidth * scale) / 2;
    const halfH = (crop.img.naturalHeight * scale) / 2;
    const maxX = Math.max(0, halfW - PREVIEW_SIZE / 2);
    const maxY = Math.max(0, halfH - PREVIEW_SIZE / 2);
    setCrop(prev => prev ? {
      ...prev,
      zoom,
      offsetX: Math.max(-maxX, Math.min(maxX, prev.offsetX)),
      offsetY: Math.max(-maxY, Math.min(maxY, prev.offsetY)),
    } : prev);
  };

  const handleConfirm = async () => {
    if (!crop || !canvasRef.current) return;
    setUploading(true);
    try {
      const canvas = canvasRef.current;
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d')!;

      ctx.save();
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();

      const ratio = OUTPUT_SIZE / PREVIEW_SIZE;
      const scale = crop.baseScale * crop.zoom * ratio;
      const imgW = crop.img.naturalWidth * scale;
      const imgH = crop.img.naturalHeight * scale;
      const x = OUTPUT_SIZE / 2 + crop.offsetX * ratio - imgW / 2;
      const y = OUTPUT_SIZE / 2 + crop.offsetY * ratio - imgH / 2;
      ctx.drawImage(crop.img, x, y, imgW, imgH);
      ctx.restore();

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.92)
      );

      const base = import.meta.env.BASE_URL;
      const metaRes = await fetch(`${base}api/storage/uploads/request-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: 'avatar.jpg', size: blob.size, contentType: 'image/jpeg' }),
      });
      if (!metaRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await metaRes.json();

      await fetch(uploadURL, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });

      const servingUrl = `${base}api/storage${objectPath}`;
      onComplete(servingUrl);
      setCrop(null);
    } catch (err) {
      console.error('[AvatarCrop] Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  if (crop) {
    const scale = crop.baseScale * crop.zoom;
    const imgW = crop.img.naturalWidth * scale;
    const imgH = crop.img.naturalHeight * scale;
    const imgLeft = PREVIEW_SIZE / 2 + crop.offsetX - imgW / 2;
    const imgTop = PREVIEW_SIZE / 2 + crop.offsetY - imgH / 2;

    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Drag to reposition · scroll or slide to zoom</p>
        <div
          ref={previewRef}
          className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none shrink-0"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: '50%', border: '3px solid hsl(var(--primary))' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={(e) => { e.preventDefault(); setZoom(Math.max(1, Math.min(4, crop.zoom - e.deltaY * 0.002))); }}
        >
          <img
            src={crop.src}
            draggable={false}
            style={{ position: 'absolute', left: imgLeft, top: imgTop, width: imgW, height: imgH, pointerEvents: 'none', userSelect: 'none' }}
            alt="crop preview"
          />
        </div>

        <div className="w-full flex items-center gap-2">
          <ZoomIn size={16} className="text-muted-foreground shrink-0" />
          <Slider
            value={[crop.zoom]}
            min={1}
            max={4}
            step={0.05}
            onValueChange={([v]) => setZoom(v)}
            className="flex-1"
          />
        </div>

        <div className="flex gap-2 w-full">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setCrop(null)}>
            Cancel
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCrop(prev => prev ? { ...prev, offsetX: 0, offsetY: 0, zoom: 1 } : prev)}>
            <RotateCcw size={14} />
          </Button>
          <Button size="sm" className="flex-1" onClick={handleConfirm} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {uploading ? 'Uploading…' : 'Apply'}
          </Button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group">
        <Avatar className="h-[88px] w-[88px] cursor-pointer" onClick={() => fileRef.current?.click()}>
          <AvatarImage src={current || undefined} />
          <AvatarFallback className="bg-primary text-white text-2xl">
            <Camera size={28} />
          </AvatarFallback>
        </Avatar>
        <div
          className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Camera size={22} className="text-white" />
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="text-xs">
        Upload Photo
      </Button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </div>
  );
}

export function UserSettingsModal() {
  const { userSettingsModalOpen, setUserSettingsModalOpen } = useAppStore();
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
    updateProfile.mutate(
      {
        data: {
          displayName: displayName.trim() || undefined,
          customStatus: customStatus.trim() || null,
          avatarUrl: avatarUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['/api/users/me'] });
          setUserSettingsModalOpen(false);
        },
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
            <AvatarCropUploader
              current={avatarUrl}
              onComplete={(url) => setAvatarUrl(url)}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
