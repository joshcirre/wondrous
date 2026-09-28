import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    BADGE_GAP_PX,
    BADGE_SLOT_PX,
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
