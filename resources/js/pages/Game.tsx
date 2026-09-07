import "../../css/replay.css";
import GameDisplay from "../components/GameDisplay";
import Deadline from "../components/Deadline";
import Dialog from "../components/Dialog";
import { Head, Link, usePage, router } from "@inertiajs/react";
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowRightIcon,
    ArrowPathIcon,
    FlagIcon,
    CheckIcon,
    ClipboardIcon,
    BoltIcon,
    HeartIcon,
    ShieldCheckIcon,
    ClockIcon,
} from "@heroicons/react/16/solid";
import { Eyebrow, ErrorBanner } from "../components/Shell";
import CharacterCard, { Portrait } from "../components/CharacterCard";
import { api, errorMessage, realtime } from "../api";
import type { Game as GameType, Shared, Unit } from "../types";
const Battlefield = lazy(() => import("../components/Battlefield"));
const coordinate = (x: number, y: number) => `${"ABCDEFGH"[x]}${8 - y}`;
function reachable(unit: Unit, units: Unit[], range: number) {
    const occupied = new Set(
        units.filter((u) => u.hp > 0).map((u) => `${u.x},${u.y}`),
    );
    const found = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, d: 0 }];
    const result: { x: number; y: number; kind: string }[] = [];
    for (let i = 0; i < queue.length; i++) {
        const { x, y, d } = queue[i];
        if (d >= range) continue;
        for (const [nx, ny] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
        ]) {
            const key = `${nx},${ny}`;
            if (
                nx < 0 ||
                nx > 7 ||
                ny < 0 ||
                ny > 7 ||
                found.has(key) ||
                occupied.has(key)
            )
                continue;
            found.add(key);
            queue.push({ x: nx, y: ny, d: d + 1 });
            result.push({ x: nx, y: ny, kind: "move" });
        }
    }
    return result;
}
export default function Game() {
    const props = usePage<Shared & { game: GameType }>().props;
    const viewer = props.auth.user!;
    const catalog = props.catalog;
    const [game, setGame] = useState(props.game);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draftChoice, setDraftChoice] = useState<string | null>(null);
    const [mode, setMode] = useState<"move" | "attack" | "skill">("move");
    const [connected, setConnected] = useState(false);
    const [confirmResign, setConfirmResign] = useState(false);
    const [copied, setCopied] = useState(false);
    const [destination, setDestination] = useState("");
    const practice = game.mode === "practice";
    const [syncing, setSyncing] = useState(false);
    const refreshRef = useRef(false);
    const state = game.state;
    const mine = state.players.some((p) => p.id === viewer.id);
    const myTurn = state.turn_player_id === viewer.id;
    const opponent = state.players.find((p) => p.id !== viewer.id);
    const selected = state.units.find((u) => u.id === selectedId);
    const character = selected ? catalog[selected.character_id] : undefined;
    const update = useCallback(
        (next: GameType) =>
            setGame((old) => (next.version >= old.version ? next : old)),
        [],
    );
    const refresh = useCallback(async () => {
        if (refreshRef.current) return;
        refreshRef.current = true;
        try {
            const r = await api.get(`/games/${props.game.code}/state`);
            update(r.data.game);
            setSyncing(false);
        } catch {
            setSyncing(true);
        } finally {
            refreshRef.current = false;
        }
    }, [props.game.code, update]);
    useEffect(() => {
        const e = realtime();
        const channel = mine
            ? e?.private(`game.${game.id}`)
            : e?.channel("lobby");
        channel?.listen(mine ? ".game.updated" : ".lobby.updated", refresh);
        channel?.subscribed(() => setConnected(true));
        const connection = e?.connector.pusher.connection;
        const online = () => {
            setConnected(true);
            refresh();
        };
        const offline = () => setConnected(false);
        connection?.bind("connected", online);
        connection?.bind("disconnected", offline);
        connection?.bind("unavailable", offline);

        const timer = setInterval(refresh, 3000);
        window.addEventListener("focus", refresh);
        window.addEventListener("online", refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("online", refresh);
            e?.leave(mine ? `game.${game.id}` : "lobby");
            connection?.unbind("connected", online);
            connection?.unbind("disconnected", offline);
            connection?.unbind("unavailable", offline);
        };
    }, [game.id, mine, refresh]);
    useEffect(() => {
        setDraftChoice(null);
        setMode("move");
        setDestination("");
    }, [state.turn_player_id, state.phase]);
    useEffect(() => {
        if (state.phase === "finished") router.reload({ only: ["auth"] });
    }, [state.phase]);
    async function action(type: string, payload: Record<string, unknown> = {}) {
        if (busyRef.current || syncing) return;
        busyRef.current = true;
        setBusy(true);
        setError("");
        try {
            const r = await api.post(`/games/${game.code}/actions`, {
                type,
                version: game.version,
                ...payload,
            });
            update(r.data.game);
            if (type === "draft") setDraftChoice(null);
            if (type === "end_turn") {
                setSelectedId(null);
                setMode("move");
            }
            setDestination("");
        } catch (e) {
            setError(errorMessage(e));
            await refresh();
        } finally {
            setBusy(false);
            busyRef.current = false;
        }
    }
    const canControl = Boolean(
        selected &&
        selected.owner_id === viewer.id &&
        selected.hp > 0 &&
        myTurn &&
        !syncing &&
        (!state.active_unit_id || state.active_unit_id === selected.id) &&
        (selected.recovery === 0 || state.active_unit_id === selected.id) &&
        !selected.statuses.stun &&
        state.phase === "battle",
    );
    const targets = useMemo(() => {
        if (!selected || !character || !canControl || mode === "move")
            return [];
        const skill = mode === "skill";
        const target = skill ? character.skill.target : "enemy";
        const range = skill ? character.skill.range : character.range;
        return state.units.filter(
            (u) =>
                u.hp > 0 &&
                (target === "self"
                    ? u.id === selected.id
                    : target === "enemy"
                      ? u.owner_id !== viewer.id
                      : u.owner_id === viewer.id) &&
                Math.abs(u.x - selected.x) + Math.abs(u.y - selected.y) <=
                    range,
        );
    }, [selected, character, canControl, mode, state.units, viewer.id]);
    const highlights = useMemo(() => {
        if (!selected) return [];
        if (
            state.phase === "deployment" &&
            selected.owner_id === viewer.id &&
            !state.ready.includes(viewer.id)
        ) {
            return (viewer.id === state.host_id ? [6, 7] : [0, 1]).flatMap(
                (y) =>
                    Array.from({ length: 8 }, (_, x) => ({
                        x,
                        y,
                        kind: "move",
                    })),
            );
        }
        if (!canControl) return [];
        if (mode !== "move")
            return targets.map((u) => ({
                x: u.x,
                y: u.y,
                kind: mode === "attack" ? "attack" : "skill",
            }));
        if (state.moved || selected.statuses.root) return [];
        return reachable(selected, state.units, character!.move);
    }, [
        selected,
        state.phase,
        state.ready,
        state.host_id,
        state.units,
        state.moved,
        viewer.id,
        canControl,
        mode,
        targets,
        character,
    ]);
    function select(id: string) {
        if (
            selected &&
            canControl &&
            mode !== "move" &&
            targets.some((u) => u.id === id)
        ) {
            void action(mode, { unit_id: selected.id, target_id: id });
            return;
        }
        setSelectedId(id);
        setMode("move");
        setDestination("");
    }
    function tile(x: number, y: number) {
        if (
            !selected ||
            !highlights.some((t) => t.x === x && t.y === y) ||
            busy
        )
            return;
        if (state.phase === "deployment")
            void action("deploy", { unit_id: selected.id, x, y });
        else if (mode === "move")
            void action("move", { unit_id: selected.id, x, y });
        else {
            const target = state.units.find(
                (u) => u.hp > 0 && u.x === x && u.y === y,
            );
            if (target)
                void action(mode, {
                    unit_id: selected.id,
                    target_id: target.id,
                });
        }
    }
    async function copy() {
        try {
            await navigator.clipboard.writeText(
                `${window.location.origin}/games/${game.code}`,
            );
            setCopied(true);
        } catch {
            setError(`Invite code: ${game.code}`);
        }
    }
    async function claim(id: string) {
        setBusy(true);
        try {
            const r = await api.post(`/games/${game.code}/claim`, {
                character_id: id,
            });
            update(r.data.game);
            router.reload({ only: ["auth"] });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }
    const phaseIndex = [
        "lobby",
        "draft",
        "deployment",
        "battle",
        "finished",
    ].indexOf(state.phase);
    const ownPicks = state.draft_picks[viewer.id] || [];
    const enemyPicks = opponent ? state.draft_picks[opponent.id] || [] : [];
    return (
        <GameDisplay>
            <Head title={game.name} />
            <div className="match-header">
                <div>
                    <Eyebrow>
                        {practice
                            ? "Solo practice · Computer opponent"
                            : game.time_control === "correspondence"
                              ? "Correspondence · 24h per turn"
                              : game.ranked
                                ? "Ranked match"
                                : "Friendly match"}{" "}
                        · {game.code}
                    </Eyebrow>
                    <h1>{game.name}</h1>
                </div>
                <div className="match-steps">
                    {["Lobby", "Draft", "Deploy", "Battle"].map((name, i) => (
                        <div
                            className={
                                phaseIndex === i
                                    ? "current"
                                    : phaseIndex > i
                                      ? "complete"
                                      : ""
                            }
                            key={name}
                        >
                            <span>
                                {phaseIndex > i ? <CheckIcon /> : i + 1}
                            </span>
                            {name}
                        </div>
                    ))}
                </div>
                <div className="connection">
                    <i className={connected ? "online" : ""} />
                    {busy && practice
                        ? "Computer responding…"
                        : syncing
                          ? "Reconnecting…"
                          : connected
                            ? "Live"
                            : "Connected · polling"}
                </div>
            </div>
            {syncing && (
                <div className="continuity-notice" role="status">
                    Connection interrupted. Your last saved board is still here.
                    Reconnecting automatically; wait for it to catch up before
                    your next move.
                </div>
            )}
            {practice && state.phase !== "finished" && (
                <div className="practice-notice">
                    <p>
                        Practice freely. Choose any six champions; the computer
                        follows the same rules. No ratings, crowns, or card
                        rewards.
                    </p>
                    <Link href="/" className="text-link">
                        Leave and resume later <ArrowRightIcon />
                    </Link>
                </div>
            )}
            {game.time_control === "correspondence" &&
                state.phase !== "finished" && (
                    <div className="correspondence-notice">
                        <Deadline
                            due={game.turn_due_at}
                            prefix={
                                state.phase === "deployment"
                                    ? "Lock formation"
                                    : state.phase === "draft"
                                      ? "Draft pick due"
                                      : "Turn ends"
                            }
                        />
                        <p>
                            {state.phase === "lobby"
                                ? "The 24-hour clock starts when your rival joins."
                                : state.phase === "deployment"
                                  ? "Each player must lock their formation before the deadline."
                                  : "Finish your turn before the deadline. Partial actions do not restart the clock."}{" "}
                            You can leave and return from My games in the arena.
                        </p>
                    </div>
                )}
            <ErrorBanner message={error} />
            {state.phase === "lobby" ? (
                <section className="waiting-room">
                    <div className="waiting-copy">
                        <Eyebrow>The call to arms</Eyebrow>
                        <h2>
                            {mine
                                ? "Your rival awaits an invitation."
                                : "An arena awaits its challenger."}
                        </h2>
                        <p>
                            Draft a warband of six from the shared roster and
                            specialist offers. Once both commanders arrive, the
                            draft begins.
                        </p>
                        <div className="player-seats">
                            <div>
                                <div className="seat-avatar">
                                    {state.players[0].name[0]}
                                </div>
                                <h3>{state.players[0].name}</h3>
                                <span>Host · Ready to draft</span>
                            </div>
                            <div className="versus">vs</div>
                            <div>
                                <div className="seat-avatar empty">?</div>
                                <h3>Open seat</h3>
                                <span>Waiting for a challenger</span>
                            </div>
                        </div>
                        {mine ? (
                            <>
                                <button
                                    type="button"
                                    className="button primary"
                                    onClick={copy}
                                >
                                    <ClipboardIcon />
                                    {copied
                                        ? "Invite link copied"
                                        : "Copy invitation"}
                                </button>
                                <p className="invite-code">
                                    Invite code <strong>{game.code}</strong>
                                </p>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="button primary"
                                disabled={busy}
                                onClick={() => action("join")}
                            >
                                Join & begin draft
                                <ArrowRightIcon />
                            </button>
                        )}
                    </div>
                    <div className="waiting-illustration">
                        <Portrait id="herald" />
                        <p>The banner is raised.</p>
                    </div>
                </section>
            ) : null}
            {state.phase === "draft" ? (
                <section className="draft-room">
                    <div className="draft-title">
                        <Eyebrow>Build your six</Eyebrow>
                        <h2>
                            {myTurn
                                ? "Choose your next champion."
                                : `${opponent?.name} is choosing.`}
                        </h2>
                        <p>
                            {practice
                                ? "The full roster is available. Try a new combination."
                                : "Read their formation. Find your counter."}{" "}
                            <span className="gold">
                                Pick{" "}
                                {ownPicks.length + 1 > 6
                                    ? 6
                                    : ownPicks.length + 1}{" "}
                                of 6
                            </span>
                        </p>
                    </div>
                    <div className="opponent-draft">
                        <div>
                            <span className="enemy-dot" />
                            {opponent?.name}'s warband{" "}
                            <small>{enemyPicks.length}/6 drafted</small>
                        </div>
                        <div className="draft-slots mini">
                            {Array.from({ length: 6 }, (_, i) =>
                                enemyPicks[i] ? (
                                    <div
                                        key={i}
                                        title={catalog[enemyPicks[i]].name}
                                    >
                                        <Portrait id={enemyPicks[i]} />
                                        <span>
                                            {catalog[enemyPicks[i]].role}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="empty-slot" key={i}>
                                        {i + 1}
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                    <div
                        className={`draft-offers ${practice ? "practice-offers" : ""}`}
                    >
                        {(state.offers[viewer.id] || []).map((id) => (
                            <CharacterCard
                                key={id}
                                compact={practice}
                                character={catalog[id]}
                                tag={
                                    catalog[id].standard
                                        ? "Shared roster"
                                        : "Specialist"
                                }
                                selected={draftChoice === id}
                                onClick={() => setDraftChoice(id)}
                                disabled={!myTurn || busy}
                            />
                        ))}
                    </div>
                    <div className="draft-confirm">
                        <p>
                            {draftChoice
                                ? practice
                                    ? `${catalog[draftChoice].skill.name}: ${catalog[draftChoice].skill.description}`
                                    : catalog[draftChoice].passive
                                : myTurn
                                  ? "Select a card to inspect, then add it to your warband."
                                  : "Watch their picks and plan your response."}
                        </p>
                        <button
                            type="button"
                            className="button primary"
                            disabled={!myTurn || !draftChoice || busy}
                            onClick={() =>
                                draftChoice &&
                                action("draft", { character_id: draftChoice })
                            }
                        >
                            {busy
                                ? "Drafting…"
                                : draftChoice
                                  ? `Draft ${catalog[draftChoice].name}`
                                  : "Choose a champion"}
                            <ArrowRightIcon />
                        </button>
                    </div>
                    <div className="your-draft">
                        <h3>
                            Your warband <small>{ownPicks.length}/6</small>
                        </h3>
                        <div className="draft-slots">
                            {Array.from({ length: 6 }, (_, i) =>
                                ownPicks[i] ? (
                                    <div key={i}>
                                        <Portrait id={ownPicks[i]} />
                                        <span>{catalog[ownPicks[i]].name}</span>
                                    </div>
                                ) : (
                                    <div className="empty-slot" key={i}>
                                        <span>✦</span>
                                        <small>Champion {i + 1}</small>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                </section>
            ) : null}
            {["deployment", "battle", "finished"].includes(state.phase) && (
                <>
                    {state.phase === "finished" && (
                        <section className="result-banner">
                            <div>
                                <Eyebrow>The battle is decided</Eyebrow>
                                <h2>
                                    {!state.winner_id
                                        ? "Match drawn."
                                        : state.winner_id === viewer.id
                                          ? "Victory is yours."
                                          : state.winner_id
                                            ? "A worthy battle."
                                            : "The arena is closed."}
                                </h2>
                                <p>
                                    {!state.winner_id
                                        ? "Neither formation was locked before the deadline."
                                        : state.winner_id === viewer.id
                                          ? "Your warband stands triumphant."
                                          : `${state.players.find((p) => p.id === state.winner_id)?.name || "Your rival"} takes the field.`}
                                </p>
                            </div>
                            <div className="result-rewards">
                                {practice ? (
                                    <p>
                                        No stakes. Just a strategy to learn
                                        from.
                                    </p>
                                ) : (
                                    <>
                                        <strong>
                                            {(state.rewards?.[viewer.id]
                                                ?.rating_delta || 0) >= 0
                                                ? "+"
                                                : ""}
                                            {state.rewards?.[viewer.id]
                                                ?.rating_delta || 0}
                                            <span>Rating</span>
                                        </strong>
                                        <strong>
                                            +
                                            {state.rewards?.[viewer.id]
                                                ?.currency || 0}
                                            <span>Crowns</span>
                                        </strong>
                                    </>
                                )}
                                <Link
                                    href={`/games/${game.code}/replay`}
                                    className="button"
                                >
                                    Review match
                                </Link>
                                <Link href="/" className="button primary">
                                    Back to arena
                                    <ArrowRightIcon />
                                </Link>
                            </div>
                            {!practice &&
                                state.winner_id === viewer.id &&
                                state.turn_number >= 9 &&
                                !game.reward_claimed &&
                                (state.reward_candidates[viewer.id] || [])
                                    .length > 0 && (
                                    <div className="claim-rewards">
                                        <p>
                                            Keep one of your specialist loans.
                                            Owned duplicates return 40 crowns.
                                        </p>
                                        {state.reward_candidates[viewer.id].map(
                                            (id) => (
                                                <button
                                                    type="button"
                                                    key={id}
                                                    className="button"
                                                    disabled={busy}
                                                    onClick={() => claim(id)}
                                                >
                                                    Keep {catalog[id].name}
                                                </button>
                                            ),
                                        )}
                                    </div>
                                )}
                            {game.reward_claimed && (
                                <p className="claim-success">
                                    <CheckIcon /> Champion reward claimed
                                </p>
                            )}
                        </section>
                    )}
                    <div className="battle-status">
                        <div>
                            <span className="team-dot" />
                            {viewer.name}{" "}
                            <small>
                                {
                                    state.units.filter(
                                        (u) =>
                                            u.owner_id === viewer.id &&
                                            u.hp > 0,
                                    ).length
                                }
                                /6 standing
                            </small>
                        </div>
                        <div className="turn-announcement">
                            {state.phase === "deployment"
                                ? state.ready.includes(viewer.id)
                                    ? "Formation locked · waiting for rival"
                                    : "Arrange your starting formation"
                                : state.phase === "finished"
                                  ? "Battle complete"
                                  : myTurn
                                    ? "Your turn"
                                    : `${opponent?.name}'s turn`}
                            <small>
                                {state.phase === "battle"
                                    ? `Turn ${state.turn_number} · Activate one champion`
                                    : state.phase === "deployment"
                                      ? "Place champions in your two home rows"
                                      : "The Sunken Court"}
                            </small>
                        </div>
                        <div>
                            {opponent?.name}
                            <span className="enemy-dot" />
                        </div>
                    </div>
                    <div className="battle-layout">
                        <aside className="battle-log">
                            <Eyebrow>Chronicle</Eyebrow>
                            <h3>Echoes of battle</h3>
                            <div className="log-entries" aria-live="polite">
                                {state.log.length ? (
                                    state.log
                                        .slice(-18)
                                        .reverse()
                                        .map((entry, i) => (
                                            <div
                                                key={`${state.log.length - i}`}
                                            >
                                                <small>
                                                    {entry.turn
                                                        ? `Turn ${entry.turn}`
                                                        : "Preparation"}
                                                </small>
                                                <p>
                                                    {entry.text.replace(
                                                        /Player (\d+)/g,
                                                        (_, id) =>
                                                            state.players.find(
                                                                (p) =>
                                                                    p.id ===
                                                                    Number(id),
                                                            )?.name ||
                                                            "Commander",
                                                    )}
                                                </p>
                                            </div>
                                        ))
                                ) : (
                                    <p className="muted">
                                        Choose a champion, then a starting tile.
                                        Your opponent's positions stay hidden
                                        until both sides are ready.
                                    </p>
                                )}
                            </div>
                        </aside>
                        <div className="battle-canvas">
                            <Suspense
                                fallback={
                                    <div className="scene-loading">
                                        Summoning the battlefield…
                                    </div>
                                }
                            >
                                <Battlefield
                                    units={state.units}
                                    viewerId={viewer.id}
                                    homeSide={
                                        viewer.id === state.host_id
                                            ? "south"
                                            : "north"
                                    }
                                    selectedId={selectedId}
                                    onSelect={select}
                                    onTile={tile}
                                    highlights={highlights}
                                    deployment={state.phase === "deployment"}
                                    interactive={!busy}
                                />
                            </Suspense>
                            <div className="canvas-instructions">
                                Drag to orbit · Scroll to zoom · Select a
                                champion to command
                            </div>
                            {busy && (
                                <div className="board-busy">
                                    <ArrowPathIcon /> Resolving…
                                </div>
                            )}
                        </div>
                        <aside className="unit-panel">
                            {selected && character ? (
                                <>
                                    <div className="unit-portrait">
                                        <Portrait id={character.id} />
                                        <div>
                                            <span>
                                                {character.role} ·{" "}
                                                {coordinate(
                                                    selected.x,
                                                    selected.y,
                                                )}
                                            </span>
                                            <h2>{character.name}</h2>
                                        </div>
                                    </div>
                                    <div className="unit-details">
                                        <div className="resource-bar">
                                            <label>
                                                <HeartIcon />
                                                Health{" "}
                                                <span>
                                                    {selected.hp} /{" "}
                                                    {selected.max_hp}
                                                </span>
                                            </label>
                                            <div>
                                                <i
                                                    style={{
                                                        width: `${(selected.hp / selected.max_hp) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="resource-bar mana">
                                            <label>
                                                <BoltIcon />
                                                Mana{" "}
                                                <span>
                                                    {selected.mana} /{" "}
                                                    {selected.max_mana}
                                                </span>
                                            </label>
                                            <div>
                                                <i
                                                    style={{
                                                        width: `${(selected.mana / selected.max_mana) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="unit-stats">
                                            <span>
                                                <BoltIcon />
                                                {character.attack} ATK
                                            </span>
                                            <span>
                                                <ShieldCheckIcon />
                                                {character.armor} ARM
                                            </span>
                                            <span>
                                                <ClockIcon />
                                                {selected.recovery} REST
                                            </span>
                                        </div>
                                        <div className="unit-statuses">
                                            {Object.entries(selected.statuses)
                                                .filter(([, n]) => n > 0)
                                                .map(([status, n]) => (
                                                    <span key={status}>
                                                        {status} · {n}
                                                    </span>
                                                ))}
                                        </div>
                                        <p className="passive">
                                            {character.passive}
                                        </p>
                                        {state.phase === "battle" && (
                                            <>
                                                <div className="action-modes">
                                                    <button
                                                        type="button"
                                                        className={
                                                            mode === "move"
                                                                ? "active"
                                                                : ""
                                                        }
                                                        disabled={
                                                            !canControl ||
                                                            state.moved ||
                                                            !!selected.statuses
                                                                .root
                                                        }
                                                        onClick={() =>
                                                            setMode("move")
                                                        }
                                                    >
                                                        Move
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={
                                                            mode === "attack"
                                                                ? "active"
                                                                : ""
                                                        }
                                                        disabled={
                                                            !canControl ||
                                                            state.acted
                                                        }
                                                        onClick={() =>
                                                            setMode("attack")
                                                        }
                                                    >
                                                        Attack
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`skill-button ${mode === "skill" ? "active" : ""}`}
                                                    disabled={
                                                        !canControl ||
                                                        state.acted ||
                                                        selected.cooldown > 0 ||
                                                        selected.mana <
                                                            character.skill.cost
                                                    }
                                                    onClick={() =>
                                                        setMode("skill")
                                                    }
                                                >
                                                    <span>
                                                        {character.skill.name}
                                                        <small>
                                                            {
                                                                character.skill
                                                                    .cost
                                                            }{" "}
                                                            mana ·{" "}
                                                            {selected.cooldown
                                                                ? `${selected.cooldown} turns left`
                                                                : "Ready"}
                                                        </small>
                                                    </span>
                                                    <BoltIcon />
                                                </button>
                                                <p className="skill-description">
                                                    {
                                                        character.skill
                                                            .description
                                                    }
                                                </p>
                                                {canControl &&
                                                    mode !== "move" &&
                                                    !state.acted && (
                                                        <div className="target-list">
                                                            <p>
                                                                {mode ===
                                                                "attack"
                                                                    ? `${character.accuracy}% hit · facing affects block`
                                                                    : "Choose a target"}
                                                            </p>
                                                            {targets.length ? (
                                                                targets.map(
                                                                    (u) => (
                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                busy
                                                                            }
                                                                            key={
                                                                                u.id
                                                                            }
                                                                            onClick={() =>
                                                                                action(
                                                                                    mode,
                                                                                    {
                                                                                        unit_id:
                                                                                            selected.id,
                                                                                        target_id:
                                                                                            u.id,
                                                                                    },
                                                                                )
                                                                            }
                                                                        >
                                                                            {
                                                                                catalog[
                                                                                    u
                                                                                        .character_id
                                                                                ]
                                                                                    .name
                                                                            }
                                                                            <span>
                                                                                {coordinate(
                                                                                    u.x,
                                                                                    u.y,
                                                                                )}
                                                                            </span>
                                                                        </button>
                                                                    ),
                                                                )
                                                            ) : (
                                                                <p>
                                                                    No targets
                                                                    in range.
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                {canControl && (
                                                    <label className="facing-label">
                                                        Facing
                                                        <select
                                                            name="facing"
                                                            value={
                                                                selected.facing
                                                            }
                                                            disabled={busy}
                                                            onChange={(e) =>
                                                                action("face", {
                                                                    unit_id:
                                                                        selected.id,
                                                                    facing: e
                                                                        .target
                                                                        .value,
                                                                })
                                                            }
                                                        >
                                                            {[
                                                                "north",
                                                                "east",
                                                                "south",
                                                                "west",
                                                            ].map((f) => (
                                                                <option
                                                                    key={f}
                                                                    value={f}
                                                                >
                                                                    {f
                                                                        .charAt(
                                                                            0,
                                                                        )
                                                                        .toUpperCase() +
                                                                        f.slice(
                                                                            1,
                                                                        )}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                )}
                                            </>
                                        )}
                                        {highlights.length > 0 &&
                                            (mode === "move" ||
                                                state.phase ===
                                                    "deployment") && (
                                                <label>
                                                    Destination
                                                    <select
                                                        name="destination"
                                                        value={destination}
                                                        onChange={(e) => {
                                                            setDestination(
                                                                e.target.value,
                                                            );
                                                            if (
                                                                e.target.value
                                                            ) {
                                                                const [x, y] =
                                                                    e.target.value
                                                                        .split(
                                                                            ",",
                                                                        )
                                                                        .map(
                                                                            Number,
                                                                        );
                                                                tile(x, y);
                                                            }
                                                        }}
                                                    >
                                                        <option value="">
                                                            Choose a highlighted
                                                            tile
                                                        </option>
                                                        {highlights.map((t) => (
                                                            <option
                                                                key={`${t.x},${t.y}`}
                                                                value={`${t.x},${t.y}`}
                                                            >
                                                                {coordinate(
                                                                    t.x,
                                                                    t.y,
                                                                )}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            )}
                                        {!canControl &&
                                            state.phase === "battle" && (
                                                <p className="hint">
                                                    {selected.owner_id !==
                                                    viewer.id
                                                        ? "Enemy champion"
                                                        : !myTurn
                                                          ? "Waiting for your next turn"
                                                          : selected.recovery >
                                                              0
                                                            ? "This champion is recovering"
                                                            : selected.statuses
                                                                    .stun
                                                              ? "This champion is stunned"
                                                              : "Another champion is active this turn"}
                                                </p>
                                            )}
                                    </div>
                                </>
                            ) : (
                                <div className="unit-empty">
                                    <span>✦</span>
                                    <h3>Select a champion.</h3>
                                    <p>
                                        Inspect their abilities, plan their
                                        path, and find your advantage.
                                    </p>
                                </div>
                            )}
                        </aside>
                    </div>
                    <div className="battle-bottom">
                        <div className="unit-roster">
                            {state.units
                                .filter((u) => u.owner_id === viewer.id)
                                .map((u) => (
                                    <button
                                        type="button"
                                        key={u.id}
                                        className={`${selectedId === u.id ? "selected" : ""} ${u.hp <= 0 ? "fallen" : ""}`}
                                        title={`${catalog[u.character_id].name} · ${u.hp} HP · recovery ${u.recovery}`}
                                        onClick={() => {
                                            setSelectedId(u.id);
                                            setMode("move");
                                        }}
                                    >
                                        <Portrait id={u.character_id} />
                                        <div>
                                            <strong>
                                                {catalog[u.character_id].name}
                                            </strong>
                                            <span>
                                                {u.hp <= 0
                                                    ? "Fallen"
                                                    : u.recovery
                                                      ? `Recovering · ${u.recovery}`
                                                      : `${u.hp} HP · ${u.mana} mana`}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                        </div>
                        <div className="turn-actions">
                            {state.phase === "deployment" ? (
                                <button
                                    type="button"
                                    className="button primary"
                                    disabled={
                                        busy || state.ready.includes(viewer.id)
                                    }
                                    onClick={() => action("ready")}
                                >
                                    <CheckIcon />
                                    {state.ready.includes(viewer.id)
                                        ? "Formation locked"
                                        : "Lock formation"}
                                </button>
                            ) : state.phase === "battle" ? (
                                <button
                                    type="button"
                                    className="button primary"
                                    disabled={!myTurn || busy}
                                    onClick={() => action("end_turn")}
                                >
                                    End turn
                                    <ArrowRightIcon />
                                </button>
                            ) : null}
                            <p>
                                {state.phase === "battle"
                                    ? "Move + attack or cast, then end your turn."
                                    : "Protect your supports. Watch the flanks."}
                            </p>
                        </div>
                    </div>
                </>
            )}
            {mine && state.phase !== "finished" && (
                <div className="leave-row">
                    <button
                        type="button"
                        className="text-link subdued"
                        onClick={() => setConfirmResign(true)}
                    >
                        <FlagIcon />
                        {practice
                            ? "End practice"
                            : state.phase === "lobby"
                              ? "Close arena"
                              : "Resign match"}
                    </button>
                    <Link href="/guide" className="text-link" target="_blank">
                        Consult the field guide
                        <ArrowRightIcon />
                    </Link>
                </div>
            )}
            {confirmResign && (
                <Dialog
                    label="Concede the match"
                    onClose={() => setConfirmResign(false)}
                >
                    <Eyebrow>Lower your banner</Eyebrow>
                    <h2 id="resign-title">
                        {practice
                            ? "End this practice game?"
                            : state.phase === "lobby"
                              ? "Close this arena?"
                              : "Concede the match?"}
                    </h2>
                    <p>
                        {practice
                            ? "Keep this game as a replay and start fresh whenever you like. Your rating and collection stay the same."
                            : state.phase === "lobby"
                              ? "You can create a new arena any time."
                              : "Your opponent will win. This cannot be undone."}
                    </p>
                    <div className="modal-actions">
                        <button
                            type="button"
                            className="button"
                            onClick={() => setConfirmResign(false)}
                        >
                            Keep playing
                        </button>
                        <button
                            type="button"
                            className="button primary"
                            disabled={busy}
                            onClick={() => {
                                setConfirmResign(false);
                                void action("resign");
                            }}
                        >
                            Lower banner
                        </button>
                    </div>
                </Dialog>
            )}
        </GameDisplay>
    );
}
