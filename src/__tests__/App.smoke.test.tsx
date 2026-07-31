// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../App';

/* A white screen on the page you link from a resume is the worst
 * possible failure, and it is invisible to typecheck, lint and the unit
 * tests — all four were green while this was unverified. This mounts the
 * real component tree once and asserts something rendered. */

// Tells React this is an act()-aware environment; without it every
// render logs a warning that buries anything real in the output.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function mountApp() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<App />));
  return container;
}

describe('App smoke render', () => {
  it('mounts and paints the welcome screen', () => {
    // jsdom has no matchMedia; the app should not depend on it, but a
    // throw here would look identical to a render failure.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const el = mountApp();

    expect(el.innerHTML.length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Lumière');
  });

  it('renders both entry points into the flow', () => {
    const el = mountApp();
    const text = el.textContent ?? '';

    // If either of these disappears there is no way into the app.
    expect(text.toLowerCase()).toMatch(/upload/);
    expect(text.toLowerCase()).toMatch(/capture|camera|photograph/);
  });
});
