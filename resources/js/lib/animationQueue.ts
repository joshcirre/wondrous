import type { AttackEvent, GameEvent, SkillEvent, Tile } from "../types";

export const TIMING = {
    hopMs: 160,
    meleeLungeMs: 180,
    hitFlashMs: 90,
    meleeStepBackMs: 120,
    projectileMs: 250,
    blockMs: 200,
    missSidestepMs: 120,
    floatMs: 900,
    floatFadeMs: 300,
    floatRisePx: 24,
    deathMs: 450,
    opponentGapMs: 350,
    swapMs: 160,
    faceMs: 120,
    turnBannerMs: 700,
    statusMs: 200,
    watchdogMs: 15000,
} as const;

export type SkillVfx = {
    kind: "streak" | "ring" | "rise" | "glow";
    color: string;
};

export function skillVfx(skill: string): SkillVfx {
    if (skill === "Piercing Shot") return { kind: "streak", color: "#edce91" };
    if (skill === "Shield Bash") return { kind: "ring", color: "#9aa4a8" };
    if (skill === "Mending Light") return { kind: "rise", color: "#8fd19e" };
    return { kind: "glow", color: "#b79cf2" };
}

export function turnBannerText(args: {
    playerId: number;
    viewerId: number;
    name: string;
}): string {
    if (args.playerId === args.viewerId) return "Your turn";
    const name = args.name.trim() || "Opponent";
    return `${name}'s turn`;
}

export type SwapUnit = { id: string; from: Tile; to: Tile };
export type ConfirmedSwap = { a: SwapUnit; b: SwapUnit };
export type BoardUnit = {
    id: string;
    owner_id: number;
    x: number;
    y: number;
    hp?: number;
    max_hp?: number;
};

export function detectConfirmedSwap(
    before: BoardUnit[],
    after: BoardUnit[],
): ConfirmedSwap | null {
    const previous = new Map(before.map((unit) => [unit.id, unit]));
    const moved = after.filter((unit) => {
        const prior = previous.get(unit.id);
        return prior && (prior.x !== unit.x || prior.y !== unit.y);
    });
    if (moved.length !== 2) return null;
    const [a, b] = moved;
    const aBefore = previous.get(a.id)!;
    const bBefore = previous.get(b.id)!;
    if (
        a.x === bBefore.x &&
        a.y === bBefore.y &&
        b.x === aBefore.x &&
        b.y === aBefore.y
    ) {
        return {
            a: { id: a.id, from: [aBefore.x, aBefore.y], to: [a.x, a.y] },
            b: { id: b.id, from: [bBefore.x, bBefore.y], to: [b.x, b.y] },
        };
    }
    return null;
}

export type UnitPose = {
    x: number;
    y: number;
    lift: number;
    tip: number;
    sink: number;
    sidestep: number;
    lungeX: number;
    lungeZ: number;
    flash: number;
    defeated: boolean;
    hideMiniature: boolean;
};

export type FloatingResult = {
    id: string;
    unitId: string;
    x: number;
    y: number;
    kind: "hit" | "block" | "miss" | "heal";
    title: string;
    value?: number;
    chance?: number;
    rise: number;
    opacity: number;
};

export type DeathBanner = {
    unitId: string;
    ownerId: number;
    x: number;
    y: number;
};

export type MotionEffect = {
    id: string;
    kind: SkillVfx["kind"] | "projectile" | "shield";
    color: string;
    from: Tile;
    to: Tile;
    progress: number;
};

export type QueueView = {
    busy: boolean;
    inputLocked: boolean;
    currentType: string | null;
    turnBanner: { text: string; playerId: number } | null;
    opponentPlaying: boolean;
    deathBanners: DeathBanner[];
    floats: FloatingResult[];
    poses: Record<string, UnitPose>;
    effects: MotionEffect[];
};

type FloatSpec = Omit<FloatingResult, "rise" | "opacity"> & {
    born: number;
};

type EffectSpec = Omit<MotionEffect, "progress"> & {
    born: number;
    life: number;
};

type Beat = {
    type: string;
    duration: number;
    run: (elapsed: number, reduced: boolean) => void;
    start: () => void;
    end: () => void;
};

export type QueueOptions = {
    viewerId: number;
    playerName: (id: number) => string;
    now?: () => number;
    reducedMotion?: boolean;
    watchdogMs?: number;
    timeScale?: number;
};

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function poseAt(x: number, y: number): UnitPose {
    return {
        x,
        y,
        lift: 0,
        tip: 0,
        sink: 0,
        sidestep: 0,
        lungeX: 0,
        lungeZ: 0,
        flash: 0,
        defeated: false,
        hideMiniature: false,
    };
}

function attackFloat(event: AttackEvent): Omit<FloatingResult, "id" | "unitId" | "x" | "y" | "rise" | "opacity"> {
    if (event.outcome === "block") {
        return {
            kind: "block",
            title: "Blocked",
            chance: event.roll.block_chance,
        };
    }
    if (event.outcome === "miss") {
        return {
            kind: "miss",
            title: "Miss",
            chance: Math.max(0, 100 - event.roll.accuracy),
        };
    }
    return { kind: "hit", title: "HIT", value: event.damage };
}

function healSkill(name: string): boolean {
    return /mend|heal|light|bloom|mercy|ward/i.test(name);
}

export function createAnimationQueue(options: QueueOptions) {
    const now = options.now ?? (() => performance.now());
    let timeScale = options.timeScale ?? 1;
    const watchdogMs = options.watchdogMs ?? TIMING.watchdogMs;
    let viewerId = options.viewerId;
    let playerName = options.playerName;
    let reducedMotion = options.reducedMotion ?? false;
    function ms(value: number): number {
        return value * timeScale;
    }
    let beats: Beat[] = [];
    let beatIndex = 0;
    let beatStartedAt = 0;
    let lockStartedAt: number | null = null;
    let inputLocked = false;
    let poses: Record<string, UnitPose> = {};
    let owners: Record<string, number> = {};
    let knownTiles: Record<string, Tile> = {};
    let deathBanners: DeathBanner[] = [];
    let turnBanner: QueueView["turnBanner"] = null;
    let opponentPlaying = false;
    let floats: FloatSpec[] = [];
    let effects: EffectSpec[] = [];
    let currentType: string | null = null;
    let floatSeq = 0;
    let lockListeners = new Set<(locked: boolean) => void>();

    function notifyLock(next: boolean) {
        if (inputLocked === next) return;
        inputLocked = next;
        for (const listener of lockListeners) listener(next);
    }

    function lock() {
        if (lockStartedAt === null) lockStartedAt = now();
        notifyLock(true);
    }

    function unlock() {
        lockStartedAt = null;
        currentType = null;
        turnBanner = null;
        opponentPlaying = false;
        floats = [];
        effects = [];
        notifyLock(false);
    }

    function holdOpponentBanner(playerId: number) {
        opponentPlaying = true;
        turnBanner = {
            text: turnBannerText({
                playerId,
                viewerId,
                name: playerName(playerId),
            }),
            playerId,
        };
    }

    function rememberUnits(units?: BoardUnit[]) {
        if (!units) return;
        for (const unit of units) {
            knownTiles[unit.id] = [unit.x, unit.y];
            owners[unit.id] = unit.owner_id;
        }
    }

    function tileOf(id: string): { x: number; y: number } {
        const pose = poses[id];
        if (pose && owners[id] !== undefined) return { x: pose.x, y: pose.y };
        const known = knownTiles[id];
        if (known) return { x: known[0], y: known[1] };
        return { x: pose?.x ?? 0, y: pose?.y ?? 0 };
    }

    function ensurePose(id: string, unit?: BoardUnit): UnitPose {
        if (!poses[id] && unit) {
            poses[id] = poseAt(unit.x, unit.y);
            owners[id] = unit.owner_id;
        }
        if (!poses[id] && knownTiles[id]) {
            poses[id] = poseAt(knownTiles[id][0], knownTiles[id][1]);
        }
        if (!poses[id]) poses[id] = poseAt(0, 0);
        return poses[id];
    }

    function ingestUnits(units?: BoardUnit[]) {
        if (!units) return;
        rememberUnits(units);
        for (const unit of units) {
            const prior = poses[unit.id];
            poses[unit.id] = prior
                ? { ...prior, x: unit.x, y: unit.y }
                : poseAt(unit.x, unit.y);
            owners[unit.id] = unit.owner_id;
        }
    }

    function spawnFloat(
        spec: Omit<FloatingResult, "id" | "rise" | "opacity">,
        at: number,
    ) {
        floats.push({
            ...spec,
            id: `float-${++floatSeq}`,
            born: at,
        });
    }

    function spawnEffect(spec: Omit<MotionEffect, "id" | "progress">, at: number, life: number) {
        effects.push({
            ...spec,
            id: `fx-${++floatSeq}`,
            born: at,
            life,
        });
    }

    function liveFloats(at: number): FloatingResult[] {
        const visible: FloatingResult[] = [];
        for (const item of floats) {
            const age = Math.max(0, at - item.born);
            if (age >= ms(TIMING.floatMs)) continue;
            const fadeStart = ms(TIMING.floatMs) - ms(TIMING.floatFadeMs);
            visible.push({
                id: item.id,
                unitId: item.unitId,
                x: item.x,
                y: item.y,
                kind: item.kind,
                title: item.title,
                value: item.value,
                chance: item.chance,
                rise: reducedMotion
                    ? 0
                    : TIMING.floatRisePx * clamp01(age / ms(TIMING.floatMs)),
                opacity:
                    age <= fadeStart
                        ? 1
                        : 1 - (age - fadeStart) / ms(TIMING.floatFadeMs),
            });
        }
        return visible;
    }

    function liveEffects(at: number): MotionEffect[] {
        return effects
            .map((item) => {
                const age = Math.max(0, at - item.born);
                if (age > item.life) return null;
                return {
                    id: item.id,
                    kind: item.kind,
                    color: item.color,
                    from: item.from,
                    to: item.to,
                    progress: reducedMotion ? 1 : clamp01(age / item.life),
                };
            })
            .filter((item): item is MotionEffect => item !== null);
    }

    function snapRemaining() {
        for (let i = beatIndex; i < beats.length; i++) beats[i].end();
        beats = [];
        beatIndex = 0;
        currentType = null;
        effects = [];
        for (const pose of Object.values(poses)) {
            pose.lift = 0;
            pose.sidestep = 0;
            pose.lungeX = 0;
            pose.lungeZ = 0;
            pose.flash = 0;
            if (pose.defeated) {
                pose.hideMiniature = true;
                pose.tip = 1;
                pose.sink = 1;
            }
        }
    }

    function finish(at: number, snap: boolean) {
        if (snap) snapRemaining();
        floats = floats.filter((item) => at - item.born <= ms(TIMING.floatMs));
        if (beats.length === 0 && liveFloats(at).length === 0) {
            unlock();
        }
    }

    function startBeat(index: number, at: number) {
        beatIndex = index;
        if (index >= beats.length) {
            currentType = null;
            if (liveFloats(at).length === 0) unlock();
            else {
                currentType = "float";
                if (!opponentPlaying) turnBanner = null;
            }
            return;
        }
        const beat = beats[index];
        beatStartedAt = at;
        currentType = beat.type;
        beat.start();
        if (reducedMotion) {
            beat.run(beat.duration, true);
            beat.end();
            startBeat(index + 1, at);
        }
    }

    function queueBeats(next: Beat[]) {
        const wasIdle = beats.length === 0 || beatIndex >= beats.length;
        beats = wasIdle ? next : beats.concat(next);
        if (wasIdle && next.length) {
            lock();
            startBeat(0, now());
        }
    }

    function moveDuration(event: Extract<GameEvent, { type: "move" }>): number {
        const hops = Math.max(1, event.path.length - 1);
        return hops * ms(TIMING.hopMs);
    }

    function attackMotion(event: AttackEvent): {
        melee: boolean;
        duration: number;
        impactAt: number;
    } {
        const attacker = poses[event.unit_id] ?? poseAt(0, 0);
        const target = poses[event.target_id] ?? poseAt(0, 0);
        const melee = manhattan(attacker, target) <= 1;
        if (melee) {
            const afterLunge =
                event.outcome === "hit"
                    ? ms(TIMING.hitFlashMs) + ms(TIMING.meleeStepBackMs)
                    : event.outcome === "block"
                      ? ms(TIMING.blockMs) + ms(TIMING.meleeStepBackMs)
                      : ms(TIMING.missSidestepMs) + ms(TIMING.meleeStepBackMs);
            return {
                melee: true,
                duration: ms(TIMING.meleeLungeMs) + afterLunge,
                impactAt: ms(TIMING.meleeLungeMs),
            };
        }
        const after =
            event.outcome === "hit"
                ? ms(TIMING.hitFlashMs)
                : event.outcome === "block"
                  ? ms(TIMING.blockMs)
                  : ms(TIMING.missSidestepMs);
        return {
            melee: false,
            duration: ms(TIMING.projectileMs) + after,
            impactAt: ms(TIMING.projectileMs),
        };
    }

    function addGapIfNeeded(opponentSequence: boolean, eventType: string) {
        if (!opponentSequence || eventType === "turn_start") return;
        beats.push({
            type: "gap",
            duration: TIMING.opponentGapMs,
            start() {
                currentType = "gap";
            },
            run() {},
            end() {},
        });
    }

    function pushEvents(events: GameEvent[], context: { units?: BoardUnit[] } = {}) {
        ingestUnits(context.units);
        let opponentSequence = false;
        const next: Beat[] = [];
        const prior = beats;
        beats = next;

        for (const event of events) {
            if (event.type === "turn_start") {
                opponentSequence = event.player_id !== viewerId;
            } else if ("owner_id" in event && event.owner_id !== viewerId) {
                opponentSequence = true;
            }

            if (event.type === "move") {
                const hops = Math.max(1, event.path.length - 1);
                const path = event.path.length > 1 ? event.path : [event.from, event.to];
                next.push({
                    type: "move",
                    duration: reducedMotion ? 0 : hops * ms(TIMING.hopMs),
                    start() {
                        if (event.owner_id !== viewerId) holdOpponentBanner(event.owner_id);
                    },
                    run(elapsed) {
                        const pose = ensurePose(event.unit_id);
                        if (reducedMotion || elapsed >= hops * ms(TIMING.hopMs)) {
                            pose.x = event.to[0];
                            pose.y = event.to[1];
                            pose.lift = 0;
                            return;
                        }
                        const hop = Math.min(hops - 1, Math.floor(elapsed / ms(TIMING.hopMs)));
                        const frac = clamp01((elapsed - hop * ms(TIMING.hopMs)) / ms(TIMING.hopMs));
                        const from = path[hop];
                        const to = path[hop + 1] ?? path[hop];
                        pose.x = lerp(from[0], to[0], frac);
                        pose.y = lerp(from[1], to[1], frac);
                        pose.lift = Math.sin(Math.PI * frac) * 0.16;
                    },
                    end() {
                        const pose = ensurePose(event.unit_id);
                        pose.x = event.to[0];
                        pose.y = event.to[1];
                        pose.lift = 0;
                    },
                });
            } else if (event.type === "attack") {
                const motion = attackMotion(event);
                const float = attackFloat(event);
                let spawned = false;
                next.push({
                    type: "attack",
                    duration: reducedMotion ? 0 : motion.duration,
                    start() {
                        if (event.owner_id !== viewerId) holdOpponentBanner(event.owner_id);
                        if (reducedMotion) {
                            const target = poses[event.target_id];
                            const tile = tileOf(event.target_id);
                            spawnFloat(
                                {
                                    ...float,
                                    unitId: event.target_id,
                                    x: tile.x,
                                    y: tile.y,
                                },
                                now(),
                            );
                            spawned = true;
                        }
                    },
                    run(elapsed) {
                        const attacker = ensurePose(event.unit_id);
                        const target = ensurePose(event.target_id);
                        const dx = target.x - attacker.x;
                        const dy = target.y - attacker.y;
                        const dist = Math.hypot(dx, dy) || 1;
                        if (!reducedMotion && !spawned && elapsed >= motion.impactAt) {
                            const tile = tileOf(event.target_id);
                            spawnFloat(
                                {
                                    ...float,
                                    unitId: event.target_id,
                                    x: tile.x,
                                    y: tile.y,
                                },
                                now(),
                            );
                            spawned = true;
                        }
                        attacker.lungeX = 0;
                        attacker.lungeZ = 0;
                        attacker.flash = 0;
                        target.flash = 0;
                        target.sidestep = 0;
                        if (reducedMotion) return;
                        if (motion.melee) {
                            if (elapsed < ms(TIMING.meleeLungeMs)) {
                                const t = elapsed / ms(TIMING.meleeLungeMs);
                                attacker.lungeX = (dx / dist) * 0.28 * t;
                                attacker.lungeZ = (dy / dist) * 0.28 * t;
                            } else if (
                                event.outcome === "hit" &&
                                elapsed < ms(TIMING.meleeLungeMs) + ms(TIMING.hitFlashMs)
                            ) {
                                attacker.lungeX = (dx / dist) * 0.28;
                                attacker.lungeZ = (dy / dist) * 0.28;
                                target.flash = 1;
                                attacker.flash = 0.4;
                            } else if (
                                event.outcome === "block" &&
                                elapsed < ms(TIMING.meleeLungeMs) + ms(TIMING.blockMs)
                            ) {
                                attacker.lungeX = (dx / dist) * 0.2;
                                attacker.lungeZ = (dy / dist) * 0.2;
                                target.flash = 0.7;
                                spawnShield(event, target);
                            } else if (
                                event.outcome === "miss" &&
                                elapsed < ms(TIMING.meleeLungeMs) + ms(TIMING.missSidestepMs)
                            ) {
                                const t =
                                    (elapsed - ms(TIMING.meleeLungeMs)) /
                                    ms(TIMING.missSidestepMs);
                                target.sidestep = Math.sin(Math.PI * t) * 0.18;
                            } else {
                                const back = clamp01(
                                    (elapsed - (motion.duration - ms(TIMING.meleeStepBackMs))) /
                                        ms(TIMING.meleeStepBackMs),
                                );
                                attacker.lungeX = (dx / dist) * 0.28 * (1 - back);
                                attacker.lungeZ = (dy / dist) * 0.28 * (1 - back);
                            }
                        } else if (elapsed < ms(TIMING.projectileMs)) {
                            spawnProjectile(event, attacker, target, elapsed);
                        } else if (event.outcome === "hit") {
                            target.flash = 1;
                        } else if (event.outcome === "block") {
                            target.flash = 0.7;
                            spawnShield(event, target);
                        } else {
                            const t =
                                (elapsed - ms(TIMING.projectileMs)) / ms(TIMING.missSidestepMs);
                            target.sidestep = Math.sin(Math.PI * clamp01(t)) * 0.18;
                        }
                    },
                    end() {
                        const attacker = ensurePose(event.unit_id);
                        const target = ensurePose(event.target_id);
                        attacker.lungeX = 0;
                        attacker.lungeZ = 0;
                        attacker.flash = 0;
                        target.flash = 0;
                        target.sidestep = 0;
                        if (!spawned) {
                            const tile = tileOf(event.target_id);
                            spawnFloat(
                                {
                                    ...float,
                                    unitId: event.target_id,
                                    x: tile.x,
                                    y: tile.y,
                                },
                                now(),
                            );
                        }
                    },
                });
            } else if (event.type === "skill") {
                next.push(skillBeat(event));
            } else if (event.type === "death") {
                next.push({
                    type: "death",
                    duration: reducedMotion ? 0 : ms(TIMING.deathMs),
                    start() {
                        if (event.owner_id !== viewerId) holdOpponentBanner(event.owner_id);
                    },
                    run(elapsed) {
                        const pose = ensurePose(event.unit_id);
                        const t = reducedMotion ? 1 : clamp01(elapsed / ms(TIMING.deathMs));
                        pose.defeated = true;
                        pose.tip = t;
                        pose.sink = t;
                        pose.hideMiniature = t >= 1;
                    },
                    end() {
                        const pose = ensurePose(event.unit_id);
                        pose.defeated = true;
                        pose.tip = 1;
                        pose.sink = 1;
                        pose.hideMiniature = true;
                        if (!deathBanners.some((banner) => banner.unitId === event.unit_id)) {
                            deathBanners = [
                                ...deathBanners,
                                {
                                    unitId: event.unit_id,
                                    ownerId: event.owner_id,
                                    x: pose.x,
                                    y: pose.y,
                                },
                            ];
                        }
                    },
                });
            } else if (event.type === "turn_start") {
                const text = turnBannerText({
                    playerId: event.player_id,
                    viewerId,
                    name: playerName(event.player_id),
                });
                next.push({
                    type: "turn_start",
                    duration: ms(TIMING.turnBannerMs),
                    start() {
                        deathBanners = [];
                        if (event.player_id === viewerId) {
                            opponentPlaying = false;
                            turnBanner = { text, playerId: event.player_id };
                        } else {
                            holdOpponentBanner(event.player_id);
                        }
                    },
                    run() {},
                    end() {
                        if (event.player_id === viewerId) {
                            turnBanner = null;
                            return;
                        }
                        const moreOpponent = next
                            .slice(next.indexOf(this) + 1)
                            .some((beat) => beat.type !== "turn_start");
                        if (!moreOpponent) {
                            turnBanner = null;
                            opponentPlaying = false;
                        }
                    },
                });
            } else if (event.type === "face") {
                next.push({
                    type: "face",
                    duration: reducedMotion ? 0 : ms(TIMING.faceMs),
                    start() {},
                    run() {},
                    end() {},
                });
            } else if (event.type === "status_tick") {
                next.push({
                    type: "status_tick",
                    duration: reducedMotion ? 0 : ms(TIMING.statusMs),
                    start() {
                        if (event.amount) {
                            const tile = tileOf(event.unit_id);
                            spawnFloat(
                                {
                                    kind: "hit",
                                    title: event.status,
                                    value: event.amount,
                                    unitId: event.unit_id,
                                    x: tile.x,
                                    y: tile.y,
                                },
                                now(),
                            );
                        }
                    },
                    run() {},
                    end() {},
                });
            } else {
                next.push({
                    type: event.type,
                    duration: 0,
                    start() {},
                    run() {},
                    end() {},
                });
            }

            if (opponentSequence && event.type !== "turn_start") {
                next.push({
                    type: "gap",
                    duration: reducedMotion ? 0 : ms(TIMING.opponentGapMs),
                    start() {
                        currentType = "gap";
                        if (opponentSequence) {
                            const owner =
                                "owner_id" in event ? event.owner_id : null;
                            if (owner !== null && owner !== viewerId) {
                                holdOpponentBanner(owner);
                            }
                        }
                    },
                    run() {},
                    end() {},
                });
            }
        }

        beats = prior;
        queueBeats(next);
        void addGapIfNeeded;
        void moveDuration;
    }

    function skillBeat(event: SkillEvent): Beat {
        const vfx = skillVfx(event.skill);
        let spawned = false;
        return {
            type: "skill",
            duration: reducedMotion ? 0 : ms(TIMING.projectileMs),
            start() {
                if (event.owner_id !== viewerId) holdOpponentBanner(event.owner_id);
                const from = poses[event.unit_id] ?? poseAt(0, 0);
                const targetId = event.target_ids[0];
                const to = (targetId && poses[targetId]) || from;
                spawnEffect(
                    {
                        kind: vfx.kind,
                        color: vfx.color,
                        from: [from.x, from.y],
                        to: [to.x, to.y],
                    },
                    now(),
                    reducedMotion ? ms(TIMING.floatMs) : ms(TIMING.projectileMs),
                );
                if (reducedMotion) spawnSkillFloats(event);
                spawned = reducedMotion;
            },
            run() {},
            end() {
                if (!spawned) spawnSkillFloats(event);
            },
        };
    }

    function spawnSkillFloats(event: SkillEvent) {
        const heal = healSkill(event.skill);
        for (const targetId of event.target_ids) {
            const amount = event.amounts[targetId];
            if (amount === undefined) continue;
            const tile = tileOf(targetId);
            spawnFloat(
                {
                    kind: heal ? "heal" : "hit",
                    title: heal ? event.skill : "HIT",
                    value: amount,
                    unitId: targetId,
                    x: tile.x,
                    y: tile.y,
                },
                now(),
            );
        }
    }

    const shieldIds = new Set<string>();
    function spawnShield(event: AttackEvent, target: UnitPose) {
        const key = `${event.target_id}-${event.unit_id}`;
        if (shieldIds.has(key)) return;
        shieldIds.add(key);
        spawnEffect(
            {
                kind: "shield",
                color: "#9aa4a8",
                from: [target.x, target.y],
                to: [target.x, target.y],
            },
            now(),
            ms(TIMING.blockMs),
        );
    }

    const projectileIds = new Set<string>();
    function spawnProjectile(
        event: AttackEvent,
        from: UnitPose,
        to: UnitPose,
        elapsed: number,
    ) {
        const key = `${event.unit_id}-${event.target_id}`;
        if (!projectileIds.has(key)) {
            projectileIds.add(key);
            spawnEffect(
                {
                    kind: "projectile",
                    color: "#e07a42",
                    from: [from.x, from.y],
                    to: [to.x, to.y],
                },
                now() - elapsed,
                ms(TIMING.projectileMs),
            );
        }
    }

    function pushSwap(swap: ConfirmedSwap, context: { units?: BoardUnit[] } = {}) {
        ingestUnits(context.units);
        queueBeats([
            {
                type: "swap",
                duration: reducedMotion ? 0 : ms(TIMING.swapMs),
                start() {},
                run(elapsed) {
                    const t = reducedMotion ? 1 : clamp01(elapsed / ms(TIMING.swapMs));
                    const eased = 1 - (1 - t) * (1 - t);
                    for (const unit of [swap.a, swap.b]) {
                        const pose = ensurePose(unit.id);
                        const sign = unit.id === swap.a.id ? 1 : -1;
                        pose.x = lerp(unit.from[0], unit.to[0], eased);
                        pose.y =
                            lerp(unit.from[1], unit.to[1], eased) +
                            Math.sin(Math.PI * t) * 0.16 * sign;
                        pose.lift = Math.sin(Math.PI * t) * 0.08;
                    }
                },
                end() {
                    for (const unit of [swap.a, swap.b]) {
                        const pose = ensurePose(unit.id);
                        pose.x = unit.to[0];
                        pose.y = unit.to[1];
                        pose.lift = 0;
                    }
                },
            },
        ]);
    }

    function advance(at = now()): QueueView {
        if (lockStartedAt !== null && at - lockStartedAt >= watchdogMs * timeScale) {
            snapRemaining();
            floats = [];
            effects = [];
            unlock();
            return viewAt(at);
        }
        if (beats.length && beatIndex < beats.length) {
            const beat = beats[beatIndex];
            const elapsed = at - beatStartedAt;
            beat.run(elapsed, reducedMotion);
            if (elapsed >= beat.duration) {
                beat.end();
                startBeat(beatIndex + 1, at);
            }
        } else if (inputLocked && liveFloats(at).length === 0) {
            unlock();
        }
        return viewAt(at);
    }

    function viewAt(at: number): QueueView {
        return {
            busy: inputLocked,
            inputLocked,
            currentType,
            turnBanner,
            opponentPlaying,
            deathBanners: deathBanners.map((banner) => ({ ...banner })),
            floats: liveFloats(at),
            poses,
            effects: liveEffects(at),
        };
    }

    function view(): QueueView {
        return viewAt(now());
    }

    return {
        pushEvents,
        pushSwap,
        rememberUnits,
        advance,
        view,
        lock,
        unlock,
        setReducedMotion(value: boolean) {
            reducedMotion = value;
        },
        setTimeScale(value: number) {
            timeScale = Math.max(0.1, value);
        },
        setPlayerName(next: (id: number) => string) {
            playerName = next;
        },
        setViewerId(id: number) {
            viewerId = id;
        },
        onLock(listener: (locked: boolean) => void) {
            lockListeners.add(listener);
            return () => lockListeners.delete(listener);
        },
        isInputLocked() {
            return inputLocked;
        },
    };
}

export type AnimationQueue = ReturnType<typeof createAnimationQueue>;
