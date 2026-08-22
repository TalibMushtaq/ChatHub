"use client";

import { Component, type ReactNode } from "react";
import { btnPrimary } from "../styles";

export class CallErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-extrabold text-danger">
            Something went wrong with the voice channel.
          </p>
          <p className="text-[13px] text-muted">
            Try rejoining or refreshing the page.
          </p>
          <button
            className={btnPrimary}
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
