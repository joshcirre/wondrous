import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    AdjustmentsHorizontalIcon,
    XMarkIcon,
} from "@heroicons/react/16/solid";
import Shell from "./Shell";
import Dialog from "./Dialog";

type Preferences = {
    chronicle: boolean;
    inspector: boolean;
    compact: boolean;
    focus: boolean;
    boardHeight: number;
};
const defaults: Preferences = {
    chronicle: true,
    inspector: true,
    compact: false,
    focus: false,
    boardHeight: 68,
};
const storageKey = "wondrous.display.v1";
function readPreferences(): Preferences {
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return {
            chronicle:
                typeof stored.chronicle === "boolean"
                    ? stored.chronicle
                    : defaults.chronicle,
            inspector:
                typeof stored.inspector === "boolean"
                    ? stored.inspector
                    : defaults.inspector,
            compact:
                typeof stored.compact === "boolean"
                    ? stored.compact
                    : defaults.compact,
            focus:
                typeof stored.focus === "boolean"
                    ? stored.focus
                    : defaults.focus,
            boardHeight:
                typeof stored.boardHeight === "number" &&
                Number.isFinite(stored.boardHeight)
                    ? Math.min(90, Math.max(45, stored.boardHeight))
                    : defaults.boardHeight,
        };
    } catch {
        return defaults;
    }
}

/** Full-width arena shell shared by live games and replay. */
export default function GameDisplay({
    children,
    label = "Arena display",
}: {
    children: ReactNode;
    label?: string;
}) {
    const [preferences, setPreferences] = useState(readPreferences);
    const [settings, setSettings] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(preferences));
        } catch {
            /* Display still works when browser storage is unavailable. */
        }
    }, [preferences]);
    useEffect(() => {
        const changed = () =>
            setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", changed);
        changed();
        return () => {
            document.removeEventListener("fullscreenchange", changed);
        };
    }, []);
    const update = <K extends keyof Preferences>(
        key: K,
        value: Preferences[K],
    ) => setPreferences((p) => ({ ...p, [key]: value }));
    async function toggleFullscreen() {
        setError("");
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            setError(
                "Your browser could not enter fullscreen. Focus view is still available.",
            );
        }
    }
    const focused = preferences.focus || fullscreen;
    const classes = [
        "game-display",
        focused && "display-focus",
        fullscreen && "display-fullscreen",
        !preferences.chronicle && "display-hide-log",
        !preferences.inspector && "display-hide-inspector",
        preferences.compact && "display-compact",
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <div
            className={classes}
            style={
                {
                    "--arena-board-height": `${preferences.boardHeight}dvh`,
                } as CSSProperties
            }
        >
            <Shell wide>
                <div
                    className="display-toolbar"
                    role="group"
                    aria-label={label}
                >
                    <span className="display-label">{label}</span>
                    <div className="display-buttons">
                        <button
                            type="button"
                            className="display-button"
                            aria-pressed={preferences.focus}
                            onClick={() => update("focus", !preferences.focus)}
                            disabled={fullscreen}
                            title={
                                fullscreen
                                    ? "Exit fullscreen to change focus view"
                                    : "Hide navigation and fit the arena to your window"
                            }
                        >
                            {preferences.focus ? (
                                <ArrowsPointingInIcon />
                            ) : (
                                <ArrowsPointingOutIcon />
                            )}
                            {preferences.focus ? "Exit focus" : "Focus view"}
                        </button>
                        <button
                            type="button"
                            className="display-button"
                            aria-pressed={fullscreen}
                            onClick={() => void toggleFullscreen()}
                            disabled={
                                typeof document !== "undefined" &&
                                !document.fullscreenEnabled
                            }
                        >
                            {fullscreen ? (
                                <ArrowsPointingInIcon />
                            ) : (
                                <ArrowsPointingOutIcon />
                            )}
                            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                        </button>
                        <button
                            type="button"
                            className="display-button"
                            aria-haspopup="dialog"
                            onClick={() => setSettings(true)}
                        >
                            <AdjustmentsHorizontalIcon />
                            Display settings
                        </button>
                    </div>
                </div>
                {error && (
                    <p className="display-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="display-content">{children}</div>
                {settings && (
                    <Dialog
                        label="Arena display settings"
                        className="display-settings"
                        onClose={() => setSettings(false)}
                    >
                        <div className="display-settings-heading">
                            <h2>Make room for strategy</h2>
                            <button
                                type="button"
                                className="icon-button"
                                onClick={() => setSettings(false)}
                                aria-label="Close display settings"
                            >
                                <XMarkIcon />
                            </button>
                        </div>
                        <p>
                            These preferences are saved in this browser for
                            games and replays.
                        </p>
                        <label className="display-setting">
                            <input
                                type="checkbox"
                                checked={preferences.chronicle}
                                onChange={(e) =>
                                    update("chronicle", e.target.checked)
                                }
                            />
                            <span>
                                Battle chronicle
                                <small>
                                    Show the record of moves and combat.
                                </small>
                            </span>
                        </label>
                        <label className="display-setting">
                            <input
                                type="checkbox"
                                checked={preferences.inspector}
                                onChange={(e) =>
                                    update("inspector", e.target.checked)
                                }
                            />
                            <span>
                                Champion inspector
                                <small>
                                    Show artwork and detailed statistics.
                                    Command controls remain available when
                                    hidden.
                                </small>
                            </span>
                        </label>
                        <label className="display-setting">
                            <input
                                type="checkbox"
                                checked={preferences.compact}
                                onChange={(e) =>
                                    update("compact", e.target.checked)
                                }
                            />
                            <span>
                                Compact interface
                                <small>
                                    Use smaller portraits and tighter spacing.
                                </small>
                            </span>
                        </label>
                        <label className="display-setting">
                            <input
                                type="checkbox"
                                checked={preferences.focus}
                                disabled={fullscreen}
                                onChange={(e) =>
                                    update("focus", e.target.checked)
                                }
                            />
                            <span>
                                Focus view
                                <small>
                                    Fill the window and keep game controls
                                    within reach.
                                </small>
                            </span>
                        </label>
                        <label
                            className="display-board-setting"
                            htmlFor="arena-board-height"
                        >
                            <span>
                                Board height{" "}
                                <output>
                                    {preferences.boardHeight}% of window
                                </output>
                            </span>
                            <input
                                id="arena-board-height"
                                type="range"
                                min="45"
                                max="90"
                                step="5"
                                value={preferences.boardHeight}
                                onChange={(e) =>
                                    update(
                                        "boardHeight",
                                        Number(e.target.value),
                                    )
                                }
                            />
                            <small>
                                Standard view only. Focus and fullscreen
                                automatically use available height. Scroll on
                                the board to adjust zoom.
                            </small>
                        </label>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="button"
                                onClick={() => setPreferences(defaults)}
                            >
                                Reset defaults
                            </button>
                            <button
                                type="button"
                                className="button primary"
                                onClick={() => setSettings(false)}
                            >
                                Done
                            </button>
                        </div>
                    </Dialog>
                )}
            </Shell>
        </div>
    );
}
