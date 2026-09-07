import { Head, Link, router, usePage } from "@inertiajs/react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
    ArrowRightIcon,
    PlusIcon,
    TrophyIcon,
    UserGroupIcon,
    BeakerIcon,
} from "@heroicons/react/16/solid";
import Shell, { Eyebrow, ErrorBanner } from "../components/Shell";
import Deadline from "../components/Deadline";
import "../../css/replay.css";
import CharacterCard from "../components/CharacterCard";
import { api, errorMessage, realtime } from "../api";
import type { Shared, Unit } from "../types";
const Battlefield = lazy(() => import("../components/Battlefield"));
type LobbyGame = {
    code: string;
    name: string;
    host: string;
    ranked: boolean;
    time_control: "live" | "correspondence";
    created_at: string;
};
export default function Lobby() {
    const { auth, catalog, games, active, active_games, recent } = usePage<
        Shared & {
            games: LobbyGame[];
            active: string | null;
            active_games: {
                code: string;
                name: string;
                mode: "multiplayer" | "practice";
                time_control: string;
                phase: string;
                turn_player_id: number | null;
                turn_due_at: string | null;
                ready: number[];
                host_id: number;
                players: { id: number; name: string }[];
            }[];
            recent: {
                code: string;
                name: string;
                won: boolean;
                draw?: boolean;
                ranked: boolean;
            }[];
        }
    >().props;
    const [name, setName] = useState(`${auth.user?.name}'s arena`);
    const [mode, setMode] = useState<"ranked" | "friendly" | "correspondence">(
        "ranked",
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [code, setCode] = useState("");
    useEffect(() => {
        const e = realtime();
        const refresh = () =>
            router.reload({
                only: ["games", "active", "active_games", "recent", "auth"],
            });
        e?.channel("lobby").listen(".lobby.updated", refresh);
        const timer = setInterval(refresh, 10000);
        return () => {
            e?.leave("lobby");
            clearInterval(timer);
        };
    }, []);
    const practice = active_games?.find((game) => game.mode === "practice");
    const [practiceBusy, setPracticeBusy] = useState(false);
    async function startPractice() {
        if (practiceBusy) return;
        setPracticeBusy(true);
        setError("");
        try {
            const { data } = await api.post("/games", {
                name: "Practice arena",
                ranked: false,
                mode: "practice",
            });
            router.visit(`/games/${data.code}`);
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setPracticeBusy(false);
        }
    }
    async function create() {
        setBusy(true);
        setError("");
        try {
            const r = await api.post("/games", {
                name,
                ranked: mode === "ranked",
                time_control:
                    mode === "correspondence" ? "correspondence" : "live",
            });
            router.visit(`/games/${r.data.code}`);
        } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
        }
    }
    const ids = ["warden", "ranger", "knight", "arcanist", "cleric", "herald"];
    const preview: Unit[] = ids.flatMap((id, i) =>
        [1, 2].map((owner) => ({
            id: `${owner}-${id}`,
            character_id: id,
            owner_id: owner,
            x: i + 1,
            y: owner === 1 ? (i % 2 ? 6 : 7) : i % 2 ? 1 : 0,
            hp: catalog[id].hp,
            max_hp: catalog[id].hp,
            mana: catalog[id].mana,
            max_mana: catalog[id].mana,
            facing: owner === 1 ? "north" : "south",
            recovery: 0,
            cooldown: 0,
            statuses: {},
        })),
    );
    return (
        <Shell>
            <Head title="The arena" />
            {active_games?.length > 0 && (
                <section
                    className="active-games"
                    aria-labelledby="my-games-heading"
                >
                    <div className="section-heading">
                        <div>
                            <Eyebrow>Your ongoing matches</Eyebrow>
                            <h2 id="my-games-heading">
                                My games{" "}
                                <span className="count">
                                    {active_games.length}
                                </span>
                            </h2>
                        </div>
                        <p className="muted">
                            Return to any board. Your progress is saved.
                        </p>
                    </div>
                    <div className="active-game-list">
                        {[...active_games]
                            .sort((a, b) => {
                                const needs = (g: typeof a) =>
                                    g.phase === "deployment"
                                        ? !g.ready.includes(auth.user!.id)
                                        : g.turn_player_id === auth.user!.id;
                                return (
                                    Number(needs(b)) - Number(needs(a)) ||
                                    (a.turn_due_at || "z").localeCompare(
                                        b.turn_due_at || "z",
                                    )
                                );
                            })
                            .map((g) => {
                                const needs =
                                    g.phase === "deployment"
                                        ? !g.ready.includes(auth.user!.id)
                                        : g.turn_player_id === auth.user!.id;
                                const rival = g.players.find(
                                    (p) => p.id !== auth.user!.id,
                                );
                                return (
                                    <Link
                                        key={g.code}
                                        href={`/games/${g.code}`}
                                        className={`active-game-row ${needs ? "needs-action" : ""}`}
                                    >
                                        <div>
                                            <h3>{g.name}</h3>
                                            <p>
                                                {rival
                                                    ? `vs ${rival.name}`
                                                    : "Waiting for a challenger"}{" "}
                                                ·{" "}
                                                {g.mode === "practice"
                                                    ? "Solo practice"
                                                    : g.time_control ===
                                                        "correspondence"
                                                      ? "Correspondence"
                                                      : "Live"}
                                            </p>
                                        </div>
                                        <div>
                                            <strong>
                                                {g.phase === "lobby"
                                                    ? "Invite a rival"
                                                    : needs
                                                      ? g.phase === "deployment"
                                                          ? "Lock your formation"
                                                          : g.phase === "draft"
                                                            ? "Your draft pick"
                                                            : "Your turn"
                                                      : "Waiting for rival"}
                                            </strong>
                                            <Deadline due={g.turn_due_at} />
                                        </div>
                                        <ArrowRightIcon />
                                    </Link>
                                );
                            })}
                    </div>
                </section>
            )}
            <section className="realm-banner" aria-labelledby="realm-title">
                <img
                    src="/images/autumn-realm.png"
                    alt="A sunlit medieval citadel above a valley of golden autumn forests"
                    fetchPriority="high"
                />
                <div className="realm-banner-copy">
                    <Eyebrow>Welcome to the autumn realm</Eyebrow>
                    <h1 id="realm-title">
                        Small armies.
                        <br />
                        Legendary rivalries.
                    </h1>
                    <p>
                        Six champions. A world of possibilities. Gather your
                        company and make your next move matter.
                    </p>
                    <a className="button" href="#arena-settings">
                        Enter the arena <ArrowRightIcon />
                    </a>
                </div>
                <div className="realm-banner-seal">
                    <span>W</span>
                    <p>
                        The sixfold arena
                        <br />
                        Strategy, in every season.
                    </p>
                </div>
            </section>
            <section
                className="practice-entry"
                aria-labelledby="practice-heading"
            >
                <div>
                    <h2 id="practice-heading">
                        <BeakerIcon /> A little room to experiment.
                    </h2>
                    <p>
                        Build any six champions and try a strategy against the
                        computer. No clock, no stakes. Your practice game saves
                        after every action.
                    </p>
                </div>
                {practice ? (
                    <Link className="button" href={`/games/${practice.code}`}>
                        Resume practice <ArrowRightIcon />
                    </Link>
                ) : (
                    <button
                        type="button"
                        className="button"
                        onClick={startPractice}
                        disabled={practiceBusy}
                    >
                        {practiceBusy
                            ? "Preparing your opponent…"
                            : "Play against computer"}
                        <ArrowRightIcon />
                    </button>
                )}
            </section>
            <div className="page-heading" id="arena-settings">
                <div>
                    <Eyebrow>The sixfold arena</Eyebrow>
                    <h2>A worthy rival awaits.</h2>
                </div>
                <div className="rating-chip">
                    <TrophyIcon />
                    <div>
                        <strong>{auth.user?.rating}</strong>
                        <small>Arena rating</small>
                    </div>
                </div>
            </div>
            <section className="lobby-stage">
                <div className="lobby-invite">
                    <div className="status-line">
                        <i /> The arena is open
                    </div>
                    <h2>
                        Your warband.
                        <br />
                        Your next move.
                    </h2>
                    <p>
                        Draft six champions, read your rival, and command the
                        field. Every battle begins on equal ground.
                    </p>
                    <div className="match-settings">
                        <label>
                            Arena name
                            <input
                                name="arena_name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={60}
                            />
                        </label>
                        <div className="mode-switch">
                            <button
                                type="button"
                                className={mode === "ranked" ? "active" : ""}
                                aria-pressed={mode === "ranked"}
                                onClick={() => setMode("ranked")}
                            >
                                <TrophyIcon />
                                Ranked
                            </button>
                            <button
                                type="button"
                                className={mode === "friendly" ? "active" : ""}
                                aria-pressed={mode === "friendly"}
                                onClick={() => setMode("friendly")}
                            >
                                <UserGroupIcon />
                                Friendly
                            </button>
                            <button
                                type="button"
                                className={
                                    mode === "correspondence" ? "active" : ""
                                }
                                aria-pressed={mode === "correspondence"}
                                onClick={() => setMode("correspondence")}
                            >
                                Correspondence
                            </button>
                        </div>
                        <p className="mode-description">
                            {mode === "correspondence"
                                ? "Unranked · 24 hours per turn. Play several games at your own pace. Miss a deadline and forfeit; each draft pick and formation setup also has 24 hours."
                                : mode === "ranked"
                                  ? "Play together in real time. Results affect your arena rating."
                                  : "Play together in real time without changing your rating."}
                        </p>
                        <ErrorBanner message={error} />
                        {active && mode !== "correspondence" ? (
                            <Link
                                className="button primary full"
                                href={`/games/${active}`}
                            >
                                Return to your match
                                <ArrowRightIcon />
                            </Link>
                        ) : (
                            <button
                                type="button"
                                className="button primary full"
                                onClick={create}
                                disabled={busy || !name.trim()}
                            >
                                <PlusIcon />
                                {busy
                                    ? "Opening the gates…"
                                    : "Create an arena"}
                            </button>
                        )}
                        <p className="hint">
                            1v1 · 6 champions each · 8 × 8 battlefield
                        </p>
                    </div>
                </div>
                <div className="lobby-board">
                    <div className="board-overline">
                        <span>THE SUNKEN COURT</span>
                        <span>Season I</span>
                    </div>
                    <Suspense
                        fallback={
                            <div className="scene-loading">
                                Preparing the battlefield…
                            </div>
                        }
                    >
                        <Battlefield
                            units={preview}
                            viewerId={1}
                            selectedId={null}
                            onSelect={() => {}}
                            onTile={() => {}}
                            interactive={false}
                        />
                    </Suspense>
                    <div className="board-caption">
                        <span>◈</span> A small board. Endless possibilities.
                    </div>
                </div>
            </section>
            <section className="lobby-tables">
                <div className="open-arenas">
                    <div className="section-heading">
                        <h2>
                            Open arenas{" "}
                            <span className="count">{games.length}</span>
                        </h2>
                        <form
                            className="join-code"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (code.trim())
                                    router.visit(
                                        `/games/${code.trim().toUpperCase()}`,
                                    );
                            }}
                        >
                            <input
                                name="join_code"
                                aria-label="Arena invite code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Enter invite code"
                                maxLength={6}
                            />
                            <button
                                type="submit"
                                className="button small"
                                disabled={!code.trim()}
                            >
                                Join
                                <ArrowRightIcon />
                            </button>
                        </form>
                    </div>
                    {games.length ? (
                        <div className="arena-list">
                            {games.map((g) => (
                                <Link
                                    href={`/games/${g.code}`}
                                    className="arena-row"
                                    key={g.code}
                                >
                                    <div className="arena-emblem">
                                        {g.host.charAt(0)}
                                    </div>
                                    <div>
                                        <h3>{g.name}</h3>
                                        <p>
                                            {g.host}{" "}
                                            <span>· {g.created_at}</span>
                                        </p>
                                    </div>
                                    <span className="mode-label">
                                        {g.time_control === "correspondence"
                                            ? "24h / turn"
                                            : g.ranked
                                              ? "Ranked"
                                              : "Friendly"}
                                    </span>
                                    <span className="seat-count">1 / 2</span>
                                    <ArrowRightIcon />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-arena">
                            <UserGroupIcon />
                            <h3>The field is yours.</h3>
                            <p>
                                Create an arena and send its invite code to a
                                friend.
                            </p>
                        </div>
                    )}
                </div>
                <aside className="record-panel">
                    <div className="section-heading">
                        <Eyebrow>Your campaign</Eyebrow>
                        <Link className="text-link" href="/replays">
                            All replays
                        </Link>
                    </div>
                    <div className="record-stats">
                        <div>
                            <strong>{auth.user?.wins}</strong>
                            <span>Victories</span>
                        </div>
                        <div>
                            <strong>{auth.user?.losses}</strong>
                            <span>Defeats</span>
                        </div>
                        <div>
                            <strong>
                                {auth.user?.wins || auth.user?.losses
                                    ? Math.round(
                                          (auth.user.wins /
                                              (auth.user.wins +
                                                  auth.user.losses)) *
                                              100,
                                      )
                                    : 0}
                                %
                            </strong>
                            <span>Win rate</span>
                        </div>
                    </div>
                    {recent.length ? (
                        <div className="recent-list">
                            {recent.map((g) => (
                                <Link
                                    key={g.code}
                                    href={`/games/${g.code}/replay`}
                                >
                                    <span className={g.won ? "win" : "loss"}>
                                        {g.draw
                                            ? "Draw"
                                            : g.won
                                              ? "Victory"
                                              : "Defeat"}
                                    </span>
                                    <span>
                                        {g.name}
                                        <small className="review-link-label">
                                            Review match
                                        </small>
                                    </span>
                                    <ArrowRightIcon />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="muted">
                            Your story is still unwritten.
                            <br />
                            One good move is all it takes to begin.
                        </p>
                    )}
                </aside>
            </section>
            <section className="roster-preview">
                <div className="section-heading">
                    <div>
                        <Eyebrow>Meet the warband</Eyebrow>
                        <h2>Every champion has a purpose.</h2>
                    </div>
                    <Link href="/collection" className="text-link">
                        Explore all 12 champions
                        <ArrowRightIcon />
                    </Link>
                </div>
                <div className="preview-cards">
                    {[
                        "warden",
                        "ranger",
                        "arcanist",
                        "rogue",
                        "herald",
                        "pyromancer",
                    ].map((id) => (
                        <CharacterCard
                            compact
                            key={id}
                            character={catalog[id]}
                        />
                    ))}
                </div>
            </section>
        </Shell>
    );
}
