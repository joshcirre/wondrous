import { Head, Link, usePage } from "@inertiajs/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
    BackwardIcon,
    ForwardIcon,
    PlayIcon,
    PauseIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/react/16/solid";
import GameDisplay from "../components/GameDisplay";
import { Eyebrow } from "../components/Shell";
import { Portrait } from "../components/CharacterCard";
import type { Game, Shared, State, Unit, Catalog } from "../types";
import "../../css/replay.css";
const Battlefield = lazy(() => import("../components/Battlefield"));
type Frame = {
    version: number;
    actor_id: number | null;
    action: string;
    created_at: string;
    state: State;
};
const coordinate = (u: Unit) => `${"ABCDEFGH"[u.x]}${8 - u.y}`;
const actionNames: Record<string, string> = {
    created: "Arena opened",
    join: "Draft begins",
    draft: "Champion drafted",
    deploy: "Formation adjusted",
    ready: "Formation locked",
    move: "Movement",
    attack: "Basic attack",
    skill: "Ability used",
    face: "Facing changed",
    end_turn: "Turn ended",
    resign: "Concession",
    timeout: "Time expired",
};
const moment = (f: Frame) =>
    f.state.phase === "battle" || f.state.phase === "finished"
        ? `Turn ${f.state.turn_number}`
        : f.state.phase === "deployment"
          ? "Deployment"
          : "Draft";
function changes(previous: State | undefined, state: State, catalog: Catalog) {
    if (!previous) return [];
    return state.units.flatMap((u) => {
        const old = previous.units.find((p) => p.id === u.id);
        if (!old) return [];
        const owner = state.players.find((p) => p.id === u.owner_id)?.name;
        const prefix = `${owner} · ${catalog[u.character_id].name}`;
        const details: string[] = [];
        if (old.x !== u.x || old.y !== u.y)
            details.push(`${coordinate(old)} → ${coordinate(u)}`);
        if (old.hp !== u.hp)
            details.push(
                `health ${old.hp} → ${u.hp}${u.hp === 0 ? " · eliminated" : ""}`,
            );
        if (old.mana !== u.mana) details.push(`mana ${old.mana} → ${u.mana}`);
        if (old.facing !== u.facing)
            details.push(`facing ${old.facing} → ${u.facing}`);
        if (old.recovery !== u.recovery)
            details.push(`recovery ${old.recovery} → ${u.recovery}`);
        if (old.cooldown !== u.cooldown)
            details.push(`cooldown ${old.cooldown} → ${u.cooldown}`);
        for (const status of new Set([
            ...Object.keys(old.statuses),
            ...Object.keys(u.statuses),
        ])) {
            if ((old.statuses[status] || 0) !== (u.statuses[status] || 0))
                details.push(
                    `${status} ${old.statuses[status] || 0} → ${u.statuses[status] || 0}`,
                );
        }
        return details.length ? [{ id: u.id, prefix, details }] : [];
    });
}
export default function Replay() {
    const { game, frames, catalog, auth } = usePage<
        Shared & { game: Game; frames: Frame[] }
    >().props;
    const [index, setIndex] = useState(() =>
        Math.max(
            0,
            frames.findIndex((f) => f.state.phase === "battle"),
        ),
    );
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [perspective, setPerspective] = useState(auth.user!.id);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const frame = frames[index];
    const state = frame?.state || game.state;
    const selected = state.units.find((u) => u.id === selectedId);
    const boundaries = useMemo(
        () =>
            frames.flatMap((f, i) =>
                i === 0 ||
                f.state.phase !== frames[i - 1].state.phase ||
                f.state.turn_number !== frames[i - 1].state.turn_number
                    ? [i]
                    : [],
            ),
        [frames],
    );
    const previous = frames[index - 1]?.state;
    const diff = useMemo(
        () => changes(previous, state, catalog),
        [previous, state, catalog],
    );
    // Logs are bounded on the server. Match the retained suffix before finding newly recorded lines.
    let overlap = Math.min(previous?.log.length || 0, state.log.length);
    while (
        overlap > 0 &&
        JSON.stringify(previous!.log.slice(-overlap)) !==
            JSON.stringify(state.log.slice(0, overlap))
    )
        overlap--;
    const newLog = state.log.slice(overlap);
    function seek(next: number) {
        setPlaying(false);
        setIndex(Math.max(0, Math.min(frames.length - 1, next)));
    }
    useEffect(() => {
        if (!playing) return;
        if (index >= frames.length - 1) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(
            () => setIndex((i) => Math.min(i + 1, frames.length - 1)),
            1800 / speed,
        );
        return () => clearTimeout(timer);
    }, [playing, index, speed, frames.length]);
    useEffect(() => {
        const keyboard = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest(
                    "input,select,textarea,button,a,[contenteditable=true],[role=dialog]",
                )
            )
                return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setPlaying(false);
                setIndex((i) =>
                    Math.max(
                        0,
                        Math.min(
                            frames.length - 1,
                            i + (e.key === "ArrowRight" ? 1 : -1),
                        ),
                    ),
                );
            }
            if (e.code === "Space") {
                e.preventDefault();
                setPlaying((p) => !p);
            }
        };
        window.addEventListener("keydown", keyboard);
        return () => window.removeEventListener("keydown", keyboard);
    }, [frames.length]);
    useEffect(() => {
        const item = document.querySelector<HTMLElement>(
            `[data-replay-index="${index}"]`,
        );
        const list = item?.parentElement;
        if (item && list) {
            const top = item.offsetTop - list.offsetTop;
            if (
                top < list.scrollTop ||
                top + item.offsetHeight > list.scrollTop + list.clientHeight
            )
                list.scrollTop = Math.max(0, top - list.clientHeight / 2);
        }
    }, [index]);
    const actor =
        state.players.find((p) => p.id === frame?.actor_id)?.name || "Arena";
    return (
        <GameDisplay label="Replay display">
            <Head title={`Review · ${game.name}`} />
            <header className="match-header replay-heading">
                <div>
                    <Eyebrow>Match review · {game.code}</Eyebrow>
                    <h1>{game.name}</h1>
                </div>
                <p className="muted">Recorded outcomes · Read-only replay</p>
                <Link className="button small" href={`/games/${game.code}`}>
                    Match result
                </Link>
            </header>
            {!frame ? (
                <p className="empty-arena">
                    No recorded moves are available for this match.
                </p>
            ) : (
                <>
                    <section
                        className="replay-controls"
                        aria-label="Replay controls"
                    >
                        <div className="replay-transport">
                            <button
                                type="button"
                                className="icon-button"
                                aria-label="First action"
                                disabled={index === 0}
                                onClick={() => seek(0)}
                            >
                                <BackwardIcon />
                            </button>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label="Previous action"
                                disabled={index === 0}
                                onClick={() => seek(index - 1)}
                            >
                                <ChevronLeftIcon />
                            </button>
                            <button
                                type="button"
                                className="button primary"
                                disabled={frames.length < 2}
                                onClick={() => {
                                    if (index === frames.length - 1)
                                        setIndex(0);
                                    setPlaying(!playing);
                                }}
                            >
                                {playing ? <PauseIcon /> : <PlayIcon />}
                                {playing ? "Pause" : "Play"}
                            </button>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label="Next action"
                                disabled={index === frames.length - 1}
                                onClick={() => seek(index + 1)}
                            >
                                <ChevronRightIcon />
                            </button>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label="Last action"
                                disabled={index === frames.length - 1}
                                onClick={() => seek(frames.length - 1)}
                            >
                                <ForwardIcon />
                            </button>
                        </div>
                        <label className="replay-scrubber">
                            Action {index + 1} of {frames.length}
                            <input
                                name="replay_position"
                                aria-label="Replay position"
                                type="range"
                                min={0}
                                max={frames.length - 1}
                                value={index}
                                onChange={(e) => seek(Number(e.target.value))}
                            />
                        </label>
                        <label>
                            Speed
                            <select
                                name="replay_speed"
                                value={speed}
                                onChange={(e) =>
                                    setSpeed(Number(e.target.value))
                                }
                            >
                                {[0.5, 1, 2, 4].map((s) => (
                                    <option key={s} value={s}>
                                        {s}×
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Jump to
                            <select
                                name="replay_turn"
                                aria-label="Jump to turn"
                                value={
                                    [...boundaries]
                                        .reverse()
                                        .find((i) => i <= index) ?? 0
                                }
                                onChange={(e) => seek(Number(e.target.value))}
                            >
                                {boundaries.map((i) => (
                                    <option key={i} value={i}>
                                        {frames[i].state.phase === "finished"
                                            ? "Result"
                                            : moment(frames[i])}{" "}
                                        ·{" "}
                                        {frames[i].state.players.find(
                                            (p) =>
                                                p.id ===
                                                frames[i].state.turn_player_id,
                                        )?.name || "Both players"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            View from
                            <select
                                name="replay_perspective"
                                value={perspective}
                                onChange={(e) =>
                                    setPerspective(Number(e.target.value))
                                }
                            >
                                {game.state.players.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>
                    <div
                        className="battle-status replay-status"
                        aria-live="polite"
                    >
                        <span>
                            {moment(frame)} ·{" "}
                            {actionNames[frame.action] || frame.action}
                        </span>
                        <span>{actor}</span>
                        <time dateTime={frame.created_at}>
                            {new Date(frame.created_at).toLocaleString()}
                        </time>
                    </div>
                    <div className="battle-layout replay-layout">
                        <aside className="battle-log">
                            <Eyebrow>Move history</Eyebrow>
                            <div
                                className="replay-history"
                                aria-label="Recorded actions"
                            >
                                {frames.map((f, i) => (
                                    <button
                                        type="button"
                                        key={f.version}
                                        data-replay-index={i}
                                        aria-current={
                                            i === index ? "step" : undefined
                                        }
                                        onClick={() => seek(i)}
                                    >
                                        <small>
                                            {moment(f)} · #{i + 1}
                                        </small>
                                        <strong>
                                            {actionNames[f.action] || f.action}
                                        </strong>
                                        <span>
                                            {f.state.players.find(
                                                (p) => p.id === f.actor_id,
                                            )?.name || "Arena"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </aside>
                        <div className="battle-canvas">
                            <Suspense
                                fallback={
                                    <div className="scene-loading">
                                        Restoring the recorded battlefield…
                                    </div>
                                }
                            >
                                <Battlefield
                                    units={state.units}
                                    viewerId={perspective}
                                    homeSide={
                                        perspective === state.host_id
                                            ? "south"
                                            : "north"
                                    }
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    onTile={() => {}}
                                />
                            </Suspense>
                            {!state.units.length && (
                                <div className="replay-draft-overlay">
                                    {state.players.map((p) => (
                                        <div key={p.id}>
                                            <strong>{p.name}</strong>
                                            <div>
                                                {(
                                                    state.draft_picks[p.id] ||
                                                    []
                                                ).map((id) => (
                                                    <figure key={id}>
                                                        <Portrait id={id} />
                                                        <figcaption>
                                                            {catalog[id].name}
                                                        </figcaption>
                                                    </figure>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="canvas-instructions">
                                Drag to orbit · Select a champion to inspect ·
                                Arrow keys step through actions
                            </p>
                        </div>
                        <aside className="unit-panel replay-inspector">
                            {selected ? (
                                <>
                                    <div className="unit-portrait">
                                        <Portrait id={selected.character_id} />
                                        <div>
                                            <span>
                                                {
                                                    state.players.find(
                                                        (p) =>
                                                            p.id ===
                                                            selected.owner_id,
                                                    )?.name
                                                }{" "}
                                                · {coordinate(selected)}
                                            </span>
                                            <h2>
                                                {
                                                    catalog[
                                                        selected.character_id
                                                    ].name
                                                }
                                            </h2>
                                        </div>
                                    </div>
                                    <div className="unit-details">
                                        <p>
                                            Health {selected.hp}/
                                            {selected.max_hp} · Mana{" "}
                                            {selected.mana}/{selected.max_mana}
                                        </p>
                                        <p>
                                            Facing {selected.facing} · Recovery{" "}
                                            {selected.recovery} · Cooldown{" "}
                                            {selected.cooldown}
                                        </p>
                                        <p>
                                            {Object.entries(selected.statuses)
                                                .filter(([, v]) => v > 0)
                                                .map(([k, v]) => `${k}: ${v}`)
                                                .join(" · ") ||
                                                "No status effects"}
                                        </p>
                                        <strong>
                                            {
                                                catalog[selected.character_id]
                                                    .skill.name
                                            }
                                        </strong>
                                        <p>
                                            {
                                                catalog[selected.character_id]
                                                    .skill.description
                                            }
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="unit-details">
                                    <Eyebrow>Inspect the position</Eyebrow>
                                    <p>
                                        Select any miniature to see its recorded
                                        health, mana and status effects.
                                    </p>
                                </div>
                            )}
                            <div className="replay-changes">
                                <h2>This action</h2>
                                {newLog.map((l, i) => (
                                    <p key={i}>{l.text}</p>
                                ))}
                                {diff.map((d) => (
                                    <div key={d.id}>
                                        <strong>{d.prefix}</strong>
                                        <ul role="list">
                                            {d.details.map((detail) => (
                                                <li key={detail}>{detail}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                {!diff.length && !newLog.length && (
                                    <p>
                                        {frame.action === "end_turn"
                                            ? "The turn passed to the other commander."
                                            : "No combat resources changed."}
                                    </p>
                                )}
                            </div>
                        </aside>
                    </div>
                    <div className="replay-footer">
                        <button
                            type="button"
                            className="button small"
                            disabled={!boundaries.some((i) => i < index)}
                            onClick={() =>
                                seek(
                                    [...boundaries]
                                        .reverse()
                                        .find((i) => i < index) ?? 0,
                                )
                            }
                        >
                            Previous turn
                        </button>
                        <p>
                            Review positioning, resource use and recorded rolls.
                            Replaying never changes the match.
                        </p>
                        <button
                            type="button"
                            className="button small"
                            disabled={!boundaries.some((i) => i > index)}
                            onClick={() =>
                                seek(
                                    boundaries.find((i) => i > index) ??
                                        frames.length - 1,
                                )
                            }
                        >
                            Next turn
                        </button>
                    </div>
                </>
            )}
        </GameDisplay>
    );
}
