// Shared by API requests and the update prompt. Mutations are never replayed automatically.
let pending = 0;
let refreshReason: "session" | "assets" | null = null;
export const currentRefreshReason = () => refreshReason;
export const pendingMutations = () => pending;
export function mutationStarted() {
    pending++;
    window.dispatchEvent(new Event("wondrous:pending"));
}
export function mutationFinished() {
    pending = Math.max(0, pending - 1);
    window.dispatchEvent(new Event("wondrous:pending"));
}
export function needsRefresh(reason: "session" | "assets") {
    refreshReason = reason;
    window.dispatchEvent(
        new CustomEvent("wondrous:refresh", { detail: reason }),
    );
}
