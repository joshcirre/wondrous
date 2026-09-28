import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    BADGE_CHIP_LINE,
    BADGE_CHIP_SURFACE,
    BADGE_COUNT_COLOR,
    BADGE_FADE_MS,
    BADGE_GAP_PX,
    BADGE_ROW_MAX_W,
    BADGE_ROW_Y,
    BADGE_SLOT_PX,
    HEALTH_BAR_H,
    HEALTH_BAR_Y,
    LESSON_FADE_MS,
    RESULT_CLEARANCE,
    STATUS_OVERLAY_POINTER_EVENTS,
    STATUS_STYLE,
    badgeChipSize,
    badgeLocalOffset,
    badgeRowWorldWidth,
    badgeWorldX,
    resultAnchorY,
    resultHidesUnitBadges,
    spentFromServer,
    statusBadgeRow,
} from "../../resources/js/lib/statusCues.ts";

const facts = {
    stun: { name: "Stunned", label: "Stunned: skips {turns} {turnWord}" },
    root: { name: "Rooted", label: "Rooted: cannot move, {turns} {turnWord}" },
    burn: {
        name: "Burning",
        amount: 8,
        label: "Burning: {amount} damage at turn end, {turns} {turnWord}",
    },
    ward: {
        name: "Warded",
        amount: 12,
        label: "Warded: +{amount} armor, {turns} {turnWord}",
    },
};

describe("statusBadgeRow", () => {
    it("includes rest then every status from state, in family order", () => {
        const row = statusBadgeRow({
            recovery: 2,
            statuses: { ward: 2, burn: 2, stun: 1, root: 2 },
            facts,
        });

        assert.deepEqual(
            row.map((badge) => badge.id),
            ["rest", "stun", "root", "burn", "ward"],
        );
        assert.equal(row.length, 5);
    });

    it("shows turns left from state on every badge", () => {
        const row = statusBadgeRow({
            recovery: 2,
            statuses: { stun: 1, root: 2, burn: 2, ward: 2 },
            facts,
        });

        assert.deepEqual(
            Object.fromEntries(row.map((badge) => [badge.id, badge.turns])),
            { rest: 2, stun: 1, root: 2, burn: 2, ward: 2 },
        );
        assert.deepEqual(
            Object.fromEntries(row.map((badge) => [badge.id, badge.text])),
            { rest: "2", stun: "1", root: "2", burn: "2", ward: "2" },
        );
    });

    it("fills labels from server facts and state durations, never inventing amounts", () => {
        const row = statusBadgeRow({
            recovery: 0,
            statuses: { stun: 1, burn: 2 },
            facts,
        });

        assert.equal(row[0].label, "Stunned: skips 1 turn");
        assert.equal(row[1].label, "Burning: 8 damage at turn end, 2 turns");
    });

    it("falls back to the side-panel status · turns copy when facts are missing", () => {
        const row = statusBadgeRow({
            recovery: 1,
            statuses: { root: 2 },
        });

        assert.equal(row[0].label, "Recovering · 1");
        assert.equal(row[1].label, "root · 2");
    });

    it("omits empty or zero-turn statuses and fallen-only rest", () => {
        const row = statusBadgeRow({
            recovery: 0,
            statuses: { stun: 0, root: 2, burn: undefined as unknown as number },
            facts,
        });

        assert.deepEqual(
            row.map((badge) => badge.id),
            ["root"],
        );
    });

    for (const count of [1, 2, 3, 4]) {
        it(`lays out ${count} badge(s) without overlap`, () => {
            const keys = ["stun", "root", "burn", "ward"] as const;
            const statuses = Object.fromEntries(
                keys.slice(0, Math.max(0, count - 1)).map((key, i) => [key, i + 1]),
            );
            const row = statusBadgeRow({
                recovery: 1,
                statuses,
                facts,
            });

            assert.equal(row.length, count);
            for (let i = 0; i < row.length; i++) {
                assert.equal(row[i].left, i * (BADGE_SLOT_PX + BADGE_GAP_PX));
                assert.equal(row[i].width, BADGE_SLOT_PX);
                for (let j = i + 1; j < row.length; j++) {
                    assert.ok(
                        row[i].left + row[i].width + BADGE_GAP_PX <= row[j].left ||
                            row[i].left + row[i].width <= row[j].left,
                        `badge ${row[i].id} overlaps ${row[j].id}`,
                    );
                }
            }
        });
    }

    for (const count of [1, 2, 3, 4]) {
        it(`keeps a ${count}-badge row within about one tile`, () => {
            const keys = ["stun", "root", "burn", "ward"] as const;
            const statuses = Object.fromEntries(
                keys.slice(0, Math.max(0, count - 1)).map((key, i) => [key, i + 1]),
            );
            const row = statusBadgeRow({
                recovery: 1,
                statuses,
                facts,
            });
            assert.equal(row.length, count);
            const width = badgeRowWorldWidth(count);
            assert.ok(
                width <= BADGE_ROW_MAX_W + 1e-6,
                `row width ${width} exceeds one tile (${BADGE_ROW_MAX_W})`,
            );
            const xs = row.map((_, index) => badgeWorldX(index, count));
            for (let i = 1; i < xs.length; i++) {
                assert.ok(xs[i] > xs[i - 1], "chips should stay in order");
            }
            assert.ok(Math.abs((xs[0] + xs[xs.length - 1]) / 2) < 1e-6);
        });
    }

    it("offsets chips on local X only so one row billboard stays horizontal", () => {
        const count = 5;
        const xs: number[] = [];
        for (let i = 0; i < count; i++) {
            const [x, y, z] = badgeLocalOffset(i, count);
            assert.equal(x, badgeWorldX(i, count));
            assert.equal(y, 0);
            assert.equal(z, 0);
            xs.push(x);
        }
        assert.ok(Math.abs((xs[0] + xs[xs.length - 1]) / 2) < 1e-6);
    });

    it("keeps the whole badge row above the health bar plus a gap", () => {
        const healthTop = HEALTH_BAR_Y + HEALTH_BAR_H / 2;
        for (const count of [1, 2, 3, 4, 5]) {
            const { height } = badgeChipSize(count);
            const chipBottom = BADGE_ROW_Y - height / 2;
            assert.ok(
                chipBottom > healthTop,
                `count ${count}: chip bottom ${chipBottom} overlaps health top ${healthTop}`,
            );
            assert.ok(
                chipBottom - healthTop >= 0.08 - 1e-6,
                `count ${count}: gap ${chipBottom - healthTop} is too small`,
            );
        }
    });

    it("never lets status overlays take a board pointer", () => {
        assert.equal(STATUS_OVERLAY_POINTER_EVENTS, "none");
    });

    it("uses the shared dark chip and puts colour only on the glyph", () => {
        assert.equal(BADGE_CHIP_SURFACE, "#191f1a");
        assert.equal(BADGE_COUNT_COLOR, "#eae7db");
        assert.ok(BADGE_CHIP_LINE.length > 0);
        assert.deepEqual(
            Object.fromEntries(
                Object.entries(STATUS_STYLE).map(([id, style]) => [id, style.color]),
            ),
            {
                rest: "#a6ad9f",
                stun: "#a6ad9f",
                burn: "#e0894a",
                ward: "#9fb3c8",
                root: "#8f9a5b",
            },
        );
        const row = statusBadgeRow({
            recovery: 2,
            statuses: { stun: 1, root: 2, burn: 2, ward: 2 },
        });
        for (const badge of row) {
            assert.equal(badge.color, STATUS_STYLE[badge.id].color);
            assert.notEqual(badge.color, "#edce91");
            assert.notEqual(badge.color, "#d5b676");
            assert.notEqual(badge.color, "#d99088");
            assert.notEqual(badge.color, "#c4a574");
        }
    });
});

describe("result box vs badges", () => {
    it("anchors just above the health bar and ignores badge count", () => {
        const healthTop = HEALTH_BAR_Y + HEALTH_BAR_H / 2;
        const y = resultAnchorY();
        assert.equal(y, healthTop + RESULT_CLEARANCE);
        assert.ok(y > healthTop);
        assert.ok(RESULT_CLEARANCE > 0 && RESULT_CLEARANCE <= 0.08 + 1e-6);
        assert.ok(y < BADGE_ROW_Y);
        assert.equal(resultAnchorY(), resultAnchorY());
    });

    it("hides only the target's badges while the result shows", () => {
        const floats = [{ unitId: "target" }, { unitId: "target" }];
        assert.equal(resultHidesUnitBadges("target", floats), true);
        assert.equal(resultHidesUnitBadges("neighbour", floats), false);
        assert.equal(resultHidesUnitBadges("target", []), false);
        assert.equal(BADGE_FADE_MS, 140);
    });
});

describe("lesson card motion", () => {
    it("fades the card in 140 ms with no slide", () => {
        assert.equal(LESSON_FADE_MS, 140);
    });
});

describe("spentFromServer", () => {
    it("does not dim teammates blocked only because another champion is active", () => {
        const cue = spentFromServer({
            statuses: {},
            recovery: 0,
            option: {
                can_activate: false,
                reason: "Only one character can activate per turn.",
                reason_code: "other_active",
                spent: false,
            },
        });

        assert.equal(cue.spent, false);
        assert.equal(cue.reason, null);
    });

    it("marks spent when the server flags this unit spent", () => {
        const cue = spentFromServer({
            statuses: {},
            recovery: 0,
            option: {
                can_activate: true,
                reason: null,
                reason_code: null,
                spent: true,
                spent_reason: "This character is recovering.",
            },
        });

        assert.equal(cue.spent, true);
        assert.equal(cue.reason, "This character is recovering.");
    });

    it("uses stun from unit state, not a client rule", () => {
        const cue = spentFromServer({
            statuses: { stun: 1 },
            recovery: 0,
            option: null,
        });

        assert.equal(cue.spent, true);
        assert.equal(cue.reason, null);
    });

    it("uses recovery from unit state for the resting spent look", () => {
        const cue = spentFromServer({
            statuses: {},
            recovery: 2,
            option: null,
        });

        assert.equal(cue.spent, true);
    });

    it("does not re-derive spent from client acted or active-unit fields", () => {
        const cue = spentFromServer({
            statuses: {},
            recovery: 0,
            option: { can_activate: true, reason: null },
            acted: true,
            active_unit_id: "someone-else",
        });

        assert.equal(cue.spent, false);
        assert.equal(cue.reason, null);
    });

    it("does not treat root, burn or ward as spent", () => {
        const cue = spentFromServer({
            statuses: { root: 2, burn: 2, ward: 2 },
            recovery: 0,
            option: { can_activate: true, reason: null },
        });

        assert.equal(cue.spent, false);
    });

    it("prefers the server spent flag and reason when stun is also in state", () => {
        const cue = spentFromServer({
            statuses: { stun: 1 },
            recovery: 0,
            option: {
                can_activate: false,
                reason: "This character is stunned.",
                reason_code: "stunned",
                spent: true,
            },
        });

        assert.equal(cue.spent, true);
        assert.equal(cue.reason, "This character is stunned.");
    });

    it("does not treat can_activate false as spent without a server spent flag", () => {
        const cue = spentFromServer({
            statuses: {},
            recovery: 0,
            option: {
                can_activate: false,
                reason: "Only one character can activate per turn.",
            },
        });

        assert.equal(cue.spent, false);
        assert.equal(cue.reason, null);
    });
});
