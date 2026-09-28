import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    TIMING,
    createAnimationQueue,
    detectConfirmedSwap,
    htmlBoardFloats,
    projectedOverlayFloats,
    skillVfx,
    turnBannerText,
} from "../../resources/js/lib/animationQueue.ts";
import type { AttackEvent, DeathEvent, GameEvent, MoveEvent, SkillEvent, TurnStartEvent } from "../../resources/js/types.ts";

function clock() {
    let now = 0;
    return {
        now: () => now,
        set: (value: number) => {
            now = value;
        },
        add: (value: number) => {
            now += value;
            return now;
        },
    };
}

const units = [
    { id: "1-ranger", owner_id: 1, x: 3, y: 7, hp: 82, max_hp: 82 },
    { id: "1-knight", owner_id: 1, x: 4, y: 7, hp: 110, max_hp: 110 },
    { id: "2-warden", owner_id: 2, x: 3, y: 4, hp: 40, max_hp: 120 },
];

function moveEvent(over: Partial<MoveEvent> = {}): MoveEvent {
    return {
        type: "move",
        unit_id: "1-ranger",
        owner_id: 1,
        from: [3, 7],
        to: [3, 5],
        path: [
            [3, 7],
            [3, 6],
            [3, 5],
        ],
        ...over,
    };
}

function attackEvent(over: Partial<AttackEvent> = {}): AttackEvent {
    return {
        type: "attack",
        unit_id: "1-ranger",
        owner_id: 1,
        target_id: "2-warden",
        target_owner_id: 2,
        side: "front",
        roll: {
            accuracy: 90,
            hit_roll: 28,
            block_chance: 40,
            block_roll: 70,
        },
        outcome: "hit",
        damage: 24,
        ...over,
    };
}

function deathEvent(over: Partial<DeathEvent> = {}): DeathEvent {
    return {
        type: "death",
        unit_id: "2-warden",
        owner_id: 2,
        by: 1,
        ...over,
    };
}

function turnStart(over: Partial<TurnStartEvent> = {}): TurnStartEvent {
    return { type: "turn_start", player_id: 1, turn_number: 2, ...over };
}

function queue(options: { reducedMotion?: boolean; watchdogMs?: number; viewerId?: number } = {}) {
    const time = clock();
    const q = createAnimationQueue({
        now: time.now,
        viewerId: options.viewerId ?? 1,
        playerName: (id) => (id === 1 ? "Rowan" : id === 2 ? "Elara" : "Practice opponent"),
        reducedMotion: options.reducedMotion ?? false,
        watchdogMs: options.watchdogMs,
    });
    return { q, time };
}

describe("skillVfx", () => {
    it("gives Piercing Shot a gold streak, Shield Bash a steel ring, Mending Light a green rise, and a default for the rest", () => {
        assert.deepEqual(skillVfx("Piercing Shot"), {
            kind: "streak",
            color: "#edce91",
        });
        assert.deepEqual(skillVfx("Shield Bash"), {
            kind: "ring",
            color: "#9aa4a8",
        });
        assert.deepEqual(skillVfx("Mending Light"), {
            kind: "rise",
            color: "#8fd19e",
        });
        assert.equal(skillVfx("Wildfire").kind, "glow");
    });
});

describe("turnBannerText", () => {
    it("uses Your turn for the viewer and the opponent name otherwise", () => {
        assert.equal(turnBannerText({ playerId: 1, viewerId: 1, name: "Rowan" }), "Your turn");
        assert.equal(
            turnBannerText({ playerId: 2, viewerId: 1, name: "Elara" }),
            "Elara's turn",
        );
    });
});

describe("detectConfirmedSwap", () => {
    it("returns a swap only when two confirmed units have exchanged tiles", () => {
        const before = [
            { id: "a", owner_id: 1, x: 1, y: 7 },
            { id: "b", owner_id: 1, x: 4, y: 7 },
        ];
        const after = [
            { id: "a", owner_id: 1, x: 4, y: 7 },
            { id: "b", owner_id: 1, x: 1, y: 7 },
        ];
        assert.deepEqual(detectConfirmedSwap(before, after), {
            a: { id: "a", from: [1, 7], to: [4, 7] },
            b: { id: "b", from: [4, 7], to: [1, 7] },
        });
        assert.equal(
            detectConfirmedSwap(before, [
                { id: "a", owner_id: 1, x: 1, y: 6 },
                { id: "b", owner_id: 1, x: 4, y: 7 },
            ]),
            null,
        );
    });
});

describe("createAnimationQueue", () => {
    it("plays events in order and hops tile to tile along the server path", () => {
        const { q, time } = queue();
        q.pushEvents([moveEvent(), attackEvent()], { units });
        const start = q.view();
        assert.equal(start.inputLocked, true);
        assert.equal(start.poses["1-ranger"].x, 3);
        assert.equal(start.poses["1-ranger"].y, 7);

        q.advance(time.add(TIMING.hopMs / 2));
        const midHop = q.view().poses["1-ranger"];
        assert.equal(midHop.x, 3);
        assert.ok(midHop.y > 6 && midHop.y < 7);
        assert.ok(midHop.lift > 0);

        q.advance(time.add(TIMING.hopMs / 2));
        assert.deepEqual(
            [q.view().poses["1-ranger"].x, q.view().poses["1-ranger"].y],
            [3, 6],
        );

        q.advance(time.add(TIMING.hopMs));
        assert.deepEqual(
            [q.view().poses["1-ranger"].x, q.view().poses["1-ranger"].y],
            [3, 5],
        );
        assert.equal(q.view().currentType, "attack");
    });

    it("spaces opponent beats about 350 ms apart", () => {
        const { q, time } = queue();
        const events: GameEvent[] = [
            turnStart({ player_id: 2, turn_number: 2 }),
            moveEvent({ owner_id: 2, unit_id: "2-warden", from: [3, 4], to: [3, 5], path: [[3, 4], [3, 5]] }),
            attackEvent({ owner_id: 2, unit_id: "2-warden", target_id: "1-ranger", target_owner_id: 1 }),
        ];
        q.pushEvents(events, { units });
        q.advance(time.now());
        assert.equal(q.view().currentType, "turn_start");
        q.advance(time.add(TIMING.turnBannerMs));
        assert.equal(q.view().currentType, "move");
        q.advance(time.add(TIMING.hopMs));
        assert.equal(q.view().currentType, "gap");
        q.advance(time.add(TIMING.opponentGapMs - 1));
        assert.equal(q.view().currentType, "gap");
        q.advance(time.add(1));
        assert.equal(q.view().currentType, "attack");
    });

    it("locks input while playing and releases it when the queue finishes", () => {
        const { q, time } = queue();
        q.pushEvents([turnStart()], { units });
        assert.equal(q.view().inputLocked, true);
        q.advance(time.add(TIMING.turnBannerMs));
        assert.equal(q.view().inputLocked, false);
        assert.equal(q.view().busy, false);
    });

    it("releases a stuck lock through the watchdog", () => {
        const { q, time } = queue({ watchdogMs: 40 });
        q.pushEvents([moveEvent()], { units });
        assert.equal(q.view().inputLocked, true);
        q.advance(time.add(40));
        assert.equal(q.view().inputLocked, false);
        assert.equal(q.view().busy, false);
        assert.deepEqual(
            [q.view().poses["1-ranger"].x, q.view().poses["1-ranger"].y],
            [3, 5],
        );
    });

    it("shows a turn banner for the viewer and the opponent", () => {
        const { q, time } = queue();
        q.pushEvents([turnStart({ player_id: 2 })], { units });
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        q.advance(time.add(TIMING.turnBannerMs));
        assert.equal(q.view().turnBanner, null);

        q.pushEvents([turnStart({ player_id: 1, turn_number: 3 })], { units });
        assert.equal(q.view().turnBanner?.text, "Your turn");
    });

    it("keeps the opponent banner and input lock until the viewer's turn_start beat", () => {
        const { q, time } = queue();
        const events: GameEvent[] = [
            turnStart({ player_id: 2, turn_number: 2 }),
            moveEvent({
                owner_id: 2,
                unit_id: "2-warden",
                from: [3, 4],
                to: [3, 5],
                path: [
                    [3, 4],
                    [3, 5],
                ],
            }),
            attackEvent({
                owner_id: 2,
                unit_id: "2-warden",
                target_id: "1-ranger",
                target_owner_id: 1,
            }),
            turnStart({ player_id: 1, turn_number: 3 }),
        ];
        q.pushEvents(events, { units });
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        assert.equal(q.view().opponentPlaying, true);
        assert.equal(q.view().inputLocked, true);

        q.advance(time.add(TIMING.turnBannerMs));
        assert.equal(q.view().currentType, "move");
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        assert.equal(q.view().inputLocked, true);

        q.advance(time.add(TIMING.hopMs));
        assert.equal(q.view().currentType, "gap");
        q.advance(time.add(TIMING.opponentGapMs));
        assert.equal(q.view().currentType, "attack");
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        assert.equal(q.view().inputLocked, true);
        assert.equal(q.isInputLocked(), true);

        q.advance(time.add(TIMING.projectileMs + TIMING.hitFlashMs));
        assert.equal(q.view().currentType, "gap");
        q.advance(time.add(TIMING.opponentGapMs));
        assert.equal(q.view().currentType, "turn_start");
        assert.equal(q.view().turnBanner?.text, "Your turn");
        assert.equal(q.view().opponentPlaying, false);
        assert.equal(q.view().inputLocked, true);

        q.advance(time.add(TIMING.floatMs));
        q.advance(time.add(TIMING.turnBannerMs));
        assert.equal(q.view().inputLocked, false);
        assert.equal(q.view().turnBanner, null);
    });

    it("keeps input locked while the opponent sequence plays so clicks cannot apply", () => {
        const { q, time } = queue();
        q.pushEvents(
            [
                turnStart({ player_id: 2, turn_number: 2 }),
                moveEvent({
                    owner_id: 2,
                    unit_id: "2-warden",
                    from: [3, 4],
                    to: [3, 5],
                    path: [
                        [3, 4],
                        [3, 5],
                    ],
                }),
                attackEvent({
                    owner_id: 2,
                    unit_id: "2-warden",
                    target_id: "1-ranger",
                    target_owner_id: 1,
                    outcome: "miss",
                    damage: 0,
                    roll: { accuracy: 90, hit_roll: 96, block_chance: 12, block_roll: null },
                }),
            ],
            { units },
        );
        const clicks: boolean[] = [];
        const click = () => clicks.push(q.isInputLocked());
        click();
        q.advance(time.add(TIMING.turnBannerMs));
        click();
        q.advance(time.add(TIMING.hopMs));
        click();
        q.advance(time.add(TIMING.opponentGapMs));
        click();
        q.advance(time.add(TIMING.projectileMs + TIMING.missSidestepMs));
        click();
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        assert.ok(clicks.every((locked) => locked === true));
        assert.equal(q.view().inputLocked, true);
        q.advance(time.add(TIMING.opponentGapMs + TIMING.floatMs));
        assert.equal(q.isInputLocked(), false);
        click();
        assert.equal(clicks.at(-1), false);
    });

    it("infers an opponent banner from opponent events when turn_start is missing", () => {
        const { q, time } = queue();
        q.pushEvents(
            [
                moveEvent({
                    owner_id: 2,
                    unit_id: "2-warden",
                    from: [3, 4],
                    to: [3, 5],
                    path: [
                        [3, 4],
                        [3, 5],
                    ],
                }),
            ],
            { units },
        );
        assert.equal(q.view().turnBanner?.text, "Elara's turn");
        assert.equal(q.view().opponentPlaying, true);
        assert.equal(q.view().inputLocked, true);
        q.advance(time.add(TIMING.hopMs));
        q.advance(time.add(TIMING.opponentGapMs));
        assert.equal(q.view().inputLocked, false);
    });

    it("keeps a death banner on the fallen tile until the next turn_start", () => {
        const { q, time } = queue();
        q.pushEvents([deathEvent(), turnStart({ player_id: 2, turn_number: 4 })], { units });
        q.advance(time.add(TIMING.deathMs / 2));
        const dying = q.view().poses["2-warden"];
        assert.ok(dying.tip > 0);
        assert.ok(dying.sink > 0);
        q.advance(time.add(TIMING.deathMs / 2));
        assert.equal(q.view().poses["2-warden"].hideMiniature, true);
        assert.deepEqual(q.view().deathBanners, [
            { unitId: "2-warden", ownerId: 2, x: 3, y: 4 },
        ]);
        q.advance(time.add(TIMING.opponentGapMs));
        assert.equal(q.view().currentType, "turn_start");
        q.advance(time.add(TIMING.turnBannerMs));
        assert.deepEqual(q.view().deathBanners, []);
    });

    it("keeps reduced-motion floats when now() advances during pushEvents", () => {
        let now = 1000;
        const q = createAnimationQueue({
            now: () => ++now,
            viewerId: 1,
            playerName: () => "Rowan",
            reducedMotion: true,
        });
        q.pushEvents(
            [
                attackEvent({
                    outcome: "block",
                    damage: 0,
                    roll: { accuracy: 95, hit_roll: 11, block_chance: 40, block_roll: 9 },
                }),
            ],
            { units },
        );
        const view = q.view();
        assert.equal(view.floats.length, 1);
        assert.equal(view.floats[0].title, "Blocked");
        assert.equal(view.floats[0].chance, 40);
        assert.equal(view.floats[0].rise, 0);
        assert.equal(view.inputLocked, true);
    });

    it("snaps to the final board under reduced motion and holds static floating text for 900 ms", () => {
        const { q, time } = queue({ reducedMotion: true });
        q.pushEvents([moveEvent(), attackEvent()], { units });
        const view = q.view();
        assert.deepEqual(
            [view.poses["1-ranger"].x, view.poses["1-ranger"].y],
            [3, 5],
        );
        assert.equal(view.poses["1-ranger"].lift, 0);
        assert.equal(view.floats.length, 1);
        assert.equal(view.floats[0].kind, "hit");
        assert.equal(view.floats[0].value, 24);
        assert.equal(view.floats[0].title, "HIT");
        assert.equal(view.floats[0].rise, 0);
        assert.equal(view.floats[0].opacity, 1);
        assert.equal(view.inputLocked, true);

        q.advance(time.add(TIMING.floatMs - 1));
        assert.equal(q.view().inputLocked, true);
        assert.equal(q.view().floats[0].rise, 0);

        q.advance(time.add(1));
        assert.equal(q.view().inputLocked, false);
        assert.equal(q.view().floats.length, 0);
    });

    it("draws one board float per result and never both Html and a CSS overlay", () => {
        const { q } = queue({ reducedMotion: true });
        q.pushEvents([attackEvent()], { units });
        const floats = q.view().floats;
        assert.equal(floats.length, 1);
        assert.equal(htmlBoardFloats(floats).length, 1);
        assert.equal(projectedOverlayFloats(floats).length, 0);
        assert.equal(
            htmlBoardFloats(floats).length + projectedOverlayFloats(floats).length,
            1,
        );

        const moving = queue();
        moving.q.pushEvents([attackEvent({ outcome: "miss", damage: 0 })], { units });
        moving.q.advance(moving.time.add(TIMING.projectileMs));
        const live = moving.q.view().floats;
        assert.equal(live.length, 1);
        assert.equal(htmlBoardFloats(live).length, 1);
        assert.equal(projectedOverlayFloats(live).length, 0);
    });

    it("builds cue 8 floats only from the event payload", () => {
        const { q } = queue({ reducedMotion: true });
        q.pushEvents(
            [
                attackEvent({
                    outcome: "block",
                    damage: 0,
                    roll: { accuracy: 90, hit_roll: 20, block_chance: 40, block_roll: 9 },
                }),
            ],
            { units },
        );
        assert.deepEqual(
            {
                kind: q.view().floats[0].kind,
                title: q.view().floats[0].title,
                chance: q.view().floats[0].chance,
                x: q.view().floats[0].x,
                y: q.view().floats[0].y,
                unitId: q.view().floats[0].unitId,
            },
            { kind: "block", title: "Blocked", chance: 40, x: 3, y: 4, unitId: "2-warden" },
        );

        const miss = queue({ reducedMotion: true });
        miss.q.pushEvents(
            [
                attackEvent({
                    outcome: "miss",
                    damage: 0,
                    roll: { accuracy: 90, hit_roll: 96, block_chance: 12, block_roll: null },
                }),
            ],
            { units },
        );
        assert.deepEqual(
            {
                kind: miss.q.view().floats[0].kind,
                title: miss.q.view().floats[0].title,
                chance: miss.q.view().floats[0].chance,
            },
            { kind: "miss", title: "Miss", chance: 10 },
        );
    });

    it("slides a confirmed deployment swap over 160 ms", () => {
        const { q, time } = queue();
        const swap = detectConfirmedSwap(
            [
                { id: "1-ranger", owner_id: 1, x: 1, y: 7 },
                { id: "1-knight", owner_id: 1, x: 4, y: 7 },
            ],
            [
                { id: "1-ranger", owner_id: 1, x: 4, y: 7 },
                { id: "1-knight", owner_id: 1, x: 1, y: 7 },
            ],
        );
        assert.ok(swap);
        q.pushSwap(swap, {
            units: [
                { id: "1-ranger", owner_id: 1, x: 1, y: 7, hp: 82, max_hp: 82 },
                { id: "1-knight", owner_id: 1, x: 4, y: 7, hp: 110, max_hp: 110 },
            ],
        });
        q.advance(time.add(TIMING.swapMs / 2));
        const ranger = q.view().poses["1-ranger"];
        const knight = q.view().poses["1-knight"];
        assert.ok(ranger.x > 1 && ranger.x < 4);
        assert.ok(knight.x > 1 && knight.x < 4);
        assert.notEqual(ranger.x, knight.x);
        q.advance(time.add(TIMING.swapMs / 2));
        assert.deepEqual(
            [q.view().poses["1-ranger"].x, q.view().poses["1-ranger"].y],
            [4, 7],
        );
        assert.deepEqual(
            [q.view().poses["1-knight"].x, q.view().poses["1-knight"].y],
            [1, 7],
        );
        assert.equal(q.view().inputLocked, false);
    });

    it("anchors a float to a remembered target tile when poses were never ingested", () => {
        const { q } = queue({ reducedMotion: true });
        q.rememberUnits(units);
        q.pushEvents(
            [
                attackEvent({
                    outcome: "hit",
                    damage: 18,
                }),
            ],
            {},
        );
        assert.equal(q.view().floats[0].title, "HIT");
        assert.equal(q.view().floats[0].x, 3);
        assert.equal(q.view().floats[0].y, 4);
        assert.equal(q.view().floats[0].unitId, "2-warden");
    });

    it("uses skill amounts from the payload for floating text", () => {
        const { q } = queue({ reducedMotion: true });
        const skill: SkillEvent = {
            type: "skill",
            unit_id: "1-ranger",
            owner_id: 1,
            skill: "Piercing Shot",
            target_ids: ["2-warden"],
            amounts: { "2-warden": 34 },
            statuses: {},
        };
        q.pushEvents([skill], { units });
        assert.equal(q.view().floats[0].value, 34);
        assert.equal(q.view().floats[0].x, 3);
        assert.equal(q.view().floats[0].y, 4);
        assert.equal(q.view().floats[0].unitId, "2-warden");
        assert.equal(q.view().effects[0].kind, "streak");
    });
});
