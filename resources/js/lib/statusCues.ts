export const BADGE_SLOT_PX = 32;
export const BADGE_GAP_PX = 4;
export const BADGE_CHIP_GAP = 0.025;
export const BADGE_CHIP_W = 0.28;
export const BADGE_CHIP_H = BADGE_CHIP_W * 0.68;
export const BADGE_CHIP_MAX_W = BADGE_CHIP_W;
export const BADGE_ROW_MAX_W = 1;
export const HEALTH_BAR_Y = 1.37;
export const HEALTH_BAR_H = 0.067;
export const BADGE_HEALTH_GAP = 0.08;
export const RESULT_CLEARANCE = 0.08;
export const BADGE_ROW_Y =
    HEALTH_BAR_Y + HEALTH_BAR_H / 2 + BADGE_HEALTH_GAP + BADGE_CHIP_H / 2;
export const BADGE_CHIP_SURFACE = "#191f1a";
export const BADGE_CHIP_LINE = "rgba(213, 204, 174, 0.28)";
export const BADGE_COUNT_COLOR = "#eae7db";
export const BADGE_FADE_MS = 140;
export const LESSON_FADE_MS = 140;
export const STATUS_OVERLAY_POINTER_EVENTS = "none" as const;

export function badgeChipSize(count: number): { width: number; height: number } {
    if (count <= 0) {
        return { width: 0, height: 0 };
    }
    return { width: BADGE_CHIP_W, height: BADGE_CHIP_H };
}

export function badgeRowWorldWidth(count: number): number {
    if (count <= 0) {
        return 0;
    }
    const { width } = badgeChipSize(count);
    return count * width + (count - 1) * BADGE_CHIP_GAP;
}

export function badgeWorldX(index: number, count: number): number {
    const { width } = badgeChipSize(count);
    const row = badgeRowWorldWidth(count);
    return -row / 2 + width / 2 + index * (width + BADGE_CHIP_GAP);
}

export function badgeLocalOffset(index: number, count: number): [number, number, number] {
    return [badgeWorldX(index, count), 0, 0];
}

export const STATUS_STYLE: Record<string, { glyph: string; color: string }> = {
    rest: { glyph: "☾", color: "#a6ad9f" },
    stun: { glyph: "✧", color: "#a6ad9f" },
    root: { glyph: "⊥", color: "#8f9a5b" },
    burn: { glyph: "✶", color: "#e0894a" },
    ward: { glyph: "◈", color: "#9fb3c8" },
};

const FAMILY_ORDER = ["rest", "stun", "root", "burn", "ward"] as const;

export type StatusFact = {
    id?: string;
    name: string;
    amount?: number | null;
    label: string;
};

export type StatusBadge = {
    id: string;
    glyph: string;
    color: string;
    turns: number;
    text: string;
    label: string;
    left: number;
    width: number;
};

export type SpentOption = {
    can_activate: boolean;
    reason: string | null;
    reason_code?: string | null;
    spent?: boolean;
    spent_reason?: string | null;
};

export type SpentCue = {
    spent: boolean;
    reason: string | null;
};

const UNIT_SPENT_CODES = new Set(["recovering", "stunned", "acted"]);

function styleFor(id: string): { glyph: string; color: string } {
    return STATUS_STYLE[id] ?? { glyph: "•", color: "#a6ad9f" };
}

export function resultAnchorY(): number {
    return HEALTH_BAR_Y + HEALTH_BAR_H / 2 + RESULT_CLEARANCE;
}

export function resultHidesUnitBadges(
    unitId: string,
    floats: Array<{ unitId: string }>,
): boolean {
    return floats.some((item) => item.unitId === unitId);
}

export function lessonKey(lesson: { step: number; variant?: string | null }): string {
    return `${lesson.step}:${lesson.variant ?? ""}`;
}

function fillLabel(
    template: string,
    turns: number,
    amount?: number | null,
): string {
    const turnWord = turns === 1 ? "turn" : "turns";
    return template
        .replaceAll("{turns}", String(turns))
        .replaceAll("{turnWord}", turnWord)
        .replaceAll("{amount}", amount != null ? String(amount) : "");
}

function badgeLabel(
    id: string,
    turns: number,
    facts?: Record<string, StatusFact>,
): string {
    if (id === "rest") {
        const fact = facts?.rest;
        return fact
            ? fillLabel(fact.label, turns, fact.amount)
            : `Recovering · ${turns}`;
    }
    const fact = facts?.[id];
    if (!fact) return `${id} · ${turns}`;
    return fillLabel(fact.label, turns, fact.amount);
}

function statusKeys(statuses: Record<string, number | undefined>): string[] {
    const known = FAMILY_ORDER.filter(
        (id) => id !== "rest" && (statuses[id] ?? 0) > 0,
    );
    const extras = Object.keys(statuses)
        .filter(
            (id) =>
                !FAMILY_ORDER.includes(id as (typeof FAMILY_ORDER)[number]) &&
                (statuses[id] ?? 0) > 0,
        )
        .sort();
    return [...known, ...extras];
}

export function statusBadgeRow(args: {
    recovery: number;
    statuses: Record<string, number | undefined>;
    facts?: Record<string, StatusFact>;
}): StatusBadge[] {
    const items: Array<{ id: string; turns: number }> = [];
    if ((args.recovery ?? 0) > 0) {
        items.push({ id: "rest", turns: args.recovery });
    }
    for (const id of statusKeys(args.statuses ?? {})) {
        items.push({ id, turns: args.statuses[id] as number });
    }
    return items.map((item, index) => {
        const style = styleFor(item.id);
        return {
            id: item.id,
            glyph: style.glyph,
            color: style.color,
            turns: item.turns,
            text: String(item.turns),
            label: badgeLabel(item.id, item.turns, args.facts),
            left: index * (BADGE_SLOT_PX + BADGE_GAP_PX),
            width: BADGE_SLOT_PX,
        };
    });
}

export function spentFromServer(args: {
    statuses: Record<string, number | undefined>;
    recovery: number;
    option?: SpentOption | null;
    acted?: unknown;
    active_unit_id?: unknown;
}): SpentCue {
    void args.acted;
    void args.active_unit_id;
    const option = args.option;
    if (option && typeof option.spent === "boolean") {
        return {
            spent: option.spent,
            reason: option.spent
                ? option.spent_reason ?? option.reason ?? null
                : null,
        };
    }
    if (option?.reason_code) {
        const spent = UNIT_SPENT_CODES.has(option.reason_code);
        return {
            spent,
            reason: spent
                ? option.spent_reason ?? option.reason ?? null
                : null,
        };
    }
    const stun = (args.statuses?.stun ?? 0) > 0;
    const rest = (args.recovery ?? 0) > 0;
    return {
        spent: stun || rest,
        reason: null,
    };
}
