// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PreviewModal from '../components/PreviewModal';
import ResultsDisplay from '../components/ResultsDisplay';
import VariationSelection from '../components/VariationSelection';
import type { VariationStatus } from '../types';

/* Accessibility that is not asserted is accessibility that survives until
 * the next refactor. Each of these pins a behaviour that is invisible in
 * the markup and silently removable: focus containment, focus restoration,
 * a real slider control rather than a div wearing ARIA, and a live region
 * that actually changes when work completes. */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function mount(node: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('PreviewModal focus management', () => {
  it('exposes dialog semantics and a label', () => {
    const el = mount(
      <PreviewModal imageUrl={PIXEL} label="Editorial" onClose={() => {}} onConfirm={() => {}} />
    );

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');

    // The accessible name must resolve to a real element, not a dangling id.
    const labelledBy = dialog!.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Editorial');
  });

  it('moves focus into the dialog on open', () => {
    const el = mount(
      <PreviewModal imageUrl={PIXEL} label="Editorial" onClose={() => {}} onConfirm={() => {}} />
    );

    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('wraps Tab from the last control back to the first', () => {
    const el = mount(
      <PreviewModal imageUrl={PIXEL} label="Editorial" onClose={() => {}} onConfirm={() => {}} />
    );

    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(1);

    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    act(() => last.focus());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    // Without the trap, focus would leave for the page behind the modal.
    expect(document.activeElement).toBe(first);
  });

  it('restores focus to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    mount(<PreviewModal imageUrl={PIXEL} label="Editorial" onClose={() => {}} onConfirm={() => {}} />);
    act(() => root!.unmount());
    root = null;

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    mount(<PreviewModal imageUrl={PIXEL} label="Editorial" onClose={onClose} onConfirm={() => {}} />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });
});

describe('Comparison slider', () => {
  it('is a real range input, not a div wearing role="slider"', () => {
    const el = mount(
      <ResultsDisplay
        originalImage={PIXEL}
        enhancedImage={PIXEL}
        onTryAgain={() => {}}
        onUseOriginal={() => {}}
      />
    );

    const range = el.querySelector('input[type="range"]') as HTMLInputElement | null;
    expect(range).not.toBeNull();
    expect(range!.getAttribute('aria-label')).toBeTruthy();

    // A hand-rolled div would leave nothing here for a keyboard user.
    expect(range!.min).toBe('0');
    expect(range!.max).toBe('100');
  });

  it('drives the reveal from the input value', () => {
    const el = mount(
      <ResultsDisplay
        originalImage={PIXEL}
        enhancedImage={PIXEL}
        onTryAgain={() => {}}
        onUseOriginal={() => {}}
      />
    );

    const range = el.querySelector('input[type="range"]') as HTMLInputElement;
    const before = range.getAttribute('aria-valuetext');

    act(() => {
      // What an arrow key ultimately produces.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(range, '20');
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(range.value).toBe('20');
    expect(range.getAttribute('aria-valuetext')).not.toBe(before);
  });
});

describe('Variation status live region', () => {
  const render = (statuses: VariationStatus[]) =>
    mount(
      <VariationSelection
        variations={statuses.map(s => (s === 'done' ? PIXEL : null))}
        statuses={statuses}
        onSelectVariation={() => {}}
        onCustomEnhancement={() => {}}
        onRetryVariation={() => {}}
        isProcessing={false}
      />
    );

  it('reports progress while portraits are still developing', () => {
    const el = render(['done', 'pending', 'pending', 'pending']);
    const live = el.querySelector('[role="status"]');

    expect(live).not.toBeNull();
    expect(live!.getAttribute('aria-live')).toBe('polite');
    expect(live!.textContent).toContain('1 of 4');
  });

  it('changes its text as portraits land, so the region actually announces', () => {
    const partial = render(['done', 'pending', 'pending', 'pending']);
    const first = partial.querySelector('[role="status"]')!.textContent;

    act(() => root!.unmount());
    root = null;
    container!.remove();

    const complete = render(['done', 'done', 'done', 'done']);
    const second = complete.querySelector('[role="status"]')!.textContent;

    // A live region whose text never changes is silent in practice.
    expect(second).not.toBe(first);
    expect(second).toContain('All 4');
  });

  it('mentions failures rather than quietly under-reporting', () => {
    const el = render(['done', 'done', 'done', 'failed']);
    expect(el.querySelector('[role="status"]')!.textContent).toContain('1 could not be developed');
  });
});
