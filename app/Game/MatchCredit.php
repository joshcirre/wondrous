<?php

namespace App\Game;

/** Shared bar for rewards and the competitive unlock fallback. */
final class MatchCredit
{
    /** Eight completed battle turns. turn_number counts both sides, so 9 is the first that qualifies. */
    public const MIN_TURN = 9;

    public static function qualifies(array $state): bool
    {
        return (int) ($state['turn_number'] ?? 0) >= self::MIN_TURN;
    }
}
