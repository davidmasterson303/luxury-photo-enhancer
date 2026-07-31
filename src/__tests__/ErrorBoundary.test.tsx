// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ErrorBoundary from '../components/ErrorBoundary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Boom(): never {
  throw new Error('render exploded');
}

beforeEach(() => {
  // React logs caught render errors; the throw here is the point of the
  // test, so keep the output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function mount(children: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<ErrorBoundary>{children}</ErrorBoundary>));
  return container;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    const el = mount(<p>portrait grid</p>);
    expect(el.textContent).toContain('portrait grid');
  });

  it('catches a render throw instead of leaving a blank page', () => {
    const el = mount(<Boom />);

    // The failure this exists to prevent is an empty document.
    expect(el.innerHTML.length).toBeGreaterThan(0);
    expect(el.textContent).toContain('momentarily closed');
    expect(el.querySelector('button')?.textContent).toBe('Refresh');
  });
});
