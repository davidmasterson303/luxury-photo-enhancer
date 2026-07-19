import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { MAX_FILE_SIZE, ACCEPTED_IMAGE_TYPES } from '../constants';

interface PhotoUploadProps {
  onUpload: (file: File) => void;
}

export default function PhotoUpload({ onUpload }: PhotoUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Please upload a JPG, PNG, or HEIC image file.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB.';
    }
    return null;
  };

  const handleFile = (file: File) => {
    setError('');

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setSubmitted(true);
    onUpload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (submitted) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (submitted) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (submitted) return;
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    if (submitted) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`
          relative border border-dashed p-8 sm:p-16 transition-all duration-500 select-none
          ${submitted ? 'cursor-not-allowed pointer-events-none opacity-60' : 'cursor-pointer'}
          ${dragActive
            ? 'border-[#111111] bg-[#111111]/[0.03]'
            : 'border-[#111111]/20 hover:border-[#111111]/50'
          }
          ${preview ? 'min-h-[300px]' : 'min-h-[400px] sm:min-h-[480px]'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={submitted ? -1 : 0}
        onKeyDown={(e) => {
          if (!submitted && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label="Upload photo area"
        aria-disabled={submitted}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/heic"
          onChange={handleChange}
          disabled={submitted}
        />

        {preview ? (
          <div className="flex flex-col items-center gap-6">
            <img
              src={preview}
              alt="Preview"
              className="max-h-64 object-contain"
            />
            <div className="flex items-center gap-3 text-[#111111]">
              <ImageIcon className="w-4 h-4" />
              <p className="text-xs tracking-widest uppercase font-medium">Portrait Ready</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="w-16 h-16 border border-[#111111]/20 flex items-center justify-center">
              <Upload className="w-7 h-7 text-[#111111]/50" />
            </div>
            <div>
              <h3 className="font-serif italic text-2xl sm:text-3xl font-light text-[#111111] mb-3">
                Upload Your Portrait
              </h3>
              <p className="text-xs tracking-widest uppercase text-luxury-gray-medium mb-2 font-light">
                Drag and drop or click to browse
              </p>
              <p className="text-xs tracking-widest uppercase text-luxury-gray-light font-light">
                JPG, PNG, HEIC &mdash; Maximum 10MB
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 px-4 py-3 border border-red-200">
          <p className="text-xs tracking-widest uppercase text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-10 border-t border-[#111111]/10 pt-8">
        <ul className="space-y-3">
          {[
            'Single person portrait — optimized for private directory rendering',
            'Natural, flattering illumination with clear facial features',
            'Polished, membership-ready presentation with minimal background distractions',
          ].map((item, i) => (
            <li key={i} className="text-xs tracking-widest uppercase text-luxury-gray-light leading-relaxed opacity-60">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
