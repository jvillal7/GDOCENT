import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32,
          background: '#f5f5f5', fontFamily: "'Instrument Sans', sans-serif",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: '#1a1a1a', fontSize: 20, fontWeight: 700 }}>
            Alguna cosa ha fallat
          </h2>
          <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14, lineHeight: 1.6, textAlign: 'center', maxWidth: 360 }}>
            S'ha produït un error inesperat. Torna a carregar la pàgina per continuar.
          </p>
          <code style={{
            display: 'block', margin: '0 0 24px', padding: '8px 16px',
            background: '#fee2e2', borderRadius: 6, fontSize: 12,
            color: '#c62828', maxWidth: 400, wordBreak: 'break-all', textAlign: 'center',
          }}>
            {this.state.error.message}
          </code>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 32px', background: '#1a1a1a', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Recarregar pàgina
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
