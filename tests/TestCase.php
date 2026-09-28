<?php

namespace Tests;

use App\Game\ComputerOpponent;
use App\Game\Progression;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    protected function recordFinishedMatches(User $user, int $count, ?int $winnerId = null, int $turnNumber = 1): void
    {
        for ($i = 0; $i < $count; $i++) {
            Game::create([
                'id' => (string) Str::ulid(),
                'code' => strtoupper(Str::random(6)),
                'name' => 'Prior match',
                'host_id' => $user->id,
                'phase' => 'finished',
                'mode' => 'practice',
                'ranked' => false,
                'time_control' => 'live',
                'state' => [
                    'phase' => 'finished',
                    'winner_id' => $winnerId ?? ComputerOpponent::ID,
                    'turn_number' => $turnNumber,
                    'players' => [['id' => $user->id, 'name' => $user->name]],
                    'units' => [],
                ],
            ]);
        }
    }

    protected function ensureProgressionUnlocked(User $user): void
    {
        $progress = Progression::for($user);
        if ($progress['unlocks']['draft'] && $progress['unlocks']['ranked'] && $progress['unlocks']['loadouts']) {
            return;
        }
        $needed = max(Progression::DRAFT_AFTER - $progress['matches_finished'], $progress['has_won'] ? 0 : 1);
        if ($needed > 0) {
            $this->recordFinishedMatches($user, $needed, $user->id);
        }
    }
}
