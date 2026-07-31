import { X, Check } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

interface PreviewModalProps {
  imageUrl: string;
  label: string;
  onClose: () => void;
  onConfirm: () => void;
}

/* Everything that can hold focus inside the panel, in DOM order.
 * Queried on each Tab rather than cached: the footer buttons are always
 * present, but caching would silently stop working the moment anything
 * conditional is added here. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function PreviewModal({ imageUrl, label, onClose, onConfirm }: PreviewModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /* A modal that does not trap focus is a modal in appearance only: Tab
   * walks straight out into the page behind it, where a screen-reader or
   * keyboard user is then operating controls they cannot see. The panel
   * also takes focus on open and hands it back to whatever opened it on
   * close, so Tab order resumes where the user left it rather than at the
   * top of the document. */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends. The panel itself is focusable but not in the
      // list, so an unmoved initial focus lands on `first` as expected.
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(17,17,17,0.7)', backdropFilter: 'blur(8px)' }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-[#F9F9F8] max-w-4xl w-full max-h-[90vh] overflow-hidden border border-[#111111]/15 animate-fade-up focus:outline-none"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-b border-[#111111]/10">
          <h3
            id={titleId}
            className="font-serif italic text-xl sm:text-2xl font-light text-[#111111] tracking-tight"
          >
            {label}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#111111]/5 transition-all duration-300 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
            aria-label="Close preview"
          >
            <X className="w-4 h-4 text-luxury-gray-medium" />
          </button>
        </div>

        {/* Image */}
        <div className="p-6 sm:p-8 overflow-y-auto max-h-[calc(90vh-160px)]">
          <img
            src={imageUrl}
            alt={label}
            className="w-full max-w-2xl mx-auto"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 px-6 sm:px-8 py-4 border-t border-[#111111]/10">
          <button
            onClick={onClose}
            className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-transparent border border-[#111111]/20 text-[#111111] text-xs tracking-widest uppercase font-medium hover:border-[#111111] transition-all duration-500 min-h-[48px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
          >
            View Other Options
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium hover:bg-[#111111]/80 transition-all duration-500 flex items-center justify-center gap-2 min-h-[48px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
          >
            <Check className="w-3.5 h-3.5" />
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
