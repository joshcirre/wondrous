import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fadedUnitIds } from "../../resources/js/lib/boardFade.ts";

const southCamera = { x: 9, y: 12, z: 13 };

describe("fadedUnitIds", () => {
    it("marks a miniature in front of a highlighted move tile as fading", () => {
        const faded = fadedUnitIds({
            hover: { x: 3, y: 6 },
            units: [
                { id: "ranger-d1", x: 3, y: 7, hp: 82 },
                { id: "cleric-e1", x: 4, y: 7, hp: 88 },
            ],
            camera: southCamera,
        });

        assert.ok(
            faded.includes("cleric-e1"),
            "cleric standing in front of D2 must fade so the tile is visible",
        );
    });

    it("does not fade a miniature standing on the hovered tile", () => {
        const faded = fadedUnitIds({
            hover: { x: 3, y: 4 },
            units: [{ id: "warden", x: 3, y: 4, hp: 80 }],
            camera: southCamera,
        });

        assert.deepEqual(faded, []);
    });

    it("does not fade anyone when nothing is hovered", () => {
        const faded = fadedUnitIds({
            hover: null,
            units: [{ id: "cleric-e1", x: 4, y: 7, hp: 88 }],
            camera: southCamera,
        });

        assert.deepEqual(faded, []);
    });
});
