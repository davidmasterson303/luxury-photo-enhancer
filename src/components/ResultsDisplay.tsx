import { useState } from 'react';
import { Download, ArrowLeft, CheckCircle, ZoomIn, Maximize2 } from 'lucide-react';

interface ResultsDisplayProps {
  originalImage: string;
  enhancedImage: string;
  onTryAgain: () => void;
  onUseOriginal: () => void;
}

export default function ResultsDisplay({
  originalImage,
  enhancedImage,
  onTryAgain,
  onUseOriginal,
}: ResultsDisplayProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'enhanced-only'>('slider');
  const [isZoomed, setIsZoomed] = useState(false);

  const handleDownload = async () => {
    try {
      const response = await fetch(enhancedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `enhanced-profile-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setSliderPosition(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    setSliderPosition(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  const viewBtnClass = (mode: typeof viewMode) =>
    `px-5 sm:px-7 py-2.5 sm:py-3 text-xs tracking-widest uppercase font-medium transition-all duration-300 min-h-[44px] focus:outline-none ${
      viewMode === mode
        ? 'bg-[#111111] text-white'
        : 'bg-transparent border border-[#111111]/20 text-[#111111] hover:border-[#111111] cursor-pointer'
    }`;

  return (
    <div className="w-full max-w-6xl mx-auto animate-fade-up">

      {/* Heading */}
      <div className="text-center mb-12 md:mb-16 px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-4">
          <CheckCircle className="w-6 h-6 text-luxury-gray-medium" />
          <h2 className="font-serif italic text-3xl sm:text-4xl md:text-5xl font-light text-[#111111] tracking-tight">
            Enhancement Complete
          </h2>
        </div>
        <p className="text-xs tracking-widest uppercase text-luxury-gray-medium font-light">
          Review your professionally enhanced profile photo
        </p>
      </div>

      {/* View toggle */}
      <div className="mb-8 md:mb-10">
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 px-4">
          <button onClick={() => setViewMode('slider')} className={viewBtnClass('slider')}>
            <span className="hidden sm:inline">Slider Comparison</span>
            <span className="sm:hidden">Slider</span>
          </button>
          <button onClick={() => setViewMode('side-by-side')} className={viewBtnClass('side-by-side')}>
            Side by Side
          </button>
          <button onClick={() => setViewMode('enhanced-only')} className={`${viewBtnClass('enhanced-only')} inline-flex items-center gap-2`}>
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Full View</span>
            <span className="sm:hidden">Full</span>
          </button>
        </div>
      </div>

      {/* Comparison views */}
      <div className="mb-10 md:mb-14">

        {viewMode === 'slider' && (
          <>
            <div
              className="relative w-full aspect-[4/5] max-w-2xl mx-auto overflow-hidden cursor-col-resize select-none touch-none border border-[#111111]/12"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              onTouchStart={() => setIsDragging(true)}
            >
              <img src={enhancedImage} alt="Enhanced" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}>
                <img src={originalImage} alt="Original" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              </div>

              {/* Slider line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/90"
                style={{ left: `${sliderPosition}%` }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white flex items-center justify-center cursor-grab active:cursor-grabbing">
                  <div className="flex gap-1">
                    <div className="w-px h-4 bg-[#111111]/40" />
                    <div className="w-px h-4 bg-[#111111]/40" />
                  </div>
                </div>
              </div>

              {/* Labels */}
              <div className="absolute top-4 left-4 bg-[#111111]/80 px-3 py-1.5">
                <p className="text-white text-xs tracking-widest uppercase">Original</p>
              </div>
              <div className="absolute top-4 right-4 bg-white/90 px-3 py-1.5">
                <p className="text-[#111111] text-xs tracking-widest uppercase">Enhanced</p>
              </div>
            </div>
            <p className="text-center text-xs tracking-widest uppercase text-luxury-gray-light mt-4 font-light px-4">
              Drag the slider to compare
            </p>
          </>
        )}

        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto px-4">
            {[
              { src: originalImage, label: 'Original' },
              { src: enhancedImage, label: 'Enhanced' },
            ].map(({ src, label }) => (
              <div key={label} className="relative overflow-hidden group border border-[#111111]/12">
                <div className="aspect-[4/5]">
                  <img
                    src={src}
                    alt={label}
                    className={`w-full h-full object-cover transition-transform duration-700 ${isZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'}`}
                    onClick={() => setIsZoomed(!isZoomed)}
                  />
                </div>
                <div className="absolute top-3 sm:top-4 left-3 sm:left-4 bg-[#111111]/80 px-3 py-1.5">
                  <p className="text-white text-xs tracking-widest uppercase">{label}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setIsZoomed(!isZoomed); }}
                  className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 p-2.5 bg-white md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4 text-[#111111]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'enhanced-only' && (
          <div className="relative max-w-3xl mx-auto overflow-hidden px-4 group">
            <div className="aspect-[4/5] border border-[#111111]/12">
              <img
                src={enhancedImage}
                alt="Enhanced photo"
                className={`w-full h-full object-cover transition-transform duration-700 ${isZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'}`}
                onClick={() => setIsZoomed(!isZoomed)}
              />
            </div>
            <button
              onClick={e => { e.stopPropagation(); setIsZoomed(!isZoomed); }}
              className="absolute bottom-5 sm:bottom-7 right-5 sm:right-7 p-3 bg-white md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              <ZoomIn className="w-4 h-4 text-[#111111]" />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-4 sm:gap-5 justify-center items-center px-4">
        <button
          onClick={handleDownload}
          className="w-full md:w-auto px-10 sm:px-14 py-4 sm:py-5 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium flex items-center justify-center gap-3 min-h-[52px] hover:bg-[#111111]/80 transition-colors duration-500 focus:outline-none focus:ring-1 focus:ring-[#111111] focus:ring-offset-2 cursor-pointer"
          aria-label="Download enhanced photo"
        >
          <Download className="w-4 h-4" />
          Download Portrait
        </button>

        <button
          onClick={onTryAgain}
          className="w-full md:w-auto px-10 sm:px-14 py-4 sm:py-5 bg-transparent text-[#111111] text-xs tracking-widest uppercase font-medium border border-[#111111]/20 hover:border-[#111111] flex items-center justify-center gap-3 min-h-[52px] transition-all duration-500 focus:outline-none focus:ring-1 focus:ring-[#111111] focus:ring-offset-2 cursor-pointer"
          aria-label="Try different style variation"
        >
          <ArrowLeft className="w-4 h-4" />
          Try Different Style
        </button>
      </div>

      <div className="mt-6 sm:mt-8 text-center px-4">
        <button
          onClick={onUseOriginal}
          className="text-xs tracking-widest uppercase text-luxury-gray-light hover:text-[#111111] transition-colors duration-300 min-h-[44px] inline-flex items-center border-b border-transparent hover:border-[#111111]/30 pb-0.5 cursor-pointer"
        >
          Prefer the original? Use it instead
        </button>
      </div>
    </div>
  );
}
