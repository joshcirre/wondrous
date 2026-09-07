<?php

namespace App\Game;

/** A bounded tactical search. Simulations never consume the real game's random rolls. */
final class ComputerOpponent
{
    // Only present in board state, never a users-table ID or an authenticated actor.
    public const ID = -1;

    private GameEngine $simulation;

    public function __construct()
    {
        $this->simulation = new GameEngine(fn (int $min, int $max) => $max === 100 ? 50 : $min);
    }

    /** @return array{type: string, payload: array}|null */
    public function choose(array $state): ?array
    {
        if ($state['phase'] === 'draft' && $state['turn_player_id'] === self::ID) {
            $offers = $state['offers'][self::ID];
            $roles = array_map(fn ($id) => CharacterCatalog::get($id)['role'], $state['draft_picks'][self::ID]);
            usort($offers, function ($a, $b) use ($roles) {
                $score = fn ($id) => CharacterCatalog::get($id)['hp'] / 10 + CharacterCatalog::get($id)['range'] * 4
                    + (in_array(CharacterCatalog::get($id)['role'], $roles) ? 0 : 15);

                return $score($b) <=> $score($a);
            });

            return ['type' => 'draft', 'payload' => ['character_id' => $offers[0]]];
        }
        if ($state['phase'] === 'deployment' && ! in_array(self::ID, $state['ready'], true)) {
            foreach ($state['units'] as $unit) {
                if ($unit['owner_id'] !== self::ID) {
                    continue;
                }
                $front = CharacterCatalog::get($unit['character_id'])['range'] <= 2;
                if ($front && $unit['y'] === 0) {
                    return ['type' => 'deploy', 'payload' => ['unit_id' => $unit['id'], 'x' => $unit['x'], 'y' => 1]];
                }
            }

            return ['type' => 'ready', 'payload' => []];
        }
        if ($state['phase'] !== 'battle' || $state['turn_player_id'] !== self::ID) {
            return null;
        }
        if ($state['acted']) {
            return ['type' => 'end_turn', 'payload' => []];
        }

        $best = ['type' => 'end_turn', 'payload' => []];
        $bestScore = -INF;
        foreach ($state['units'] as $unit) {
            if ($unit['owner_id'] !== self::ID || $unit['hp'] <= 0 || ($unit['statuses']['stun'] ?? 0) > 0
                || ($state['active_unit_id'] && $state['active_unit_id'] !== $unit['id'])
                || ($unit['recovery'] > 0 && $state['active_unit_id'] !== $unit['id'])) {
                continue;
            }
            $positions = [['state' => $state, 'move' => null]];
            if (! $state['moved'] && ! ($unit['statuses']['root'] ?? 0)) {
                $range = CharacterCatalog::get($unit['character_id'])['move'];
                for ($x = 0; $x < 8; $x++) {
                    for ($y = 0; $y < 8; $y++) {
                        if (abs($x - $unit['x']) + abs($y - $unit['y']) > $range) {
                            continue;
                        }
                        $move = ['type' => 'move', 'payload' => ['unit_id' => $unit['id'], 'x' => $x, 'y' => $y]];
                        if ($next = $this->simulate($state, $move)) {
                            $positions[] = ['state' => $next, 'move' => $move];
                        }
                    }
                }
            }
            foreach ($positions as $position) {
                $next = $position['state'];
                $movedUnit = collect($next['units'])->firstWhere('id', $unit['id']);
                $positional = $this->positionScore($next, $movedUnit);
                // Moving into range is worthwhile even when no attack is available yet.
                $candidates = [['command' => null, 'score' => 0.0]];
                foreach (['attack', 'skill'] as $type) {
                    foreach ($next['units'] as $target) {
                        $command = ['type' => $type, 'payload' => ['unit_id' => $unit['id'], 'target_id' => $target['id']]];
                        if ($result = $this->simulate($next, $command)) {
                            $candidates[] = ['command' => $command, 'score' => $this->material($result) - $this->material($next)
                                - ($type === 'skill' ? CharacterCatalog::get($unit['character_id'])['skill']['cost'] * 0.12 : 0)];
                        }
                    }
                }
                foreach ($candidates as $candidate) {
                    $command = $position['move'] ?? $candidate['command'];
                    if (! $command) {
                        continue;
                    }
                    $score = $candidate['score'] * 4 + $positional - ($position['move'] ? 0.5 : 0);
                    if ($score > $bestScore) {
                        $bestScore = $score;
                        $best = $command;
                    }
                }
            }
        }

        // Do not waste a spell on an uninjured ally just to activate something.
        if ($best['type'] === 'skill') {
            $result = $this->simulate($state, $best);
            if (! $result || $this->material($result) <= $this->material($state)) {
                return ['type' => 'end_turn', 'payload' => []];
            }
        }

        return $best;
    }

    private function simulate(array $state, array $command): ?array
    {
        try {
            return $this->simulation->apply($state, self::ID, $command['type'], $command['payload']);
        } catch (GameRuleException) {
            return null;
        }
    }

    private function material(array $state): float
    {
        $value = 0;
        foreach ($state['units'] as $unit) {
            $sign = $unit['owner_id'] === self::ID ? 1 : -1;
            $value += $sign * ($unit['hp'] + ($unit['hp'] > 0 ? 55 : 0));
            if ($unit['hp'] > 0) {
                $value += $sign * (min(20, $unit['mana']) * 0.15
                    + ($unit['statuses']['ward'] ?? 0) * 3
                    - ($unit['statuses']['burn'] ?? 0) * 6
                    - ($unit['statuses']['stun'] ?? 0) * 12
                    - ($unit['statuses']['root'] ?? 0) * 3);
            }
        }

        return $value;
    }

    private function positionScore(array $state, array $unit): float
    {
        $enemies = array_filter($state['units'], fn ($u) => $u['owner_id'] !== self::ID && $u['hp'] > 0);
        if (! $enemies) {
            return 0;
        }
        $distance = min(array_map(fn ($u) => abs($u['x'] - $unit['x']) + abs($u['y'] - $unit['y']), $enemies));
        $range = CharacterCatalog::get($unit['character_id'])['range'];
        $score = -max(0, $distance - $range) * 8;
        foreach ($enemies as $enemy) {
            if (abs($enemy['x'] - $unit['x']) + abs($enemy['y'] - $unit['y']) <= CharacterCatalog::get($enemy['character_id'])['range']) {
                $score -= $unit['hp'] < $unit['max_hp'] / 3 ? 12 : 2;
            }
        }

        return $score;
    }
}
