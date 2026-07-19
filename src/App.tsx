import { useState } from 'react';
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
import { AppStep, InputMode, PhotoState } from './types';
import { AUTO_VARIATION_PROMPTS } from './constants';

function App() {
  const [step, setStep] = useState<AppStep>('welcome');
  const [inputMode, setInputMode] = useState<InputMode | null>(null);
  const [photoState, setPhotoState] = useState<PhotoState>({
    original: null,
    enhanced: null,
    file: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [validationError, setValidationError] = useState<{ message: string; file: File } | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [needsPersonRemoval, setNeedsPersonRemoval] = useState(false);

  const handleSelectMode = (mode: InputMode) => {
    setInputMode(mode);
    if (mode === 'camera') {
      setShowCapture(true);
    } else {
      setStep('input');
    }
  };

  const handlePhotoCapture = async (file: File) => {
    setShowCapture(false);
    setIsProcessing(true);
    setError('');
    setValidationError(null);
    setNeedsPersonRemoval(false);

    const validationResult = await validateImageForProfile(file);

    if (!validationResult.isValid) {
      setIsProcessing(false);
      setValidationError({
        message: validationResult.error || 'Photo validation failed. Please try another photo.',
        file,
      });
      setInputMode(null);
      return;
    }

    setNeedsPersonRemoval(validationResult.needsPersonRemoval || false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      setPhotoState({
        original: e.target?.result as string,
        enhanced: null,
        file,
        variations: { variant1: null, variant2: null, variant3: null, variant4: null },
      });
      await generateVariations(file);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async (file: File) => {
    setIsProcessing(true);
    setError('');
    setValidationError(null);
    setNeedsPersonRemoval(false);

    const validationResult = await validateImageForProfile(file);

    if (!validationResult.isValid) {
      setIsProcessing(false);
      setValidationError({
        message: validationResult.error || 'Photo validation failed. Please try another photo.',
        file,
      });
      return;
    }

    setNeedsPersonRemoval(validationResult.needsPersonRemoval || false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      setPhotoState({
        original: e.target?.result as string,
        enhanced: null,
        file,
        variations: { variant1: null, variant2: null, variant3: null, variant4: null },
      });
      await generateVariations(file);
    };
    reader.readAsDataURL(file);
  };

  const generateVariations = async (file: File) => {
    setIsProcessing(true);
    setError('');

    try {
      const resizedFile = await resizeImageIfNeeded(file);

      const [result1, result2, result3, result4] = await Promise.all([
        enhanceImage(resizedFile, AUTO_VARIATION_PROMPTS[0].prompt, undefined, needsPersonRemoval),
        enhanceImage(resizedFile, AUTO_VARIATION_PROMPTS[1].prompt, undefined, needsPersonRemoval),
        enhanceImage(resizedFile, AUTO_VARIATION_PROMPTS[2].prompt, undefined, needsPersonRemoval),
        enhanceImage(resizedFile, AUTO_VARIATION_PROMPTS[3].prompt, undefined, needsPersonRemoval),
      ]);

      if (
        result1.success && result1.enhancedImageUrl &&
        result2.success && result2.enhancedImageUrl &&
        result3.success && result3.enhancedImageUrl &&
        result4.success && result4.enhancedImageUrl
      ) {
        setPhotoState(prev => ({
          ...prev,
          variations: {
            variant1: result1.enhancedImageUrl!,
            variant2: result2.enhancedImageUrl!,
            variant3: result3.enhancedImageUrl!,
            variant4: result4.enhancedImageUrl!,
          },
        }));
        setStep('variations');
      } else {
        const errorMsg = result1.error || result2.error || result3.error || result4.error || 'Failed to generate variations. Please try again.';
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('busy')) {
          setError('The enhancement service is momentarily busy. Please wait a moment and try again.');
        } else {
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error('Variation generation error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
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
      const resizedFile = await resizeImageIfNeeded(photoState.file);
      const result = await enhanceImage(resizedFile, prompt, undefined, needsPersonRemoval);

      if (result.success && result.enhancedImageUrl) {
        setPhotoState(prev => ({ ...prev, enhanced: result.enhancedImageUrl! }));
        setStep('results');
      } else {
        const errorMsg = result.error || 'Failed to enhance image. Please try again.';
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('busy')) {
          setError('The enhancement service is momentarily busy. Please wait a moment and try again.');
        } else {
          setError(errorMsg);
        }
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
      const link = document.createElement('a');
      link.href = photoState.original;
      link.download = `original-photo-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleBack = () => {
    if (step === 'input' || step === 'variations') {
      setStep('welcome');
      setInputMode(null);
      setPhotoState({ original: null, enhanced: null, file: null });
    } else if (step === 'results') {
      setStep('variations');
    }
  };

  const handleCancelCapture = () => {
    setShowCapture(false);
    setInputMode(null);
  };

  const handleOverrideValidation = async () => {
    if (!validationError?.file) return;
    const file = validationError.file;
    setValidationError(null);
    setNeedsPersonRemoval(false);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      setPhotoState({
        original: e.target?.result as string,
        enhanced: null,
        file,
        variations: { variant1: null, variant2: null, variant3: null, variant4: null },
      });
      await generateVariations(file);
    };
    reader.readAsDataURL(file);
  };

  const handleDismissValidationError = () => {
    setValidationError(null);
    setNeedsPersonRemoval(false);
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
                <p className="text-xs tracking-widest uppercase text-white leading-relaxed mb-3">
                  Subject unidentifiable. Please provide a clear, forward-facing portrait.
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
          <div className="max-w-2xl mx-auto mb-10 animate-toast-drop">
            <div className="bg-[#111111] border border-white/20 px-6 py-4">
              <p className="text-xs tracking-widest uppercase text-white text-center">{error}</p>
            </div>
          </div>
        )}

        {step === 'welcome' && <WelcomeScreen onSelectMode={handleSelectMode} />}

        {step === 'input' && inputMode === 'upload' && (
          <PhotoUpload onUpload={handlePhotoUpload} />
        )}

        {step === 'variations' && photoState.original && photoState.variations && (
          <VariationSelection
            variant1={photoState.variations.variant1 || photoState.original}
            variant2={photoState.variations.variant2 || photoState.original}
            variant3={photoState.variations.variant3 || photoState.original}
            variant4={photoState.variations.variant4 || photoState.original}
            onSelectVariation={handleSelectVariation}
            onCustomEnhancement={handleCustomEnhancement}
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
            Lumière Collective &mdash; AI-Powered Professional Photo Enhancement
          </p>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs tracking-widest uppercase text-luxury-gray-light hover:text-luxury-navy transition-colors duration-300 flex items-center gap-2 cursor-pointer"
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
              <p className="text-xs tracking-widest uppercase text-luxury-gray-light leading-relaxed">
                <span className="text-luxury-gray-medium">Privacy.</span>{' '}
                All photos are processed securely and are never stored on our servers. Each session is ephemeral and fully encrypted in transit.
              </p>
              <p className="text-xs tracking-widest uppercase text-luxury-gray-light leading-relaxed">
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
