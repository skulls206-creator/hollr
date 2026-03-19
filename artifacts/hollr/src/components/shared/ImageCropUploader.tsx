import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, ZoomIn, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PREVIEW_SIZE = 200;
const OUTPUT_SIZE = 256;
const SQUARE_RADIUS = 36;

interface CropState {
  src: string;
  img: HTMLImageElement;
  offsetX: number;
  offsetY: number;
  zoom: number;
  baseScale: number;
}

function clipShape(ctx: CanvasRenderingContext2D, size: number, shape: 'circle' | 'square') {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  } else {
    const r = (SQUARE_RADIUS / PREVIEW_SIZE) * size;
    ctx.roundRect(0, 0, size, size, r);
  }
  ctx.clip();
}

export function ImageCropUploader({
  current,
  shape = 'circle',
  onComplete,
  placeholder,
}: {
  current: string;
  shape?: 'circle' | 'square';
  onComplete: (url: string) => void;
  placeholder?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    if (!crop || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    ctx.save();
    clipShape(ctx, PREVIEW_SIZE, shape);
    const scale = crop.baseScale * crop.zoom;
    const imgW = crop.img.naturalWidth * scale;
    const imgH = crop.img.naturalHeight * scale;
    const x = PREVIEW_SIZE / 2 + crop.offsetX - imgW / 2;
    const y = PREVIEW_SIZE / 2 + crop.offsetY - imgH / 2;
    ctx.drawImage(crop.img, x, y, imgW, imgH);
    ctx.restore();
  }, [crop, shape]);

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

  const setZoom = useCallback((zoom: number) => {
    setCrop(prev => {
      if (!prev) return prev;
      const scale = prev.baseScale * zoom;
      const halfW = (prev.img.naturalWidth * scale) / 2;
      const halfH = (prev.img.naturalHeight * scale) / 2;
      const maxX = Math.max(0, halfW - PREVIEW_SIZE / 2);
      const maxY = Math.max(0, halfH - PREVIEW_SIZE / 2);
      return {
        ...prev, zoom,
        offsetX: Math.max(-maxX, Math.min(maxX, prev.offsetX)),
        offsetY: Math.max(-maxY, Math.min(maxY, prev.offsetY)),
      };
    });
  }, []);

  const handleConfirm = async () => {
    if (!crop || !outputCanvasRef.current) return;
    setUploading(true);
    try {
      const canvas = outputCanvasRef.current;
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      clipShape(ctx, OUTPUT_SIZE, shape);
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
        body: JSON.stringify({ name: 'icon.jpg', size: blob.size, contentType: 'image/jpeg' }),
      });
      if (!metaRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await metaRes.json();
      await fetch(uploadURL, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      onComplete(`${base}api/storage${objectPath}`);
      setCrop(null);
    } catch (err) {
      console.error('[ImageCrop] Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  if (crop) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Drag to reposition · scroll or slide to zoom</p>
        <canvas
          ref={previewCanvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          className="cursor-grab active:cursor-grabbing select-none shrink-0"
          style={{
            borderRadius: shape === 'circle' ? '50%' : `${SQUARE_RADIUS}px`,
            border: '3px solid hsl(var(--primary))',
            display: 'block',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={(e) => { e.preventDefault(); setZoom(Math.max(1, Math.min(4, crop.zoom - e.deltaY * 0.002))); }}
        />
        <div className="w-full flex items-center gap-2">
          <ZoomIn size={16} className="text-muted-foreground shrink-0" />
          <Slider value={[crop.zoom]} min={1} max={4} step={0.01} onValueChange={([v]) => setZoom(v)} className="flex-1" />
        </div>
        <div className="flex gap-2 w-full">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setCrop(null)}>Cancel</Button>
          <Button variant="ghost" size="sm" onClick={() => setCrop(prev => prev ? { ...prev, offsetX: 0, offsetY: 0, zoom: 1 } : prev)}>
            <RotateCcw size={14} />
          </Button>
          <Button size="sm" className="flex-1" onClick={handleConfirm} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {uploading ? 'Uploading…' : 'Apply'}
          </Button>
        </div>
        <canvas ref={outputCanvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
        {shape === 'circle' ? (
          <Avatar className="h-[88px] w-[88px]">
            <AvatarImage src={current || undefined} />
            <AvatarFallback className="bg-primary text-white text-2xl">
              {placeholder ?? <Camera size={28} />}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              'w-[88px] h-[88px] flex items-center justify-center overflow-hidden bg-secondary text-foreground text-2xl font-bold',
            )}
            style={{ borderRadius: `${SQUARE_RADIUS * 0.44}px` }}
          >
            {current
              ? <img src={current} alt="Server icon" className="w-full h-full object-cover" />
              : (placeholder ?? <Camera size={28} className="text-muted-foreground" />)
            }
          </div>
        )}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
            shape === 'circle' ? 'rounded-full' : '',
          )}
          style={shape === 'square' ? { borderRadius: `${SQUARE_RADIUS * 0.44}px` } : undefined}
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
