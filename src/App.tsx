import { useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import DemoBanner from './components/DemoBanner';
import WelcomeScreen from './components/WelcomeScreen';
import PhotoCapture from './components/PhotoCapture';
import PhotoUpload from './components/PhotoUpload';
import VariationSelection from './components/VariationSelection';
import ResultsDisplay from './components/ResultsDisplay';
import LoadingState from './components/LoadingState';
import { enhanceImage, resizeImageIfNeeded } from './services/imageEnhancement';
import { validateImageForProfile } from './services/imageValidation';
import { AppStep, InputMode, PhotoState, VariationStatus } from './types';
import { AUTO_VARIATION_PROMPTS } from './constants';

const VARIATION_COUNT = AUTO_VARIATION_PROMPTS.length;

function App() {
  const [step, setStep] = useState<AppStep>('welcome');
  const [inputMode, setInputMode] = useState<InputMode | null>(null);
  const [photoState, setPhotoState] = useState<PhotoState>({
    original: null,
    enhanced: null,
    file: null,
  });
  const [variationStatus, setVariationStatus] = useState<VariationStatus[]>(
    Array(VARIATION_COUNT).fill('pending')
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [validationError, setValidationError] = useState<{ message: string; file: File } | null>(null);
  const [showCapture, setShowCapture] = useState(false);

  // Refs, not state: these are read inside async generation flows that start
  // in the same tick the value is decided — state would be a stale closure
  // (which is exactly the bug this replaces: person-removal never applied
  // on the first generation pass).
  const personRemovalRef = useRef(false);
  const resizedFileRef = useRef<File | null>(null);
  const originalUrlRef = useRef<string | null>(null);

  const releaseOriginalUrl = () => {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
      originalUrlRef.current = null;
    }
  };

  /* One pipeline for capture, upload, and validation override —
   * the three previous handlers shared ~90% of their bodies. */
  const processPhoto = async (file: File, { skipValidation = false } = {}) => {
    setError('');
    setValidationError(null);
    personRemovalRef.current = false;

    if (!skipValidation) {
      setIsProcessing(true);
      const validationResult = await validateImageForProfile(file);
      setIsProcessing(false);

      if (!validationResult.isValid) {
        setValidationError({
          message: validationResult.error || 'We couldn’t read that photo clearly. Please try another.',
          file,
        });
        setInputMode(null);
        return;
      }
      personRemovalRef.current = validationResult.needsPersonRemoval || false;
    }

    releaseOriginalUrl();
    const originalUrl = URL.createObjectURL(file);
    originalUrlRef.current = originalUrl;

    setPhotoState({
      original: originalUrl,
      enhanced: null,
      file,
      variations: Array(VARIATION_COUNT).fill(null),
    });
    // Move to the grid immediately — variations fill in as each one lands.
    setStep('variations');
    await generateVariations(file, personRemovalRef.current);
  };

  const runVariation = async (resizedFile: File, index: number, personRemoval: boolean) => {
    setVariationStatus(prev => prev.map((s, i) => (i === index ? 'pending' : s)));
    const result = await enhanceImage(
      resizedFile,
      AUTO_VARIATION_PROMPTS[index].prompt,
      undefined,
      personRemoval
    );
    if (result.success && result.enhancedImageUrl) {
      setPhotoState(prev => ({
        ...prev,
        variations: (prev.variations ?? Array(VARIATION_COUNT).fill(null)).map((v, i) =>
          i === index ? result.enhancedImageUrl! : v
        ),
      }));
      setVariationStatus(prev => prev.map((s, i) => (i === index ? 'done' : s)));
    } else {
      setVariationStatus(prev => prev.map((s, i) => (i === index ? 'failed' : s)));
    }
    return result;
  };

  const generateVariations = async (file: File, personRemoval: boolean) => {
    setVariationStatus(Array(VARIATION_COUNT).fill('pending'));
    try {
      const resizedFile = await resizeImageIfNeeded(file);
      resizedFileRef.current = resizedFile;

      // allSettled + per-slot updates: one failed call no longer throws away
      // three successful (paid) generations behind a single error screen.
      const results = await Promise.allSettled(
        AUTO_VARIATION_PROMPTS.map((_, i) => runVariation(resizedFile, i, personRemoval))
      );

      const outcomes = results.map(r => (r.status === 'fulfilled' ? r.value : { success: false, error: 'Unexpected error' }));
      if (outcomes.every(o => !o.success)) {
        const firstError = outcomes.find(o => o.error)?.error;
        setError(firstError || 'We couldn’t generate portraits from that photo. Please try another.');
        setStep('welcome');
        setInputMode(null);
      }
    } catch (err) {
      console.error('Variation generation error:', err);
      setError('An unexpected error occurred. Please try again.');
      setStep('welcome');
    }
  };

  /* Regenerate a single style without redoing all four. */
  const handleRetryVariation = async (index: number) => {
    const resizedFile = resizedFileRef.current ?? (photoState.file ? await resizeImageIfNeeded(photoState.file) : null);
    if (!resizedFile) return;
    setError('');
    await runVariation(resizedFile, index, personRemovalRef.current);
  };

  const handleSelectMode = (mode: InputMode) => {
    setInputMode(mode);
    if (mode === 'camera') {
      setShowCapture(true);
    } else {
      setStep('input');
    }
  };

  const handlePhotoCapture = (file: File) => {
    setShowCapture(false);
    processPhoto(file);
  };

  const handlePhotoUpload = (file: File) => {
    processPhoto(file);
  };

  const handleOverrideValidation = () => {
    if (!validationError?.file) return;
    const file = validationError.file;
    setValidationError(null);
    processPhoto(file, { skipValidation: true });
  };

  const handleSelectVariation = (variationUrl: string) => {
    setPhotoState(prev => ({ ...prev, enhanced: variationUrl }));
    setStep('results');
  };

  const handleCustomEnhancement = async (prompt: string) => {
    if (!photoState.file) return;
    setIsProcessing(true);
    setError('');

    try {
      const resizedFile = resizedFileRef.current ?? (await resizeImageIfNeeded(photoState.file));
      const result = await enhanceImage(resizedFile, prompt, undefined, personRemovalRef.current);

      if (result.success && result.enhancedImageUrl) {
        setPhotoState(prev => ({ ...prev, enhanced: result.enhancedImageUrl! }));
        setStep('results');
      } else {
        setError(result.error || 'Failed to enhance image. Please try again.');
      }
    } catch (err) {
      console.error('Enhancement error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTryAgain = () => {
    setPhotoState(prev => ({ ...prev, enhanced: null }));
    setStep('variations');
  };

  const handleUseOriginal = () => {
    if (photoState.original) {
      const ext = photoState.file?.type === 'image/png' ? 'png'
        : photoState.file?.type === 'image/heic' ? 'heic'
        : 'jpg';
      const link = document.createElement('a');
      link.href = photoState.original;
      link.download = `lumiere-portrait-original.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleBack = () => {
    if (step === 'input' || step === 'variations') {
      releaseOriginalUrl();
      resizedFileRef.current = null;
      setStep('welcome');
      setInputMode(null);
      setPhotoState({ original: null, enhanced: null, file: null });
      setVariationStatus(Array(VARIATION_COUNT).fill('pending'));
    } else if (step === 'results') {
      setStep('variations');
    }
  };

  const handleCancelCapture = () => {
    setShowCapture(false);
    setInputMode(null);
  };

  const handleDismissValidationError = () => {
    setValidationError(null);
    setInputMode(null);
  };

  return (
    <div className="relative min-h-screen bg-[#F9F9F8] overflow-x-hidden">
      <DemoBanner />

      {showCapture && (
        <PhotoCapture onCapture={handlePhotoCapture} onCancel={handleCancelCapture} />
      )}

      {isProcessing && <LoadingState />}

      {/* Validation error — bottom-center black toast */}
      {validationError && (
        <div
          className="fixed bottom-8 left-1/2 z-50 animate-toast-up w-full max-w-lg px-4"
          style={{ transform: 'translateX(-50%)' }}
          role="alert"
        >
          <div className="bg-[#111111] border border-white/20 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs tracking-wide text-white leading-relaxed mb-3">
                  {validationError.message}
                </p>
                <div className="flex gap-6">
                  <button
                    onClick={handleDismissValidationError}
                    className="text-xs tracking-widest uppercase text-white/60 hover:text-white transition-colors duration-300 cursor-pointer"
                  >
                    Try Another
                  </button>
                  <button
                    onClick={handleOverrideValidation}
                    className="text-xs tracking-widest uppercase text-white hover:text-white/70 transition-colors duration-300 underline underline-offset-4 cursor-pointer"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismissValidationError}
                className="text-white/50 hover:text-white transition-colors duration-300 flex-shrink-0 cursor-pointer"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 container mx-auto px-6 sm:px-12 lg:px-24 py-12 sm:py-16 lg:py-24">
        {step !== 'welcome' && !showCapture && (
          <div className="mb-10 sm:mb-14 animate-fade-up">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-luxury-gray-medium hover:text-luxury-navy transition-colors duration-300 min-h-[44px] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-10 animate-toast-drop" role="alert">
            <div className="bg-[#111111] border border-white/20 px-6 py-4">
              <p className="font-serif italic text-sm text-white text-center mb-1">A moment, please</p>
              <p className="text-xs tracking-wide text-white/80 text-center">{error}</p>
            </div>
          </div>
        )}

        {step === 'welcome' && <WelcomeScreen onSelectMode={handleSelectMode} />}

        {step === 'input' && inputMode === 'upload' && (
          <PhotoUpload onUpload={handlePhotoUpload} />
        )}

        {step === 'variations' && photoState.original && photoState.variations && (
          <VariationSelection
            variations={photoState.variations}
            statuses={variationStatus}
            onSelectVariation={handleSelectVariation}
            onCustomEnhancement={handleCustomEnhancement}
            onRetryVariation={handleRetryVariation}
            isProcessing={isProcessing}
          />
        )}

        {step === 'results' && photoState.original && photoState.enhanced && (
          <ResultsDisplay
            originalImage={photoState.original}
            enhancedImage={photoState.enhanced}
            onTryAgain={handleTryAgain}
            onUseOriginal={handleUseOriginal}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}

function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <footer className="relative z-10 border-t border-[#111111]/10 mt-16 sm:mt-24">
      <div className="container mx-auto px-6 sm:px-12 lg:px-24 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs tracking-widest uppercase text-luxury-gray-light">
            Lumière Collective &mdash; Portrait Atelier
          </p>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs tracking-widest uppercase text-luxury-gray-light hover:text-luxury-navy transition-colors duration-300 flex items-center gap-2 cursor-pointer min-h-[44px]"
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Privacy & Details'}
            <span
              className="inline-block transition-transform duration-300"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ↓
            </span>
          </button>
        </div>

        <div className={`lc-accordion-body ${open ? 'is-open' : ''}`}>
          <div>
            <div className="pt-6 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-[#111111]/10 mt-4">
              <p className="text-xs text-luxury-gray-light leading-relaxed">
                <span className="text-luxury-gray-medium">Privacy.</span>{' '}
                All photos are processed in memory and never stored on our servers. Each session is ephemeral and encrypted in transit.
              </p>
              <p className="text-xs text-luxury-gray-light leading-relaxed">
                <span className="text-luxury-gray-medium">Enhancement.</span>{' '}
                AI enhancements are applied to background, lighting, and attire only. Facial features are preserved exactly as photographed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default App;
