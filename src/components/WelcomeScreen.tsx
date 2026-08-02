import { Camera, Upload } from 'lucide-react';
import { useState } from 'react';

interface WelcomeScreenProps {
  onSelectMode: (mode: 'camera' | 'upload') => void;
}

export default function WelcomeScreen({ onSelectMode }: WelcomeScreenProps) {
  const [tipsOpen, setTipsOpen] = useState(false);

  return (
    <div className="w-full max-w-4xl mx-auto">

      {/* Logotype */}
      <div className="text-center mb-16 md:mb-24">
        <div className="flex justify-center mb-10 md:mb-14">
          <div className="text-center space-y-4">
            <div
              className="font-serif text-[#111111] text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light animate-logo-reveal"
              style={{ letterSpacing: '0.3em' }}
            >
              LUMIÈRE
            </div>
            <div className="h-px w-16 sm:w-20 md:w-28 mx-auto bg-[#111111]/20" />
            <div
              className="font-serif text-[#111111] text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light animate-logo-sub"
              style={{ letterSpacing: '0.2em' }}
            >
              COLLECTIVE
            </div>
          </div>
        </div>

        {/* Hero title */}
        <h1 className="animate-fade-up animate-fade-up-d1 font-serif italic text-3xl sm:text-4xl md:text-5xl font-light text-[#111111] mb-5 leading-tight tracking-tight px-4">
          The Member Directory Portrait Atelier
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-up animate-fade-up-d2 text-xs sm:text-sm tracking-widest uppercase text-luxury-gray-medium font-light px-4 mb-4">
          An elegant portrait for our global travel community.
        </p>

        {/* Supporting text */}
        <p className="animate-fade-up animate-fade-up-d3 text-sm text-luxury-gray-medium leading-relaxed max-w-xl mx-auto font-light px-4">
          A polished portrait for your member profile, in under a minute. Upload a photo or capture one now — we refine the lighting, background, and framing. Your face stays exactly yours.
        </p>
      </div>

      {/* Mode cards */}
      <div className="animate-fade-up animate-fade-up-d4 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-16 md:mb-24">
        <button
          onClick={() => onSelectMode('camera')}
          className="lc-card group p-10 sm:p-12 md:p-16 bg-white border border-[#111111]/12 hover:border-[#111111]/40 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2 cursor-pointer"
          aria-label="Capture new portrait with camera"
        >
          <div className="lc-card-icon w-12 h-12 border border-[#111111]/20 flex items-center justify-center mx-auto mb-8 group-hover:border-[#111111]/60 transition-colors duration-500">
            <Camera className="w-5 h-5 text-[#111111]" />
          </div>
          <h2 className="text-xs tracking-widest uppercase text-[#111111] font-medium mb-3 text-center transition-all duration-700 group-hover:tracking-widest">
            Capture a Portrait
          </h2>
          <p className="text-xs text-luxury-gray-medium leading-relaxed font-light text-center transition-all duration-700 group-hover:tracking-wide">
            Use your camera for a quick portrait
          </p>
        </button>

        <button
          onClick={() => onSelectMode('upload')}
          className="lc-card group p-10 sm:p-12 md:p-16 bg-white border border-[#111111]/12 hover:border-[#111111]/40 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2 cursor-pointer"
          aria-label="Upload existing portrait"
        >
          <div className="lc-card-icon w-12 h-12 border border-[#111111]/20 flex items-center justify-center mx-auto mb-8 group-hover:border-[#111111]/60 transition-colors duration-500">
            <Upload className="w-5 h-5 text-[#111111]" />
          </div>
          <h2 className="text-xs tracking-widest uppercase text-[#111111] font-medium mb-3 text-center transition-all duration-700 group-hover:tracking-widest">
            Upload a Photo
          </h2>
          <p className="text-xs text-luxury-gray-medium leading-relaxed font-light text-center transition-all duration-700 group-hover:tracking-wide">
            Upload a photo you already like
          </p>
        </button>
      </div>

      {/* Registry Portrait Standards accordion */}
      <div className="animate-fade-up animate-fade-up-d4">
        <div className="border-t border-[#111111]/10">
          <button
            onClick={() => setTipsOpen(o => !o)}
            className="w-full flex items-center justify-between py-5 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
            aria-expanded={tipsOpen}
          >
            <span className="text-xs tracking-widest uppercase text-luxury-gray-light font-medium opacity-60 group-hover:opacity-100 transition-opacity duration-500">
              Registry Portrait Standards &amp; Privacy Assurance
            </span>
            <span
              className="text-luxury-gray-light opacity-50 group-hover:opacity-100 transition-all duration-500 text-xs"
              style={{ transform: tipsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease' }}
              aria-hidden="true"
            >
              ↓
            </span>
          </button>

          <div className={`lc-accordion-body ${tipsOpen ? 'is-open' : ''}`}>
            <div>
              <div className="pb-4 grid grid-cols-1 sm:grid-cols-3 gap-8">
                <p className="text-xs text-luxury-gray-medium leading-relaxed">
                  One person per portrait, framed head and shoulders.
                </p>
                <p className="text-xs text-luxury-gray-medium leading-relaxed">
                  Clear, even lighting with your face fully visible.
                </p>
                <p className="text-xs text-luxury-gray-medium leading-relaxed">
                  A simple background helps &mdash; we&rsquo;ll refine the rest.
                </p>
              </div>
              <p className="pb-8 text-xs text-luxury-gray-medium leading-relaxed">
                <span className="text-[#111111]">Privacy.</span> Photos are processed in memory and never stored &mdash; each session is ephemeral, encrypted in transit. Enhancement is performed by Google&rsquo;s Gemini API, which does not use your photo for model training.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
