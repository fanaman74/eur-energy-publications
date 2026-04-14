import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error(error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-xl mx-auto text-center">
          <h2 className="font-display text-2xl mb-2">Something went wrong</h2>
          <p className="text-muted text-sm mb-4">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded bg-primary/20 border border-primary/40 text-primary text-sm"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
