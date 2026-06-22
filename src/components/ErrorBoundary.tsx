import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in workspaces:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <section className="glass-panel" style={{ padding: '32px', margin: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#f87171' }}>
              ⚠️ Error de Renderizado en Workspace
            </h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#9ca3af', lineHeight: '1.5' }}>
              Se ha producido una excepción crítica al renderizar el componente. A continuación se detallan los datos técnicos del error:
            </p>
            <pre style={{ 
              background: 'rgba(0,0,0,0.4)', 
              padding: '16px', 
              borderRadius: '8px', 
              overflowX: 'auto', 
              fontSize: '0.8rem', 
              fontFamily: 'monospace',
              color: '#fca5a5',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error?.stack || this.state.error?.message}
            </pre>
            <button 
              className="glow-btn" 
              onClick={() => window.location.reload()} 
              style={{ 
                alignSelf: 'flex-start', 
                padding: '10px 20px', 
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)'
              }}
            >
              Recargar Aplicación
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
