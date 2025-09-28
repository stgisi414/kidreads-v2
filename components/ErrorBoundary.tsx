import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Something went wrong!
          </h2>
          <p className="text-lg text-slate-700">
            We're sorry, but an unexpected error occurred. Please try refreshing the
            page.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;