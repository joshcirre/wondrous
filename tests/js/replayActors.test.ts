import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPUTER_ID, actorName } from "../../resources/js/lib/replayActors.ts";

describe("actorName", () => {
    const players = [
        { id: 4, name: "Rowan" },
        { id: COMPUTER_ID, name: "Practice opponent" },
    ];

    it("uses the recorded player name", () => {
        assert.equal(actorName(players, 4), "Rowan");
    });

    it("shows the computer by name when the actor is null", () => {
        assert.equal(actorName(players, null), "Practice opponent");
    });

    it("falls back to Arena when no computer is in the match", () => {
        assert.equal(actorName([{ id: 4, name: "Rowan" }], null), "Arena");
    });
});
