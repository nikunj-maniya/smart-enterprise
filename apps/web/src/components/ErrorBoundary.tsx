import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/** Root-level crash guard — without it, an uncaught render error unmounts the whole tree to
 *  React's default blank white screen. Reload (not a component-level "retry") is the right
 *  recovery here: the error is by definition one React couldn't contain to a smaller boundary. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
        <div className="w-full max-w-[440px] rounded-xl border border-line-soft bg-surface p-10 text-center shadow-card">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgba(229,72,77,.12)]">
            <AlertTriangle size={30} className="text-danger" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Something went wrong</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            An unexpected error occurred. Reloading the page usually fixes this.
          </div>
          <Button fullWidth className="mt-7" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
