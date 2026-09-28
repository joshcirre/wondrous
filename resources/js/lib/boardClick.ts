export type BoardHit = {
    role: "tile" | "pawn";
    x: number;
    y: number;
    unitId?: string;
};

export type BoardHighlight = { x: number; y: number; kind?: string };

export type BoardDecision =
    | { type: "tile"; x: number; y: number }
    | { type: "select"; unitId: string }
    | { type: "deselect" }
    | { type: "none" };

export type SelectedUnit = { id: string; x: number; y: number };

export function collectBoardHits(
    intersections: Array<{ object: { userData: Record<string, unknown> } }>,
): BoardHit[] {
    const hits: BoardHit[] = [];
    for (const hit of intersections) {
        const data = hit.object.userData;
        if (
            data.boardKind === "pawn" &&
            typeof data.unitId === "string" &&
            typeof data.x === "number" &&
            typeof data.y === "number"
        ) {
            hits.push({
                role: "pawn",
                x: data.x,
                y: data.y,
                unitId: data.unitId,
            });
        } else if (
            data.boardKind === "tile" &&
            typeof data.x === "number" &&
            typeof data.y === "number"
        ) {
            hits.push({ role: "tile", x: data.x, y: data.y });
        }
    }
    return hits;
}

function isOwnTile(
    selected: SelectedUnit | null | undefined,
    x: number,
    y: number,
): boolean {
    return Boolean(selected && selected.x === x && selected.y === y);
}

export function resolveBoardClick(
    hits: BoardHit[],
    highlights: BoardHighlight[],
    selected?: SelectedUnit | null,
): BoardDecision {
    const highlightAt = new Map(
        highlights.map((highlight) => [`${highlight.x},${highlight.y}`, highlight]),
    );
    const preferred = hits.find((hit) =>
        highlightAt.has(`${hit.x},${hit.y}`),
    );
    if (preferred) {
        const kind = highlightAt.get(`${preferred.x},${preferred.y}`)?.kind;
        if (
            isOwnTile(selected, preferred.x, preferred.y) &&
            kind !== "attack" &&
            kind !== "skill"
        ) {
            return { type: "deselect" };
        }
        return { type: "tile", x: preferred.x, y: preferred.y };
    }
    const pawn = hits.find((hit) => hit.role === "pawn" && hit.unitId);
    if (pawn?.unitId) {
        if (selected && pawn.unitId === selected.id) {
            return { type: "deselect" };
        }
        return { type: "select", unitId: pawn.unitId };
    }
    const tile = hits.find((hit) => hit.role === "tile");
    if (tile) {
        if (isOwnTile(selected, tile.x, tile.y)) {
            return { type: "deselect" };
        }
        return { type: "tile", x: tile.x, y: tile.y };
    }
    return { type: "none" };
}

export function battleTargets<
    T extends { id: string; hp: number; x: number; y: number; owner_id: number },
>(args: {
    selected: { id: string; x: number; y: number; owner_id: number } | null | undefined;
    character:
        | { range: number; skill: { target: string; range: number } }
        | null
        | undefined;
    canControl: boolean;
    mode: "move" | "attack" | "skill";
    acted: boolean;
    units: T[];
    viewerId: number;
}): T[] {
    const { selected, character, canControl, mode, acted, units, viewerId } =
        args;
    if (!selected || !character || !canControl || mode === "move" || acted) {
        return [];
    }
    const skill = mode === "skill";
    const target = skill ? character.skill.target : "enemy";
    const range = skill ? character.skill.range : character.range;
    return units.filter((unit) => {
        if (unit.hp <= 0) {
            return false;
        }
        const allowed =
            target === "self"
                ? unit.id === selected.id
                : target === "enemy"
                  ? unit.owner_id !== viewerId
                  : unit.owner_id === viewerId;
        if (!allowed) {
            return false;
        }
        return (
            Math.abs(unit.x - selected.x) + Math.abs(unit.y - selected.y) <=
            range
        );
    });
}
