import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; errorMessage: string; }

export default class SandboxErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-center">
          <p className="text-red-600 text-sm font-medium">Sandbox crashed</p>
          <p className="text-red-400 text-xs mt-1">{this.state.errorMessage}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
