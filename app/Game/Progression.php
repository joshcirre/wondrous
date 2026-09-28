<?php

namespace App\Game;

use App\Models\Game;
use App\Models\User;

/** Server-owned unlocks. Brief can change the thresholds and hint copy here. */
final class Progression
{
    public const FORMATION_AFTER = 1;

    public const DRAFT_AFTER = 2;

    public const SPECIALISTS_AFTER = 2;

    public const LOADOUTS_AFTER = 2;

    public const RANKED_HINT = 'Ranked unlocks after your first win.';

    public const CORRESPONDENCE_HINT = 'Correspondence unlocks after your first win.';

    public const LOADOUTS_HINT = 'Loadouts unlock after your third match.';

    public const RANKINGS_HINT = 'Rankings unlock after your first win.';

    public const CROWNS_HINT = 'Crowns unlock after your first win.';

    /**
     * @return array{
     *     matches_finished: int,
     *     has_won: bool,
     *     unlocks: array{
     *         formation: bool,
     *         draft: bool,
     *         specialists: bool,
     *         loadouts: bool,
     *         ranked: bool,
     *         crowns: bool,
     *         correspondence: bool,
     *         rankings: bool
     *     },
     *     hints: array{
     *         ranked: string,
     *         correspondence: string,
     *         loadouts: string,
     *         rankings: string,
     *         crowns: string
     *     }
     * }
     */
    public static function for(?User $user): array
    {
        $finished = 0;
        $hasWon = false;
        if ($user) {
            $query = Game::query()->where(fn ($q) => $q->where('host_id', $user->id)->orWhere('guest_id', $user->id))->where('phase', 'finished');
            $finished = (int) (clone $query)->count();
            $hasWon = (clone $query)->where('state->winner_id', $user->id)->exists();
        }

        return [
            'matches_finished' => $finished,
            'has_won' => $hasWon,
            'unlocks' => [
                'formation' => $finished >= self::FORMATION_AFTER,
                'draft' => $finished >= self::DRAFT_AFTER,
                'specialists' => $finished >= self::SPECIALISTS_AFTER,
                'loadouts' => $finished >= self::LOADOUTS_AFTER,
                'ranked' => $hasWon,
                'crowns' => $hasWon,
                'correspondence' => $hasWon,
                'rankings' => $hasWon,
            ],
            'hints' => [
                'ranked' => self::RANKED_HINT,
                'correspondence' => self::CORRESPONDENCE_HINT,
                'loadouts' => self::LOADOUTS_HINT,
                'rankings' => self::RANKINGS_HINT,
                'crowns' => self::CROWNS_HINT,
            ],
        ];
    }
}
