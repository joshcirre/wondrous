export const COMPUTER_ID = -1;

export function actorName(
    players: { id: number; name: string }[],
    actorId: number | null,
    fallback = "Arena",
): string {
    const named = players.find((player) => player.id === actorId);
    if (named) {
        return named.name;
    }
    if (actorId == null) {
        const computer = players.find((player) => player.id === COMPUTER_ID);
        if (computer) {
            return computer.name;
        }
    }
    return fallback;
}
