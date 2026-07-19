import { X, Check } from 'lucide-react';
import { useEffect } from 'react';

interface PreviewModalProps {
  imageUrl: string;
  label: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function PreviewModal({ imageUrl, label, onClose, onConfirm }: PreviewModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(17,17,17,0.7)', backdropFilter: 'blur(8px)' }}
    >
      <div className="relative bg-[#F9F9F8] max-w-4xl w-full max-h-[90vh] overflow-hidden border border-[#111111]/15 animate-fade-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-b border-[#111111]/10">
          <h3 className="font-serif italic text-xl sm:text-2xl font-light text-[#111111] tracking-tight">{label}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#111111]/5 transition-all duration-300 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
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
            className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-transparent border border-[#111111]/20 text-[#111111] text-xs tracking-widest uppercase font-medium hover:border-[#111111] transition-all duration-500 min-h-[48px] cursor-pointer"
          >
            View Other Options
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium hover:bg-[#111111]/80 transition-all duration-500 flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
