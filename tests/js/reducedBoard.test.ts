import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cueVisibility } from "../../resources/js/lib/reducedBoard.ts";

describe("cueVisibility", () => {
    it("uses the server cues and does not invent turn math", () => {
        assert.deepEqual(
            cueVisibility({ breakdown: false, skill_strip: false }),
            { breakdown: false, skill_strip: false },
        );
        assert.deepEqual(
            cueVisibility({ breakdown: true, skill_strip: false }),
            { breakdown: true, skill_strip: false },
        );
        assert.deepEqual(
            cueVisibility({ breakdown: true, skill_strip: true }),
            { breakdown: true, skill_strip: true },
        );
    });

    it("shows the full board when the server sent no cue flags", () => {
        assert.deepEqual(cueVisibility(null), {
            breakdown: true,
            skill_strip: true,
        });
    });
});
