import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/* Without this, any render throw anywhere in the tree unmounts everything
 * and leaves a blank white page — on a URL linked from a resume, which is
 * the worst way for it to fail. React has no hook equivalent for this;
 * componentDidCatch is still class-only. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#F9F9F8] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl text-center border border-[#111111]/12 bg-white px-8 sm:px-14 py-14 sm:py-20">
          <p className="text-xs tracking-widest uppercase text-luxury-gray-light font-light mb-8">
            Lumière Collective
          </p>

          <div className="h-px w-16 mx-auto bg-[#111111]/20 mb-8" />

          <h1 className="font-serif italic text-2xl sm:text-3xl font-light text-[#111111] mb-6 leading-tight">
            The atelier is momentarily closed
          </h1>

          <p className="text-sm text-luxury-gray-medium leading-relaxed max-w-md mx-auto font-light mb-10">
            Something went wrong on our side, and your portrait was not
            affected. Please refresh and begin again.
          </p>

          <button
            onClick={this.handleReload}
            className="px-10 sm:px-14 py-4 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium min-h-[52px] hover:bg-[#111111]/80 transition-colors duration-500 focus:outline-none focus:ring-1 focus:ring-[#111111] focus:ring-offset-2 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
