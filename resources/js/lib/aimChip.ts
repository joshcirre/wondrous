export type BlockSide = "front" | "side" | "rear";

export type AttackPreview = {
    kind: "attack";
    land_chance: number;
    hit_chance: number;
    block_side: BlockSide;
    block_chance: number;
    damage_on_hit: number;
    lethal: boolean;
    block_chances?: Partial<Record<BlockSide, number>>;
};

export type SkillPreview = {
    kind: "skill";
    land_chance: number;
    damage_on_hit?: number;
    lethal: boolean;
    always_hits?: boolean;
    effect?: string;
    amount?: number;
};

export type AimPreview = AttackPreview | SkillPreview;

export type AimChip = {
    landChance: number;
    breakdown: { hit: number; block: number; side: BlockSide } | null;
    damage: { text: string; ember: boolean };
    otherBlocks: { side: BlockSide; chance: number }[] | null;
};

const sideOrder: BlockSide[] = ["front", "side", "rear"];

export function aimChip(args: {
    preview: AimPreview;
    showBreakdown: boolean;
}): AimChip {
    const { preview, showBreakdown } = args;
    if (preview.kind === "skill") {
        return {
            landChance: preview.land_chance,
            breakdown: null,
            damage: {
                text: preview.lethal ? "Defeats" : String(preview.damage_on_hit ?? preview.amount ?? ""),
                ember: preview.lethal,
            },
            otherBlocks: null,
        };
    }
    const otherBlocks =
        showBreakdown && preview.block_chances
            ? sideOrder
                  .filter((side) => side !== preview.block_side)
                  .map((side) => ({
                      side,
                      chance: preview.block_chances?.[side] ?? 0,
                  }))
            : null;
    return {
        landChance: preview.land_chance,
        breakdown: showBreakdown
            ? {
                  hit: preview.hit_chance,
                  block: preview.block_chance,
                  side: preview.block_side,
              }
            : null,
        damage: {
            text: preview.lethal
                ? "Defeats on a hit"
                : String(preview.damage_on_hit),
            ember: preview.lethal,
        },
        otherBlocks,
    };
}
