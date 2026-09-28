export type CueFlags = {
    breakdown: boolean;
    skill_strip: boolean;
};

export function cueVisibility(cues: CueFlags | null | undefined): CueFlags {
    return {
        breakdown: cues?.breakdown ?? true,
        skill_strip: cues?.skill_strip ?? true,
    };
}
