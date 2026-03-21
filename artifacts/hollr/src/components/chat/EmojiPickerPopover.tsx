import { useRef, useEffect } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

interface Props {
  onEmojiClick: (emoji: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Which edge to anchor to. Default 'right' keeps right edge pinned (for toolbar buttons on the right).
   *  'left' keeps the left edge pinned so the picker opens rightward (for reaction pills on the left). */
  align?: 'left' | 'right';
}

export function EmojiPickerPopover({ onEmojiClick, onClose, anchorRef, align = 'right' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        (!anchorRef?.current || !anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, anchorRef]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiClick(emojiData.emoji);
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50"
      style={{ bottom: '100%', [align]: 0, marginBottom: '8px' }}
    >
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        theme={Theme.DARK}
        lazyLoadEmojis
        searchPlaceholder="Search emoji..."
        height={380}
        width={320}
      />
    </div>
  );
}
