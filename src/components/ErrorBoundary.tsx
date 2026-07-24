import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Catches render errors in a page so one broken screen doesn't white-out the
 *  whole app. Shows the error text (useful while two devs iterate). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: '1rem' }}>
          <h2>Something went wrong on this page</h2>
          <p className="muted">{this.state.error.message}</p>
          <button className="button-secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
