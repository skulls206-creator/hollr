import { useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  {
    category: 'Navigation',
    items: [
      { keys: ['Alt', '↑ / ↓'], description: 'Navigate between channels' },
      { keys: ['Ctrl', 'K'], description: 'Quick open channel/DM switcher' },
      { keys: ['Esc'], description: 'Close current panel or modal' },
    ],
  },
  {
    category: 'Messaging',
    items: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line in message' },
      { keys: ['↑'], description: 'Edit your last message (when input is empty)' },
      { keys: ['Esc'], description: 'Cancel editing a message' },
    ],
  },
  {
    category: 'Sidebar',
    items: [
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle member list' },
      { keys: ['Ctrl', 'Shift', 'H'], description: 'Toggle chat header buttons' },
    ],
  },
  {
    category: 'Voice',
    items: [
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Deafen / Undeafen' },
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Mute / Unmute microphone' },
    ],
  },
];

export function HelpModal() {
  const { helpModalOpen, setHelpModalOpen } = useAppStore();

  useEffect(() => {
    if (!helpModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelpModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpModalOpen, setHelpModalOpen]);

  if (!helpModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setHelpModalOpen(false)}>
      <div
        className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Keyboard size={20} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setHelpModalOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6 no-scrollbar">
          {SHORTCUTS.map(section => (
            <div key={section.category}>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-foreground">{item.description}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-4">
                      {item.keys.map((key, ki) => (
                        <span key={ki}>
                          <kbd className="bg-[#1E1F22] border border-border/40 text-foreground text-xs font-mono px-2 py-0.5 rounded shadow-sm">
                            {key}
                          </kbd>
                          {ki < item.keys.length - 1 && (
                            <span className="text-muted-foreground text-xs mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-border/10 shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="bg-[#1E1F22] border border-border/40 text-foreground text-xs font-mono px-1.5 py-0.5 rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
