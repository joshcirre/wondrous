import { Component, type ErrorInfo, type ReactNode } from "react";
import { needsRefresh } from "../releases";

/** A missing lazy asset must not unmount the separate refresh prompt. */
export default class PageRecoveryBoundary extends Component<
    { children: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Unable to display this view", error, info);
        needsRefresh("assets");
    }
    render() {
        if (this.state.failed)
            return (
                <main className="main">
                    <h1>This view needs to reload.</h1>
                    <p>
                        Your saved game is safe. Use “Refresh and resume” to
                        return to your board.
                    </p>
                </main>
            );
        return this.props.children;
    }
}
