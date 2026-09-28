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
import type {
    Game as GameType,
    LegalAttack,
    LegalMove,
    LegalSkillTarget,
    Shared,
} from "../types";
import { aimChip } from "../lib/aimChip";
import {
    createAnimationQueue,
    detectConfirmedSwap,
    type AnimationQueue,
    type QueueView,
} from "../lib/animationQueue";
type FloatScreen = {
    id: string;
    kind: string;
    title: string;
    value?: number;
    chance?: number;
    left: number;
    top: number;
    opacity: number;
    tileX: number;
    tileY: number;
};
type AnimHud = {
    turnBanner: string;
    opponentPlaying: boolean;
    floats: string;
    deathBanners: string;
    beat: string;
    floatKind: string;
    floatTitle: string;
    floatValue: string;
    floatChance: string;
    floatScreens: FloatScreen[];
};
function snapshotHud(view: QueueView, screens: FloatScreen[] = []): AnimHud & { inputLocked: boolean } {
    const primary = view.floats[0];
    return {
        inputLocked: view.inputLocked,
        turnBanner: view.turnBanner?.text ?? "",
        opponentPlaying: view.opponentPlaying,
        floats: view.floats
            .map((item) => `${item.kind}:${item.value ?? item.chance ?? ""}`)
            .join(","),
        deathBanners: view.deathBanners.map((item) => item.unitId).join(","),
        beat: view.currentType ?? "",
        floatKind: primary?.kind ?? "",
        floatTitle: primary?.title ?? "",
        floatValue: primary?.value !== undefined ? String(primary.value) : "",
        floatChance: primary?.chance !== undefined ? String(primary.chance) : "",
        floatScreens: screens,
    };
}
import { cameraForHome, fadedUnitIds } from "../lib/boardFade";
import { cueVisibility } from "../lib/reducedBoard";
const Battlefield = lazy(() => import("../components/Battlefield"));
const coordinate = (x: number, y: number) => `${"ABCDEFGH"[x]}${8 - y}`;
function facingFromPath(path: [number, number][]): string {
    if (path.length < 2) return "north";
    const [from, to] = path.slice(-2);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return Math.abs(dx) > Math.abs(dy)
        ? dx > 0
            ? "east"
            : "west"
        : dy > 0
          ? "south"
          : "north";
}
export default function Game() {
    const props = usePage<Shared & { game: GameType }>().props;
    const viewer = props.auth.user!;
    const catalog = props.catalog;
    const [game, setGame] = useState(props.game);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [animLocked, setAnimLocked] = useState(false);
    const [awaitingOpponent, setAwaitingOpponent] = useState(false);
    const [reducedMotionOn, setReducedMotionOn] = useState(false);
    const animLockedRef = useRef(false);
    const [animHud, setAnimHud] = useState<AnimHud>({
        turnBanner: "",
        opponentPlaying: false,
        floats: "",
        deathBanners: "",
        beat: "",
        floatKind: "",
        floatTitle: "",
        floatValue: "",
        floatChance: "",
        floatScreens: [],
    });
    const floatScreensRef = useRef<FloatScreen[]>([]);
    const queueRef = useRef<AnimationQueue | null>(null);
    if (!queueRef.current) {
        queueRef.current = createAnimationQueue({
            viewerId: viewer.id,
            playerName: (id) =>
                props.game.state.players.find((player) => player.id === id)?.name ??
                "Opponent",
        });
    }
    if (typeof window !== "undefined") {
        (
            window as Window & { __wondrousQueue?: AnimationQueue }
        ).__wondrousQueue = queueRef.current;
    }
    const seenVersion = useRef(props.game.version);
    const prevUnits = useRef(props.game.state.units);
    const gameIdRef = useRef(props.game.id);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draftChoice, setDraftChoice] = useState<string | null>(null);
    const [mode, setMode] = useState<"attack" | "skill">("attack");
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const [connected, setConnected] = useState(false);
    const [confirmResign, setConfirmResign] = useState(false);
    const [copied, setCopied] = useState(false);
    const [dismissedLesson, setDismissedLesson] = useState("");
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

        const motion = new URLSearchParams(window.location.search).get("motion");
        const timer = setInterval(refresh, motion === "slow" || motion === "reduce" ? 400 : 3000);
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
        setMode("attack");
        setHover(null);
    }, [state.turn_player_id, state.phase]);
    useEffect(() => {
        if (state.phase === "finished") router.reload({ only: ["auth"] });
    }, [state.phase]);
    useEffect(() => {
        const unsubscribe = queueRef.current?.onLock((locked) => {
            animLockedRef.current = locked;
            setAnimLocked(locked);
        });
        return () => {
            unsubscribe?.();
        };
    }, []);
    const applyHud = useCallback((view: QueueView) => {
        const snap = snapshotHud(view, floatScreensRef.current);
        if (snap.inputLocked !== animLockedRef.current) {
            animLockedRef.current = snap.inputLocked;
            setAnimLocked(snap.inputLocked);
        }
        setAnimHud((prev) => {
            const next: AnimHud = {
                turnBanner: snap.turnBanner,
                opponentPlaying: snap.opponentPlaying,
                floats: snap.floats,
                deathBanners: snap.deathBanners,
                beat: snap.beat,
                floatKind: snap.floatKind,
                floatTitle: snap.floatTitle,
                floatValue: snap.floatValue,
                floatChance: snap.floatChance,
                floatScreens: floatScreensRef.current,
            };
            if (
                prev.turnBanner === next.turnBanner &&
                prev.opponentPlaying === next.opponentPlaying &&
                prev.floats === next.floats &&
                prev.deathBanners === next.deathBanners &&
                prev.beat === next.beat &&
                prev.floatKind === next.floatKind &&
                prev.floatTitle === next.floatTitle &&
                prev.floatValue === next.floatValue &&
                prev.floatChance === next.floatChance &&
                prev.floatScreens === next.floatScreens
            ) {
                return prev;
            }
            return next;
        });
    }, []);
    useEffect(() => {
        let frame = 0;
        const tick = (now: number) => {
            const queue = queueRef.current;
            if (queue) applyHud(queue.advance(now));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [applyHud]);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const motion = params.get("motion");
        const forced = motion === "reduce" || params.has("reduced");
        queueRef.current?.setTimeScale(motion === "slow" ? 12 : 1);
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => {
            const on = forced || media.matches;
            setReducedMotionOn(on);
            queueRef.current?.setReducedMotion(on);
        };
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, []);
    useEffect(() => {
        queueRef.current?.setPlayerName(
            (id) => state.players.find((player) => player.id === id)?.name ?? "Opponent",
        );
    }, [state.players]);
    useEffect(() => {
        queueRef.current?.rememberUnits(state.units);
    }, [state.units]);
    useEffect(() => {
        const queue = queueRef.current;
        if (!queue) return;
        if (game.id !== gameIdRef.current) {
            gameIdRef.current = game.id;
            seenVersion.current = game.version;
            prevUnits.current = game.state.units;
            setAwaitingOpponent(false);
            return;
        }
        const previous = seenVersion.current;
        if (game.version <= previous) {
            prevUnits.current = game.state.units;
            return;
        }
        const from = prevUnits.current;
        seenVersion.current = game.version;
        prevUnits.current = game.state.units;
        const swap = detectConfirmedSwap(from, game.state.units);
        queue.lock();
        if (swap) queue.pushSwap(swap, { units: from });
        void (async () => {
            try {
                let events = game.state.events ?? [];
                if (game.version > previous + 1) {
                    const response = await api.get(
                        `/games/${game.code}/events?since=${previous}`,
                    );
                    events = response.data.events ?? [];
                }
                if (events.length) {
                    queue.pushEvents(events, swap ? {} : { units: from });
                    applyHud(queue.view());
                } else if (!swap && !queue.view().busy) {
                    queue.unlock();
                    applyHud(queue.view());
                }
            } catch {
                queue.unlock();
                applyHud(queue.view());
            } finally {
                setAwaitingOpponent(false);
            }
        })();
    }, [game, applyHud]);
    async function action(type: string, payload: Record<string, unknown> = {}) {
        if (busyRef.current || syncing || animLockedRef.current || awaitingOpponent) return;
        if (type === "end_turn") setAwaitingOpponent(true);
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
                setMode("attack");
            }
        } catch (e) {
            setError(errorMessage(e));
            if (type === "end_turn") setAwaitingOpponent(false);
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
        !animLocked &&
        !awaitingOpponent &&
        (!state.active_unit_id || state.active_unit_id === selected.id) &&
        (selected.recovery === 0 || state.active_unit_id === selected.id) &&
        !selected.statuses.stun &&
        state.phase === "battle",
    );
    const unitOptions = selected
        ? game.options?.units[selected.id]
        : undefined;
    const cues = cueVisibility(game.options?.cues);
    const highlights = useMemo(() => {
        if (!selected || animLocked) return [];
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
        if (!canControl || !unitOptions) return [];
        const tiles: { x: number; y: number; kind: string }[] = [];
        if (!state.moved && !selected.statuses.root) {
            for (const move of unitOptions.moves) {
                tiles.push({ x: move.x, y: move.y, kind: "move" });
            }
        }
        if (!state.acted) {
            const skillOn = mode === "skill" && cues.skill_strip && unitOptions.skill.usable;
            if (skillOn) {
                for (const target of unitOptions.skill.targets) {
                    const unit = state.units.find((u) => u.id === target.target_id);
                    if (unit)
                        tiles.push({ x: unit.x, y: unit.y, kind: "skill" });
                }
            } else {
                for (const attack of unitOptions.attack) {
                    const unit = state.units.find((u) => u.id === attack.target_id);
                    if (unit)
                        tiles.push({ x: unit.x, y: unit.y, kind: "attack" });
                }
            }
        }
        return tiles;
    }, [
        selected,
        state.phase,
        state.ready,
        state.host_id,
        state.units,
        state.moved,
        state.acted,
        viewer.id,
        canControl,
        mode,
        unitOptions,
        cues.skill_strip,
        animLocked,
    ]);
    const hoveredMove: LegalMove | undefined = hover
        ? unitOptions?.moves.find((move) => move.x === hover.x && move.y === hover.y)
        : undefined;
    const hoveredUnit = hover
        ? state.units.find((unit) => unit.hp > 0 && unit.x === hover.x && unit.y === hover.y)
        : undefined;
    const hoveredAttack: LegalAttack | undefined =
        hoveredUnit && unitOptions
            ? unitOptions.attack.find((attack) => attack.target_id === hoveredUnit.id)
            : undefined;
    const hoveredSkill: LegalSkillTarget | undefined =
        hoveredUnit && unitOptions
            ? unitOptions.skill.targets.find((target) => target.target_id === hoveredUnit.id)
            : undefined;
    const homeSide = viewer.id === state.host_id ? "south" : "north";
    const fadedIds = fadedUnitIds({
        hover,
        units: state.units,
        camera: cameraForHome(homeSide),
    });
    const skillOn = mode === "skill" && cues.skill_strip && Boolean(unitOptions?.skill.usable);
    const aimPreview =
        canControl && hoveredUnit && !state.acted
            ? skillOn && hoveredSkill
                ? aimChip({
                      preview: {
                          kind: "skill",
                          land_chance: hoveredSkill.land_chance,
                          damage_on_hit: hoveredSkill.damage_on_hit,
                          lethal: hoveredSkill.lethal,
                          always_hits: hoveredSkill.always_hits,
                          effect: hoveredSkill.effect,
                          amount: hoveredSkill.amount,
                      },
                      showBreakdown: cues.breakdown,
                  })
                : hoveredAttack
                  ? aimChip({
                        preview: { kind: "attack", ...hoveredAttack },
                        showBreakdown: cues.breakdown,
                    })
                  : null
            : null;
    const swapHover =
        state.phase === "deployment" &&
        selected &&
        hoveredUnit &&
        hoveredUnit.id !== selected.id &&
        hoveredUnit.owner_id === viewer.id
            ? { a: { x: selected.x, y: selected.y }, b: { x: hoveredUnit.x, y: hoveredUnit.y } }
            : null;
    const path = hoveredMove?.path;
    const ghost =
        hoveredMove && selected
            ? {
                  x: hoveredMove.x,
                  y: hoveredMove.y,
                  facing: facingFromPath(hoveredMove.path),
              }
            : state.phase === "deployment" &&
                selected &&
                hover &&
                highlights.some((tile) => tile.x === hover.x && tile.y === hover.y) &&
                !hoveredUnit
              ? { x: hover.x, y: hover.y, facing: selected.facing }
              : null;
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
                return;
            if (event.key === "a" || event.key === "A") setMode("attack");
            if ((event.key === "s" || event.key === "S") && cues.skill_strip)
                setMode("skill");
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [cues.skill_strip]);
    useEffect(() => {
        if (!cues.skill_strip && mode === "skill") setMode("attack");
    }, [cues.skill_strip, mode]);
    function select(id: string | null) {
        if (busy || animLocked || awaitingOpponent) return;
        setSelectedId(id);
        setMode("attack");
    }
    function tile(x: number, y: number) {
        if (
            !selected ||
            !highlights.some((t) => t.x === x && t.y === y) ||
            busy ||
            animLocked ||
            awaitingOpponent
        )
            return;
        const kind = highlights.find((t) => t.x === x && t.y === y)?.kind;
        if (state.phase === "deployment")
            void action("deploy", { unit_id: selected.id, x, y });
        else if (kind === "attack" || kind === "skill") {
            const target = state.units.find(
                (u) => u.hp > 0 && u.x === x && u.y === y,
            );
            if (target)
                void action(kind === "skill" ? "skill" : "attack", {
                    unit_id: selected.id,
                    target_id: target.id,
                });
        } else {
            void action("move", { unit_id: selected.id, x, y });
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
    const opponentTurnText = `${opponent?.name ?? "Opponent"}'s turn`;
    const liveTurnBanner =
        animHud.turnBanner ||
        (animHud.opponentPlaying || awaitingOpponent ? opponentTurnText : "");
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
                        {state.scenario === "first_match"
                            ? "Your first match. One idea per turn. No ratings, crowns, or card rewards."
                            : "Practice freely. Choose any six champions; the computer follows the same rules. No ratings, crowns, or card rewards."}
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
                                  : liveTurnBanner
                                    ? liveTurnBanner
                                    : myTurn
                                      ? "Your turn"
                                      : opponentTurnText}
                            <small>
                                {state.phase === "battle"
                                    ? `Turn ${state.turn_number} · Activate one champion`
                                    : state.phase === "deployment"
                                      ? "Place champions in your two home rows"
                                      : "The Sunken Court"}
                            </small>
                            {animHud.floatScreens[0] && (
                                <strong
                                    className={`last-result-chip ${animHud.floatKind}`}
                                    data-last-result={`${animHud.floatKind}:${animHud.floatTitle}:${animHud.floatValue}:${animHud.floatChance}`}
                                >
                                    {animHud.floatValue && (
                                        <b>{animHud.floatValue}</b>
                                    )}
                                    {animHud.floatTitle}
                                    {animHud.floatChance && (
                                        <em>{animHud.floatChance}%</em>
                                    )}
                                </strong>
                            )}
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
                        <div
                            className="battle-canvas"
                            data-phase={state.phase}
                            data-turn={state.turn_number}
                            data-selected={selectedId ?? ""}
                            data-hover={
                                hover ? `${hover.x},${hover.y}` : ""
                            }
                            data-swap={swapHover ? "1" : ""}
                            data-aim={aimPreview?.damage.text ?? ""}
                            data-breakdown={
                                aimPreview?.breakdown
                                    ? `${aimPreview.breakdown.hit}/${aimPreview.breakdown.block}/${aimPreview.breakdown.side}`
                                    : ""
                            }
                            data-faded={fadedIds.join(",")}
                            data-moved={state.moved ? "1" : "0"}
                            data-acted={state.acted ? "1" : "0"}
                            data-anim-busy={animLocked ? "1" : "0"}
                            data-turn-banner={liveTurnBanner}
                            data-opponent-playing={
                                animHud.opponentPlaying || awaitingOpponent
                                    ? "1"
                                    : "0"
                            }
                            data-awaiting-opponent={awaitingOpponent ? "1" : "0"}
                            data-anim-beat={animHud.beat}
                            data-floats={animHud.floats}
                            data-board-floats={String(
                                animHud.floatTitle ? 1 : 0,
                            )}
                            data-death-banners={animHud.deathBanners}
                            data-reduced-motion={reducedMotionOn ? "1" : "0"}
                        >
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
                                    options={game.options}
                                    statusFacts={props.status_catalog}
                                    homeSide={homeSide}
                                    selectedId={selectedId}
                                    onSelect={select}
                                    onTile={tile}
                                    onHover={setHover}
                                    highlights={highlights}
                                    hover={hover}
                                    path={path}
                                    ghost={ghost}
                                    fadedIds={fadedIds}
                                    swapHover={swapHover}
                                    aim={
                                        aimPreview && selected && hoveredUnit
                                            ? {
                                                  from: {
                                                      x: selected.x,
                                                      y: selected.y,
                                                  },
                                                  to: {
                                                      x: hoveredUnit.x,
                                                      y: hoveredUnit.y,
                                                  },
                                                  chip: aimPreview,
                                                  skillTint: skillOn
                                                      ? hoveredSkill?.effect ===
                                                        "heal"
                                                          ? "green"
                                                          : "violet"
                                                      : null,
                                                  showFacingRing:
                                                      cues.breakdown &&
                                                      !skillOn &&
                                                      Boolean(hoveredAttack),
                                                  facing: hoveredUnit.facing,
                                                  blockSide:
                                                      hoveredAttack?.block_side,
                                                  lethal: Boolean(
                                                      hoveredAttack?.lethal ||
                                                          hoveredSkill?.lethal,
                                                  ),
                                              }
                                            : null
                                    }
                                    actionStrip={
                                        canControl &&
                                        cues.skill_strip &&
                                        selected &&
                                        character
                                            ? {
                                                  mode,
                                                  skillName:
                                                      character.skill.name,
                                                  skillKind:
                                                      character.skill.target !==
                                                      "enemy"
                                                          ? "heal"
                                                          : "skill",
                                                  onMode: setMode,
                                              }
                                            : null
                                    }
                                    facingControls={
                                        canControl && selected
                                            ? {
                                                  facing: selected.facing,
                                                  onFace: (facing) =>
                                                      void action("face", {
                                                          unit_id: selected.id,
                                                          facing,
                                                      }),
                                              }
                                            : null
                                    }
                                    deployment={state.phase === "deployment"}
                                    interactive={
                                        !busy && !animLocked && !awaitingOpponent
                                    }
                                    animation={queueRef.current}
                                    onHud={(hud) => {
                                        floatScreensRef.current = hud.floatScreens;
                                        if (hud.inputLocked !== animLockedRef.current) {
                                            animLockedRef.current = hud.inputLocked;
                                            setAnimLocked(hud.inputLocked);
                                        }
                                        setAnimHud((prev) => ({
                                            ...prev,
                                            turnBanner: hud.turnBanner,
                                            opponentPlaying: hud.opponentPlaying,
                                            floats: hud.floats,
                                            deathBanners: hud.deathBanners,
                                            beat: hud.beat,
                                            floatKind: hud.floatKind,
                                            floatTitle: hud.floatTitle,
                                            floatValue: hud.floatValue,
                                            floatChance: hud.floatChance,
                                            floatScreens: hud.floatScreens,
                                        }));
                                    }}
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
                            {game.lesson &&
                                dismissedLesson !==
                                    `${game.lesson.step}:${game.lesson.variant ?? ""}` && (
                                    <aside
                                        className="lesson-card unit-panel"
                                        data-lesson-step={game.lesson.step}
                                        data-lesson-variant={
                                            game.lesson.variant ?? ""
                                        }
                                    >
                                        <Eyebrow>
                                            Lesson {game.lesson.step}
                                        </Eyebrow>
                                        <h3>{game.lesson.title}</h3>
                                        <p>{game.lesson.body}</p>
                                        <button
                                            type="button"
                                            className="text-link"
                                            onClick={() =>
                                                setDismissedLesson(
                                                    `${game.lesson!.step}:${game.lesson!.variant ?? ""}`,
                                                )
                                            }
                                        >
                                            Dismiss
                                        </button>
                                    </aside>
                                )}
                            {liveTurnBanner && (
                                <div
                                    className="turn-banner-overlay"
                                    data-turn-banner-overlay={liveTurnBanner}
                                >
                                    {liveTurnBanner}
                                </div>
                            )}
                            {animHud.deathBanners && (
                                <div
                                    className="death-banner-overlay"
                                    data-death-banner-overlay={animHud.deathBanners}
                                >
                                    <i />
                                    <span>Fallen banner remains</span>
                                </div>
                            )}
                        </div>
                        <aside className="unit-panel">
                            {selected && character ? (
                                <>
                                    <div className="unit-portrait selected">
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
                                            <p className="skill-description">
                                                {character.skill.name}
                                                {": "}
                                                {character.skill.description}
                                            </p>
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
                                        onClick={() => select(u.id)}
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
                                    disabled={
                                        !myTurn ||
                                        busy ||
                                        animLocked ||
                                        awaitingOpponent
                                    }
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
