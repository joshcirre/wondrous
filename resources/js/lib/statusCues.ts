export const BADGE_SLOT_PX = 32;
export const BADGE_GAP_PX = 4;
export const BADGE_CHIP_GAP = 0.03;
export const BADGE_CHIP_MAX_W = 0.32;
export const BADGE_ROW_MAX_W = 1;
export const BADGE_ROW_Y = 1.58;
export const STATUS_OVERLAY_POINTER_EVENTS = "none" as const;

export function badgeChipSize(count: number): { width: number; height: number } {
    if (count <= 0) {
        return { width: 0, height: 0 };
    }
    const width = Math.min(
        BADGE_CHIP_MAX_W,
        (BADGE_ROW_MAX_W - (count - 1) * BADGE_CHIP_GAP) / count,
    );
    return { width, height: width * 0.62 };
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

export const STATUS_STYLE: Record<string, { glyph: string; color: string }> = {
    rest: { glyph: "☾", color: "#7d8479" },
    stun: { glyph: "✧", color: "#7d8479" },
    root: { glyph: "⊥", color: "#c4a574" },
    burn: { glyph: "✶", color: "#e07a42" },
    ward: { glyph: "◈", color: "#9aa4a8" },
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
    return STATUS_STYLE[id] ?? { glyph: "•", color: "#7d8479" };
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
