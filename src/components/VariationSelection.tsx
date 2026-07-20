import { useState } from 'react';
import { Check, Sparkles, Eye, AlertCircle, Info, RotateCcw } from 'lucide-react';
import { MAX_CUSTOM_PROMPT_LENGTH, AUTO_VARIATION_PROMPTS } from '../constants';
import { validateCustomPrompt } from '../services/imageValidation';
import { VariationStatus } from '../types';
import PreviewModal from './PreviewModal';

interface VariationSelectionProps {
  variations: (string | null)[];
  statuses: VariationStatus[];
  onSelectVariation: (variationUrl: string) => void;
  onCustomEnhancement: (prompt: string) => void;
  onRetryVariation: (index: number) => void;
  isProcessing: boolean;
}

const EXAMPLE_PROMPTS = [
  'Softer lighting with warm golden tones and a blurred neutral background',
  'Crisp natural light with a clean white wall background',
  'Warm indoor ambiance with elegant, softly lit surroundings',
];

export default function VariationSelection({
  variations,
  statuses,
  onSelectVariation,
  onCustomEnhancement,
  onRetryVariation,
  isProcessing,
}: VariationSelectionProps) {
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [promptError, setPromptError] = useState<string>('');
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());

  const stillDeveloping = statuses.some(s => s === 'pending');

  const handleSelectVariant = (variantUrl: string) => {
    setSelectedVariant(variantUrl);
    onSelectVariation(variantUrl);
  };

  const handleCustomSubmit = () => {
    if (!customPrompt.trim()) return;
    const validation = validateCustomPrompt(customPrompt.trim());
    if (!validation.isValid) {
      setPromptError(validation.error || 'Invalid prompt');
      return;
    }
    setPromptError('');
    onCustomEnhancement(customPrompt.trim());
  };

  const handlePromptChange = (value: string) => {
    setCustomPrompt(value.slice(0, MAX_CUSTOM_PROMPT_LENGTH));
    if (promptError) setPromptError('');
  };

  const handleImageLoad = (index: number) => {
    setRevealedCards(prev => new Set(prev).add(index));
  };

  return (
    <div className="w-full max-w-6xl mx-auto">

      {/* Header */}
      <div className="text-center mb-16 md:mb-20 px-4 animate-fade-up">
        <h2 className="font-serif italic text-4xl sm:text-5xl md:text-6xl font-light text-[#111111] mb-5 tracking-tight">
          Select Your Portrait
        </h2>
        <p className="text-xs tracking-widest uppercase text-luxury-gray-medium font-light max-w-xl mx-auto" aria-live="polite">
          {stillDeveloping
            ? 'Four styles, developing now — each appears as it finishes.'
            : 'Four styles for your member profile. Choose one, or request something custom.'}
        </p>
      </div>

      {/* Editorial grid — slots fill progressively as each generation lands */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 lg:gap-12 mb-16 md:mb-20">
        {variations.map((url, index) => {
          const status = statuses[index];
          const isSelected = url !== null && selectedVariant === url;
          const isRevealed = revealedCards.has(index);
          return (
            <div
              key={index}
              className="flex flex-col animate-fade-up"
              style={{
                animationDelay: `${0.1 + index * 0.1}s`,
                marginTop: index % 2 === 1 ? 'clamp(0px, 2.5vw, 32px)' : '0px',
              }}
            >
              {/* Card */}
              <div
                className={`relative overflow-hidden border flex flex-col group transition-all duration-700
                  ${isSelected
                    ? 'border-[#111111]'
                    : 'border-[#111111]/15 hover:border-[#111111]/40'
                  }
                  ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
                `}
              >
                {/* Header label */}
                <div className="px-4 pt-4 pb-3 border-b border-[#111111]/8">
                  <div className="text-xs tracking-widest uppercase text-[#111111] font-medium mb-1">
                    {AUTO_VARIATION_PROMPTS[index].label}
                  </div>
                  <div className="text-xs text-luxury-gray-medium font-light leading-snug tracking-wide">
                    {AUTO_VARIATION_PROMPTS[index].description}
                  </div>
                </div>

                {/* Image slot — reserved aspect box prevents layout shift */}
                <div className="lc-kb-wrap aspect-[4/5] w-full overflow-hidden relative">
                  {status === 'done' && url && (
                    <img
                      src={url}
                      alt={AUTO_VARIATION_PROMPTS[index].label}
                      className={`lc-kb-img w-full h-full object-cover ${isRevealed ? 'darkroom-reveal' : 'darkroom-pending'}`}
                      loading="eager"
                      onLoad={() => handleImageLoad(index)}
                    />
                  )}
                  {status === 'pending' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111111]/[0.03] animate-pulse">
                      <span className="font-serif italic text-sm text-[#111111]/50">Developing&hellip;</span>
                    </div>
                  )}
                  {status === 'failed' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#111111]/[0.03] px-4 text-center">
                      <span className="font-serif italic text-sm text-[#111111]/60">This one didn&rsquo;t develop</span>
                      <button
                        onClick={() => onRetryVariation(index)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#111111]/25 text-[#111111] text-xs tracking-widest uppercase font-medium hover:border-[#111111] transition-all duration-500 min-h-[44px] cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Redo
                      </button>
                    </div>
                  )}
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-[#111111] text-white p-1.5 z-10">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => url && setPreviewImage({ url, label: AUTO_VARIATION_PROMPTS[index].label })}
                  disabled={isProcessing || status !== 'done'}
                  className="flex-1 px-3 py-3 bg-transparent text-[#111111] border border-[#111111]/20 hover:border-[#111111] transition-all duration-500 flex items-center justify-center gap-2 text-xs tracking-widest uppercase font-medium min-h-[44px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Preview ${AUTO_VARIATION_PROMPTS[index].label}`}
                >
                  <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => url && handleSelectVariant(url)}
                  disabled={isProcessing || status !== 'done'}
                  className="flex-1 px-3 py-3 bg-[#111111] text-white border border-[#111111] hover:bg-[#111111]/80 flex items-center justify-center gap-2 text-xs tracking-widest uppercase font-medium min-h-[44px] transition-colors duration-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Select ${AUTO_VARIATION_PROMPTS[index].label}`}
                >
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Select</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom enhancement toggle */}
      {!showCustom && (
        <div className="text-center px-4 animate-fade-up animate-fade-up-d3">
          <button
            onClick={() => setShowCustom(true)}
            className="inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 bg-transparent border border-[#111111]/25 text-[#111111] text-xs tracking-widest uppercase font-medium hover:border-[#111111] transition-all duration-500 min-h-[48px] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            Request Custom Enhancement
          </button>
        </div>
      )}

      {/* Custom enhancement panel */}
      {showCustom && (
        <div className="mt-8 sm:mt-10 border border-[#111111]/15 p-6 sm:p-8 animate-toast-drop">
          <div className="mb-5">
            <h3 className="font-serif italic text-2xl sm:text-3xl font-light text-[#111111] mb-2 tracking-tight">
              Personalized Enhancement
            </h3>
            <p className="text-xs tracking-widest uppercase text-luxury-gray-medium font-light mb-5">
              Describe the look you want — lighting, background, or color adjustments.
            </p>

            {/* Guardrails info */}
            <div className="p-4 border border-[#111111]/10 mb-1">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-3.5 h-3.5 text-[#111111]/50 flex-shrink-0" />
                <span className="text-xs tracking-widest uppercase text-[#111111]/50">What works well</span>
              </div>
              <ul className="space-y-2 ml-5">
                {EXAMPLE_PROMPTS.map((ex, i) => (
                  <li
                    key={i}
                    className="text-xs text-luxury-gray-medium font-light leading-relaxed cursor-pointer hover:text-[#111111] transition-colors duration-300"
                    onClick={() => { setCustomPrompt(ex); setPromptError(''); }}
                  >
                    &ldquo;{ex}&rdquo;
                  </li>
                ))}
              </ul>
              <p className="text-xs text-luxury-gray-light mt-3 ml-5 leading-relaxed">
                Not supported: face modifications, fantasy elements, age changes, or multiple people.
              </p>
            </div>
          </div>

          <textarea
            value={customPrompt}
            onChange={e => handlePromptChange(e.target.value)}
            placeholder="Describe your enhancement..."
            className={`w-full p-4 text-sm border focus:outline-none resize-none font-light transition-all duration-300 bg-white text-[#111111] ${
              promptError
                ? 'border-red-400'
                : 'border-[#111111]/15 focus:border-[#111111]'
            }`}
            rows={3}
            disabled={isProcessing}
            aria-label="Custom enhancement prompt"
          />

          {promptError && (
            <div className="mt-3 p-3 border border-red-200 flex items-start gap-3 animate-toast-drop" role="alert">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs tracking-wide text-red-700 font-light">{promptError}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-5">
            <span className={`text-xs tracking-widest uppercase transition-colors duration-300 ${
              customPrompt.length >= MAX_CUSTOM_PROMPT_LENGTH ? 'text-red-400' : 'text-luxury-gray-light'
            }`}>
              {customPrompt.length} / {MAX_CUSTOM_PROMPT_LENGTH}
            </span>
            <div className="flex gap-3 sm:gap-4 w-full sm:w-auto">
              <button
                onClick={() => { setShowCustom(false); setCustomPrompt(''); setPromptError(''); }}
                className="flex-1 sm:flex-none px-5 sm:px-6 py-3 text-xs tracking-widest uppercase text-luxury-gray-medium hover:text-[#111111] transition-colors duration-300 font-medium min-h-[44px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomSubmit}
                disabled={!customPrompt.trim() || isProcessing}
                className="flex-1 sm:flex-none px-6 sm:px-8 py-3 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium transition-all duration-500 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] hover:bg-[#111111]/80 cursor-pointer"
              >
                Apply Enhancement
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <PreviewModal
          imageUrl={previewImage.url}
          label={previewImage.label}
          onClose={() => setPreviewImage(null)}
          onConfirm={() => {
            handleSelectVariant(previewImage.url);
            setPreviewImage(null);
          }}
        />
      )}
    </div>
  );
}
