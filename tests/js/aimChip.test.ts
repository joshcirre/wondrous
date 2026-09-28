import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aimChip } from "../../resources/js/lib/aimChip.ts";

const attack = {
    kind: "attack" as const,
    land_chance: 54,
    hit_chance: 90,
    block_side: "side" as const,
    block_chance: 20,
    damage_on_hit: 17,
    lethal: false,
    block_chances: { front: 40, side: 20, rear: 0 },
};

describe("aimChip", () => {
    it("shows land chance, breakdown, damage and the other sides", () => {
        const chip = aimChip({ preview: attack, showBreakdown: true });

        assert.equal(chip.landChance, 54);
        assert.deepEqual(chip.breakdown, {
            hit: 90,
            block: 20,
            side: "side",
        });
        assert.equal(chip.damage.text, "17");
        assert.equal(chip.damage.ember, false);
        assert.deepEqual(chip.otherBlocks, [
            { side: "front", chance: 40 },
            { side: "rear", chance: 0 },
        ]);
    });

    it("hides the breakdown and facing extras when the server says so", () => {
        const chip = aimChip({ preview: attack, showBreakdown: false });

        assert.equal(chip.landChance, 54);
        assert.equal(chip.breakdown, null);
        assert.equal(chip.otherBlocks, null);
        assert.equal(chip.damage.text, "17");
    });

    it("reads Defeats on a hit from a lethal attack option", () => {
        const chip = aimChip({
            preview: { ...attack, lethal: true },
            showBreakdown: true,
        });

        assert.equal(chip.damage.text, "Defeats on a hit");
        assert.equal(chip.damage.ember, true);
    });

    it("reads Defeats from a lethal skill option", () => {
        const chip = aimChip({
            preview: {
                kind: "skill",
                land_chance: 100,
                damage_on_hit: 34,
                lethal: true,
                always_hits: true,
            },
            showBreakdown: true,
        });

        assert.equal(chip.damage.text, "Defeats");
        assert.equal(chip.damage.ember, true);
        assert.equal(chip.landChance, 100);
        assert.equal(chip.breakdown, null);
    });
});
