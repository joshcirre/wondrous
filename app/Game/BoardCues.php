<?php

namespace App\Game;

final class BoardCues
{
    /**
     * @return array{breakdown: bool, skill_strip: bool}
     */
    public static function visibility(bool $reducedBoard, int $ownTurns): array
    {
        if (! $reducedBoard) {
            return ['breakdown' => true, 'skill_strip' => true];
        }

        return [
            'breakdown' => $ownTurns > 2,
            'skill_strip' => $ownTurns > 3,
        ];
    }

    /**
     * @param  array<string, mixed>  $state
     * @return array{breakdown: bool, skill_strip: bool}
     */
    public static function forViewer(bool $reducedBoard, array $state, int $viewerId): array
    {
        return self::visibility($reducedBoard, self::ownTurns($state, $viewerId));
    }

    /**
     * The viewer's own battle turns started, including the current one when it is theirs.
     *
     * @param  array<string, mixed>  $state
     */
    public static function ownTurns(array $state, int $viewerId): int
    {
        $turn = (int) ($state['turn_number'] ?? 0);
        if ($turn < 1) {
            return 0;
        }
        $first = self::firstPlayerId($state);
        if ($first === null) {
            return 0;
        }

        return $viewerId === $first
            ? (int) ceil($turn / 2)
            : (int) floor($turn / 2);
    }

    /**
     * @param  array<string, mixed>  $state
     */
    private static function firstPlayerId(array $state): ?int
    {
        $turn = (int) ($state['turn_number'] ?? 0);
        $current = $state['turn_player_id'] ?? null;
        if ($turn < 1 || ! is_int($current)) {
            return is_int($state['host_id'] ?? null) ? $state['host_id'] : null;
        }
        if ($turn % 2 === 1) {
            return $current;
        }

        return self::otherPlayerId($state, $current);
    }

    /**
     * @param  array<string, mixed>  $state
     */
    private static function otherPlayerId(array $state, int $id): ?int
    {
        foreach ($state['players'] ?? [] as $player) {
            if (($player['id'] ?? null) !== $id) {
                return $player['id'] ?? null;
            }
        }

        return null;
    }
}
