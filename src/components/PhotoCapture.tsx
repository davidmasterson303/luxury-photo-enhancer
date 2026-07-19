import { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export default function PhotoCapture({ onCapture, onCancel }: PhotoCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string>('');
  const [visible, setVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setError('');
      if (stream) stream.getTracks().forEach(t => t.stop());

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch {
      setError('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  const capturePhoto = () => {
    if (capturing || !videoRef.current || !canvasRef.current) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'captured-photo.jpg', { type: 'image/jpeg' });
        onCapture(file);
        if (stream) stream.getTracks().forEach(t => t.stop());
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Dark background */}
      <div className="absolute inset-0 bg-[#111111]" />

      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-[#F9F9F8] p-8 max-w-md text-center">
              <p className="text-xs tracking-widest uppercase text-[#111111] mb-6 font-light">{error}</p>
              <button
                onClick={onCancel}
                className="px-8 py-4 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium hover:bg-[#111111]/80 transition-colors duration-300 cursor-pointer"
              >
                Return to Options
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />

            {/* Vignette */}
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />

            {/* Face oval */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                className="oval-ring absolute top-1/2 left-1/2"
                style={{ width: 310, height: 420, marginLeft: -155, marginTop: -210 }}
                viewBox="0 0 310 420"
              >
                <ellipse
                  cx="155" cy="210" rx="148" ry="202"
                  fill="none"
                  stroke="rgba(201,169,97,0.35)"
                  strokeWidth="1.5"
                  strokeDasharray="6 10"
                />
              </svg>

              <div
                className="oval-aura"
                style={{
                  width: 280,
                  height: 380,
                  border: '2.5px solid rgba(201,169,97,0.75)',
                  borderRadius: '50%',
                  background: 'transparent',
                }}
              />
            </div>

            {/* Instruction */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-[#111111]/80 px-7 py-3.5 border border-white/10">
              <p className="text-white text-xs tracking-widest uppercase text-center font-light">
                Position your face within the oval
              </p>
            </div>
          </>
        )}
      </div>

      {/* Camera controls */}
      {!error && (
        <div className="relative z-10 bg-[#111111] border-t border-white/10 py-8 px-6 flex items-center justify-center gap-10">
          <button
            onClick={onCancel}
            className="w-14 h-14 bg-white/10 hover:bg-white/20 transition-all duration-300 flex items-center justify-center border border-white/10 cursor-pointer"
            aria-label="Cancel"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={capturePhoto}
            disabled={capturing}
            className={`relative w-20 h-20 bg-white flex items-center justify-center transition-all duration-300 cursor-pointer ${capturing ? 'opacity-50 pointer-events-none' : 'hover:bg-white/80'}`}
            aria-label="Capture photo"
          >
            <Camera className="w-8 h-8 text-[#111111]" />
          </button>

          <button
            onClick={() => setFacingMode(m => m === 'user' ? 'environment' : 'user')}
            className="w-14 h-14 bg-white/10 hover:bg-white/20 transition-all duration-300 flex items-center justify-center border border-white/10 cursor-pointer"
            aria-label="Switch camera"
          >
            <RefreshCw className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
