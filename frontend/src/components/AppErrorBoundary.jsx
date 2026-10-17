import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert" className="min-h-screen p-6 flex flex-col items-center justify-center gap-4 bg-panel text-ink">
      <h1 className="text-xl font-semibold">This page could not be displayed.</h1>
      <p>Your last action may have completed. Check its status after reloading before submitting it again.</p>
      <button className="rounded-lg bg-action text-white px-4 py-3" onClick={() => window.location.reload()}>Reload safely</button>
    </main>;
    return this.props.children;
  }
}
