import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    battleTargets,
    resolveBoardClick,
} from "../../resources/js/lib/boardClick.ts";

describe("resolveBoardClick", () => {
    it("prefers a highlighted move tile over a neighbouring miniature in front of it", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 4, y: 7, unitId: "cleric-e1" },
                { role: "tile", x: 3, y: 6 },
            ],
            [{ x: 3, y: 6, kind: "move" }],
        );

        assert.deepEqual(decision, { type: "tile", x: 3, y: 6 });
    });

    it("prefers a highlighted enemy tile over an allied miniature standing in front", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 3, y: 5, unitId: "warden" },
                { role: "tile", x: 3, y: 4 },
                { role: "pawn", x: 3, y: 4, unitId: "ranger" },
            ],
            [{ x: 3, y: 4, kind: "attack" }],
        );

        assert.deepEqual(decision, { type: "tile", x: 3, y: 4 });
    });

    it("selects a champion when nothing is selected", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 4, y: 7, unitId: "cleric-e1" },
                { role: "tile", x: 4, y: 7 },
            ],
            [],
            null,
        );

        assert.deepEqual(decision, { type: "select", unitId: "cleric-e1" });
    });

    it("swaps by sending deploy onto another friendly highlighted tile", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 4, y: 7, unitId: "cleric-e1" },
                { role: "tile", x: 4, y: 7 },
            ],
            [
                { x: 3, y: 7, kind: "move" },
                { x: 4, y: 7, kind: "move" },
            ],
            { id: "ranger-d1", x: 3, y: 7 },
        );

        assert.deepEqual(decision, { type: "tile", x: 4, y: 7 });
    });

    it("deselects when the selected champion is clicked again", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 4, y: 7, unitId: "cleric-e1" },
                { role: "tile", x: 4, y: 7 },
            ],
            [
                { x: 3, y: 7, kind: "move" },
                { x: 4, y: 7, kind: "move" },
            ],
            { id: "cleric-e1", x: 4, y: 7 },
        );

        assert.deepEqual(decision, { type: "deselect" });
    });

    it("selects a champion when the click only hits that champion's own base", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 3, y: 7, unitId: "ranger-d1" },
                { role: "tile", x: 3, y: 7 },
            ],
            [{ x: 3, y: 6, kind: "move" }],
        );

        assert.deepEqual(decision, { type: "select", unitId: "ranger-d1" });
    });

    it("does not resolve a stolen pawn hit into a select when a highlighted target is also on the ray", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 4, y: 1, unitId: "wrong-warden" },
                { role: "pawn", x: 5, y: 1, unitId: "intended-witch" },
                { role: "tile", x: 5, y: 1 },
            ],
            [{ x: 5, y: 1, kind: "skill" }],
        );

        assert.deepEqual(decision, { type: "tile", x: 5, y: 1 });
        assert.notEqual(decision.type === "select" && decision.unitId, "wrong-warden");
    });

    it("uses the nearest highlighted tile when two highlighted targets lie on the same ray", () => {
        const decision = resolveBoardClick(
            [
                { role: "pawn", x: 2, y: 2, unitId: "near" },
                { role: "tile", x: 2, y: 2 },
                { role: "pawn", x: 2, y: 4, unitId: "far" },
                { role: "tile", x: 2, y: 4 },
            ],
            [
                { x: 2, y: 2, kind: "attack" },
                { x: 2, y: 4, kind: "attack" },
            ],
        );

        assert.deepEqual(decision, { type: "tile", x: 2, y: 2 });
    });
});

describe("battleTargets", () => {
    const selected = { id: "ranger", x: 3, y: 7, owner_id: 1 };
    const character = {
        range: 3,
        skill: { target: "enemy", range: 4 },
    };
    const units = [
        selected,
        { id: "witch", hp: 40, x: 3, y: 4, owner_id: 2 },
        { id: "far", hp: 40, x: 0, y: 0, owner_id: 2 },
        { id: "dead", hp: 0, x: 3, y: 5, owner_id: 2 },
    ];

    it("lists living enemies in range while the unit can still act", () => {
        const found = battleTargets({
            selected,
            character,
            canControl: true,
            mode: "attack",
            acted: false,
            units,
            viewerId: 1,
        });

        assert.deepEqual(
            found.map((u) => u.id),
            ["witch"],
        );
    });

    it("clears targets once the selected unit has already acted", () => {
        const found = battleTargets({
            selected,
            character,
            canControl: true,
            mode: "skill",
            acted: true,
            units,
            viewerId: 1,
        });

        assert.deepEqual(found, []);
    });
});
