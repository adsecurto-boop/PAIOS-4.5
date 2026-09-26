import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { recordRuntimeDiagnostic } from '../utils/runtimeDiagnostics';

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    recordRuntimeDiagnostic('recovery', error);
  }

  private reload = () => window.location.reload();

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <section role="alert" aria-live="assertive" className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold">PAIOS needs to recover</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                The current screen stopped unexpectedly. Your saved information has not been cleared. Reload the application to restore a clean interface.
              </p>
              <button type="button" onClick={this.reload} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reload PAIOS
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}

