export interface PhotoState {
  original: string | null;
  enhanced: string | null;
  file: File | null;
  variations?: (string | null)[];
}

export type AppStep = 'welcome' | 'input' | 'variations' | 'results';

export type InputMode = 'camera' | 'upload';

export type VariationStatus = 'pending' | 'done' | 'failed';
