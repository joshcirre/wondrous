import { useEffect, useState } from "react";
import { router } from "@inertiajs/react";
import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { api } from "../api";
import { pendingMutations, currentRefreshReason } from "../releases";

export default function ReleaseNotice({
    initialVersion,
}: {
    initialVersion: string;
}) {
    const [reason, setReason] = useState<
        "release" | "session" | "assets" | null
    >(currentRefreshReason);
    const [deferred, setDeferred] = useState(false);
    const [pending, setPending] = useState(pendingMutations());
    const [navigating, setNavigating] = useState(false);
    useEffect(() => {
        setReason((old) => old ?? currentRefreshReason());
        let stopped = false;
        let checking = false;
        const check = async () => {
            if (checking || document.visibilityState === "hidden") return;
            checking = true;
            try {
                const { data } = await api.get("/release", { timeout: 5000 });
                if (
                    !stopped &&
                    typeof data.version === "string" &&
                    data.version !== initialVersion
                ) {
                    setReason((old) => old ?? "release");
                }
            } catch {
                // A rolling release or offline connection is not a reason to discard the board.
            } finally {
                checking = false;
            }
        };
        const required = (event: Event) => {
            setReason((event as CustomEvent<"session" | "assets">).detail);
            setDeferred(false);
        };
        const preload = (event: Event) => {
            event.preventDefault();
            setReason("assets");
            setDeferred(false);
        };
        const changed = () => setPending(pendingMutations());
        const stopStart = router.on("start", () => setNavigating(true));
        const stopFinish = router.on("finish", () => setNavigating(false));
        const timer = window.setInterval(check, 30000);
        window.addEventListener("focus", check);
        window.addEventListener("online", check);
        window.addEventListener("wondrous:pending", changed);
        window.addEventListener("wondrous:refresh", required);
        window.addEventListener("vite:preloadError", preload);
        void check();
        return () => {
            stopped = true;
            clearInterval(timer);
            stopStart();
            stopFinish();
            window.removeEventListener("focus", check);
            window.removeEventListener("online", check);
            window.removeEventListener("wondrous:pending", changed);
            window.removeEventListener("wondrous:refresh", required);
            window.removeEventListener("vite:preloadError", preload);
        };
    }, [initialVersion]);
    if (!reason) return null;
    const waiting = pending > 0 || navigating;
    function refresh() {
        // Check synchronously too, so a click cannot race a command that just started.
        if (pendingMutations() || navigating) return;
        window.location.reload();
    }
    return (
        <aside
            className={`release-notice ${deferred ? "is-deferred" : ""}`}
            aria-label="Application update"
        >
            <div role="status" aria-live="polite">
                <strong>
                    {reason === "session"
                        ? "Reconnect to your game"
                        : "An update is ready"}
                </strong>
                {!deferred && (
                    <p>
                        {reason === "session"
                            ? "Your saved game is safe. Refresh to reconnect; you may need to sign in again."
                            : "Refresh when you’re ready. You’ll return to this page with your saved game intact."}
                    </p>
                )}
            </div>
            <div className="release-actions">
                <button
                    type="button"
                    className="button small"
                    disabled={waiting}
                    onClick={refresh}
                >
                    <ArrowPathIcon />
                    {waiting ? "Finishing your request…" : "Refresh and resume"}
                </button>
                {!deferred && reason === "release" && (
                    <button
                        type="button"
                        className="button small ghost"
                        onClick={() => setDeferred(true)}
                    >
                        Later
                    </button>
                )}
            </div>
        </aside>
    );
}
