export interface EnhancementOption {
  id: string;
  name: string;
  description: string;
  prompt: string;
  previewUrl?: string;
}

export interface PhotoState {
  original: string | null;
  enhanced: string | null;
  file: File | null;
  variations?: {
    variant1: string | null;
    variant2: string | null;
    variant3: string | null;
    variant4: string | null;
  };
}

export type AppStep = 'welcome' | 'input' | 'variations' | 'enhance' | 'results';

export type InputMode = 'camera' | 'upload';
