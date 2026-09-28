import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CASTLE_POSITION,
    CASTLE_ROTATION_Y,
    CLOUD_POSITIONS,
    sceneryInForeground,
    sceneryPlacement,
} from "../../resources/js/lib/scenery.ts";

describe("sceneryPlacement", () => {
    it("keeps host-authored castle and clouds on the far horizon for the south viewer", () => {
        const castle = sceneryPlacement(
            CASTLE_POSITION,
            "south",
            CASTLE_ROTATION_Y,
        );

        assert.deepEqual(castle.position, [-0.5, -0.68, -9.5]);
        assert.equal(castle.rotationY, 0.12);
        assert.equal(sceneryInForeground(castle.position, "south"), false);

        for (const authored of CLOUD_POSITIONS) {
            const placed = sceneryPlacement(authored, "south");
            assert.deepEqual(placed.position, [...authored]);
            assert.equal(sceneryInForeground(placed.position, "south"), false);
        }
    });

    it("mirrors castle and clouds behind the north viewer so they leave the foreground", () => {
        const castle = sceneryPlacement(
            CASTLE_POSITION,
            "north",
            CASTLE_ROTATION_Y,
        );

        assert.deepEqual(castle.position, [0.5, -0.68, 9.5]);
        assert.equal(castle.rotationY, CASTLE_ROTATION_Y + Math.PI);
        assert.equal(sceneryInForeground(castle.position, "north"), false);
        assert.equal(sceneryInForeground(CASTLE_POSITION, "north"), true);

        for (const authored of CLOUD_POSITIONS) {
            const placed = sceneryPlacement(authored, "north");
            assert.deepEqual(placed.position, [
                -authored[0],
                authored[1],
                -authored[2],
            ]);
            assert.equal(sceneryInForeground(authored, "north"), true);
            assert.equal(sceneryInForeground(placed.position, "north"), false);
        }
    });

    it("never changes height when flipping a point around the board", () => {
        const placed = sceneryPlacement([-12, 8, -19], "north");

        assert.equal(placed.position[1], 8);
    });
});
