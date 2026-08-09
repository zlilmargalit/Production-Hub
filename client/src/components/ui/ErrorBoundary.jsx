import { Component } from 'react';

/**
 * Catches render errors from a subtree so one broken panel degrades instead of
 * blanking the whole app. React unmounts the entire tree on an uncaught render
 * error — which is why a crash anywhere previously showed a white page with no
 * clue what failed.
 *
 * Shows the actual error message: when something does break, the point is to be
 * able to say what, not just that it did.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.label ? ' · ' + this.props.label : ''}]`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: '14px 16px', margin: '8px 0', borderRadius: 8,
        background: 'var(--surface-sunk, #f6f6f8)',
        border: '1px solid var(--border, #e2e4e9)',
        fontSize: '0.875rem', lineHeight: 1.5,
      }}>
        <strong>{this.props.label || 'This section'} couldn’t be displayed.</strong>
        <div style={{ opacity: 0.75, marginTop: 4 }}>
          The rest of the page still works. {this.state.error?.message || ''}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{ marginTop: 10, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    );
  }
}
