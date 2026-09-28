<?php

namespace App\Game;

final class GameEngine
{
    private $random;

    public function __construct(?callable $random = null)
    {
        $this->random = $random ?? random_int(...);
    }

    public function create(int $hostId, string $hostName, array $loadout = []): array
    {
        $loadout = array_values($loadout);

        return ['phase' => 'lobby', 'players' => [['id' => $hostId, 'name' => $hostName]], 'host_id' => $hostId, 'turn_player_id' => null, 'turn_number' => 0, 'draft_picks' => [$hostId => []], 'offers' => [$hostId => []], 'pool' => [$hostId => $this->pool($loadout)], 'loadouts' => [$hostId => $loadout], 'units' => [], 'ready' => [], 'active_unit_id' => null, 'moved' => false, 'acted' => false, 'winner_id' => null, 'log' => [], 'reward_candidates' => [$hostId => []]];
    }

    public function apply(array $s, int $actorId, string $type, array $payload = []): array
    {
        $s['events'] = [];
        if ($s['phase'] === 'finished') {
            throw new GameRuleException('This match has finished.');
        }
        if ($type === 'join') {
            $this->require($s['phase'] === 'lobby' && count($s['players']) === 1, 'This lobby is full.');
            $this->require($actorId !== $s['host_id'] && ($payload['id'] ?? null) === $actorId, 'You cannot join your own match.');
            $this->require(is_string($payload['name'] ?? null) && trim($payload['name']) !== '', 'A player name is required.');
            $loadout = $payload['loadout'] ?? [];
            $this->require(is_array($loadout), 'Invalid loadout.');
            $loadout = array_values($loadout);
            $s['players'][] = ['id' => $actorId, 'name' => $payload['name']];
            $s['loadouts'][$actorId] = $loadout;
            $s['pool'][$actorId] = $this->pool($loadout);
            $s['draft_picks'][$actorId] = [];
            $s['reward_candidates'][$actorId] = [];
            $s['phase'] = 'draft';
            $s['turn_player_id'] = $s['host_id'];
            foreach ($s['players'] as $p) {
                $s['offers'][$p['id']] = $this->offers($s, $p['id']);
            }
            $this->log($s, $payload['name'].' joined. Draft six characters each.');

            return $s;
        }
        $this->require(in_array($actorId, array_column($s['players'], 'id'), true), 'You are not a participant.');
        if ($type === 'resign') {
            $s['winner_id'] = $this->opponent($s, $actorId);
            $s['phase'] = 'finished';
            $s['finish_reason'] = 'resign';
            $this->log($s, Chronicle::fill(Chronicle::RESIGNED, ['name' => Chronicle::playerName($s, $actorId)]));
            $s['deciding'] = DecidingMoment::resolve($s);
            $this->emit($s, 'game_over', ['winner_id' => $s['winner_id']]);

            return $s;
        }
        if ($type === 'draft') {
            $this->require($s['phase'] === 'draft', 'Drafting is not available.');
            $this->turn($s, $actorId);
            $id = $payload['character_id'] ?? null;
            $this->require(is_string($id) && in_array($id, $s['offers'][$actorId], true), 'Choose a character from your current offers.');
            $this->require(! in_array($id, $s['draft_picks'][$actorId], true) && count($s['draft_picks'][$actorId]) < 6, 'This character was already drafted.');
            $s['draft_picks'][$actorId][] = $id;
            if (! CharacterCatalog::get($id)['standard'] && ! in_array($id, $s['loadouts'][$actorId], true)) {
                $s['reward_candidates'][$actorId][] = $id;
            }
            $s['offers'][$actorId] = $this->offers($s, $actorId);
            $this->log($s, Chronicle::fill(Chronicle::DRAFTED, [
                'name' => Chronicle::playerName($s, $actorId),
                'champion' => CharacterCatalog::get($id)['name'],
            ]));
            $s['turn_player_id'] = $this->opponent($s, $actorId);
            if (count($s['draft_picks'][$s['host_id']]) === 6 && count($s['draft_picks'][$actorId]) === 6 && array_sum(array_map('count', $s['draft_picks'])) === 12) {
                $s['phase'] = 'deployment';
                $s['turn_player_id'] = null;
                foreach ($s['players'] as $p) {
                    foreach ($s['draft_picks'][$p['id']] as $n => $cid) {
                        $c = CharacterCatalog::get($cid);
                        $host = $p['id'] === $s['host_id'];
                        $s['units'][] = ['id' => $p['id'].'-'.$cid, 'character_id' => $cid, 'owner_id' => $p['id'], 'x' => $n + 1, 'y' => $host ? 7 : 0, 'hp' => $c['hp'], 'max_hp' => $c['hp'], 'mana' => $c['mana'], 'max_mana' => $c['mana'], 'facing' => $host ? 'north' : 'south', 'recovery' => 0, 'cooldown' => 0, 'statuses' => []];
                    }
                }
            }

            return $s;
        }
        if ($type === 'deploy') {
            $this->require($s['phase'] === 'deployment', 'Deployment is closed.');
            $this->require(! in_array($actorId, $s['ready'], true), 'Your deployment is locked.');
            $i = $this->unit($s, $payload['unit_id'] ?? null, $actorId);
            [$x,$y] = $this->tile($payload);
            $this->require(in_array($y, $actorId === $s['host_id'] ? [6, 7] : [0, 1], true), 'Deploy within your two home rows.');
            foreach ($s['units'] as $j => $u) {
                if ($j !== $i && $u['x'] === $x && $u['y'] === $y) {
                    $this->require($u['owner_id'] === $actorId, 'That tile is occupied.');
                    $s['units'][$j]['x'] = $s['units'][$i]['x'];
                    $s['units'][$j]['y'] = $s['units'][$i]['y'];
                }
            }
            $s['units'][$i]['x'] = $x;
            $s['units'][$i]['y'] = $y;

            return $s;
        }
        if ($type === 'ready') {
            $this->require($s['phase'] === 'deployment', 'You cannot ready now.');
            if (! in_array($actorId, $s['ready'], true)) {
                $s['ready'][] = $actorId;
            }
            if (count($s['ready']) === 2) {
                $s['phase'] = 'battle';
                $s['turn_player_id'] = $s['host_id'];
                $s['turn_number'] = 1;
                $this->log($s, 'Battle begins.');
                $this->emit($s, 'turn_start', ['player_id' => $s['host_id'], 'turn_number' => 1]);
            }

            return $s;
        }
        $this->require($s['phase'] === 'battle', 'Battle has not begun.');
        $this->turn($s, $actorId);
        if ($type === 'end_turn') {
            $this->endTurn($s, $actorId);

            return $s;
        }
        $this->require(in_array($type, ['move', 'attack', 'skill', 'face'], true), 'Unknown action.');
        $i = $this->unit($s, $payload['unit_id'] ?? null, $actorId);
        $u = $s['units'][$i];
        $c = CharacterCatalog::get($u['character_id']);
        $this->require($u['recovery'] === 0 || $s['active_unit_id'] === $u['id'], 'This character is recovering.');
        $this->require(($u['statuses']['stun'] ?? 0) === 0, 'This character is stunned.');
        $this->require($s['active_unit_id'] === null || $s['active_unit_id'] === $u['id'], 'Only one character can activate per turn.');
        if ($type === 'face') {
            $f = $payload['facing'] ?? null;
            $this->require(in_array($f, ['north', 'east', 'south', 'west'], true), 'Invalid facing.');
            $from = $s['units'][$i]['facing'];
            $s['units'][$i]['facing'] = $f;
            $this->emit($s, 'face', ['unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'from' => $from, 'to' => $f]);
        } elseif ($type === 'move') {
            $this->require(! $s['moved'], 'You already moved this turn.');
            $this->require(($u['statuses']['root'] ?? 0) === 0, 'This character is rooted.');
            [$x,$y] = $this->tile($payload);
            $this->require($this->reachable($s, $u, $x, $y, $c['move']), 'Destination is blocked or beyond movement range.');
            $from = [$u['x'], $u['y']];
            $path = $this->path($s, $u, $x, $y, $c['move']) ?? [$from, [$x, $y]];
            $s['units'][$i]['facing'] = $this->direction($x - $u['x'], $y - $u['y']);
            $s['units'][$i]['x'] = $x;
            $s['units'][$i]['y'] = $y;
            $s['moved'] = true;
            $this->log($s, Chronicle::fill(Chronicle::MOVED, ['name' => Chronicle::unitName($s, $u)]));
            $this->emit($s, 'move', ['unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'from' => $from, 'to' => [$x, $y], 'path' => $path]);
        } else {
            $this->require(! $s['acted'], 'You already attacked or cast this turn.');
            $skill = $type === 'skill';
            $targetType = $skill ? $c['skill']['target'] : 'enemy';
            $j = $this->unit($s, $targetType === 'self' ? $u['id'] : ($payload['target_id'] ?? null));
            $t = $s['units'][$j];
            $this->require($targetType === 'enemy' ? $t['owner_id'] !== $actorId : $t['owner_id'] === $actorId, 'Invalid target team.');
            $this->require($this->distance($u, $t) <= ($skill ? $c['skill']['range'] : $c['range']), 'Target is out of range.');
            if ($skill) {
                $this->require($u['cooldown'] === 0, 'This skill is on cooldown.');
                $this->require($u['mana'] >= $c['skill']['cost'], 'Not enough mana.');
                $s['units'][$i]['mana'] -= $c['skill']['cost'];
                $s['units'][$i]['cooldown'] = $c['skill']['cooldown'] + 1;
                $this->cast($s, $i, $j);
            } else {
                $this->damage($s, $i, $j, $c['attack'], false, true);
            }
            $s['acted'] = true;
            $s['units'][$i]['recovery'] = ($skill && $c['id'] === 'arcanist' ? 2 : 1) + 1;
            $this->checkWinner($s);
        }
        $s['active_unit_id'] = $u['id'];

        return $s;
    }

    /** Legal battle actions for the turn player, dry-run through apply() so the engine stays the only rules source. */
    public function options(array $s, int $viewerId): ?array
    {
        if (($s['phase'] ?? null) !== 'battle' || ($s['turn_player_id'] ?? null) !== $viewerId) {
            return null;
        }
        $oracle = new self(fn (int $min, int $max) => $max === 100 ? 50 : $min);
        $units = [];
        foreach ($s['units'] as $unit) {
            if ($unit['owner_id'] !== $viewerId || $unit['hp'] <= 0) {
                continue;
            }
            $units[$unit['id']] = $this->describeUnit($oracle, $s, $viewerId, $unit);
        }

        return ['version' => (int) ($s['version'] ?? 0), 'units' => $units];
    }

    private function cast(array &$s, int $i, int $j): void
    {
        $id = $s['units'][$i]['character_id'];
        $c = CharacterCatalog::get($id);
        $this->log($s, Chronicle::fill(Chronicle::SKILL, [
            'name' => Chronicle::unitName($s, $s['units'][$i]),
            'skill' => $c['skill']['name'],
        ]));
        $s['casting_skill'] = $c['skill']['name'];
        $amount = $this->skillAmount($s, $i, $j);
        $targetIds = [];
        $amounts = [];
        $statuses = [];
        switch ($id) {
            case 'warden': $s['units'][$j]['statuses']['ward'] = 2;
                $targetIds[] = $s['units'][$j]['id'];
                $statuses[$s['units'][$j]['id']] = ['ward' => 2];
                break;
            case 'cleric':
                $before = $s['units'][$j]['hp'];
                $this->heal($s, $j, $amount);
                $targetIds[] = $s['units'][$j]['id'];
                $amounts[$s['units'][$j]['id']] = $s['units'][$j]['hp'] - $before;
                break;
            case 'druid':
                $before = $s['units'][$j]['hp'];
                $this->heal($s, $j, $amount);
                foreach (['burn', 'root', 'stun'] as $status) {
                    unset($s['units'][$j]['statuses'][$status]);
                }
                $targetIds[] = $s['units'][$j]['id'];
                $amounts[$s['units'][$j]['id']] = $s['units'][$j]['hp'] - $before;
                break;
            case 'herald':
                foreach ($s['units'] as $k => $u) {
                    if ($u['owner_id'] === $s['units'][$i]['owner_id'] && $u['hp'] > 0) {
                        $before = $s['units'][$k]['hp'];
                        $this->heal($s, $k, $amount);
                        $s['units'][$k]['mana'] = min($u['max_mana'], $s['units'][$k]['mana'] + $amount);
                        $targetIds[] = $u['id'];
                        $amounts[$u['id']] = $s['units'][$k]['hp'] - $before;
                    }
                } break;
            default:
                $dealt = $this->damage($s, $i, $j, $amount, $this->skillPierces($id), false);
                $targetIds[] = $s['units'][$j]['id'];
                $amounts[$s['units'][$j]['id']] = $dealt;
                if ($dealt > 0 && $s['units'][$j]['hp'] > 0) {
                    if ($id === 'knight') {
                        $s['units'][$j]['statuses']['stun'] = 1;
                        $statuses[$s['units'][$j]['id']]['stun'] = 1;
                    }
                    if (in_array($id, ['pikeman', 'frostweaver'], true)) {
                        $s['units'][$j]['statuses']['root'] = 2;
                        $statuses[$s['units'][$j]['id']]['root'] = 2;
                    }
                    if ($id === 'pyromancer') {
                        $s['units'][$j]['statuses']['burn'] = 2;
                        $s['units'][$j]['burn_source'] = $s['units'][$i]['owner_id'];
                        $statuses[$s['units'][$j]['id']]['burn'] = 2;
                    }
                }
                if ($id === 'revenant') {
                    $this->heal($s, $i, $dealt);
                    $amounts[$s['units'][$i]['id']] = $dealt;
                }
        }
        $this->emit($s, 'skill', [
            'unit_id' => $s['units'][$i]['id'],
            'owner_id' => $s['units'][$i]['owner_id'],
            'skill' => $c['skill']['name'],
            'target_ids' => $targetIds,
            'amounts' => $amounts,
            'statuses' => $statuses,
        ]);
        unset($s['casting_skill']);
    }

    private function damage(array &$s, int $i, int $j, int $amount, bool $pierce, bool $roll): int
    {
        $u = $s['units'][$i];
        $t = $s['units'][$j];
        $c = CharacterCatalog::get($u['character_id']);
        $d = CharacterCatalog::get($t['character_id']);
        $factor = $this->blockFactor($u, $t);
        $side = $factor === 1.0 ? 'front' : ($factor === 0.0 ? 'rear' : 'side');
        $chance = (int) floor($d['block'] * $factor);
        if ($roll) {
            $hit = ($this->random)(1, 100);
            if ($hit > $c['accuracy']) {
                $this->log($s, Chronicle::fill(Chronicle::MISS, [
                    'name' => Chronicle::unitName($s, $u),
                    'chance' => $c['accuracy'],
                ]));
                $this->emit($s, 'attack', [
                    'unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'target_id' => $t['id'], 'target_owner_id' => $t['owner_id'],
                    'side' => $side, 'roll' => ['accuracy' => $c['accuracy'], 'hit_roll' => $hit, 'block_chance' => $chance, 'block_roll' => null],
                    'outcome' => 'miss', 'damage' => 0,
                ]);

                return 0;
            }
            $chance = $this->blockChance($s, $i, $j);
            $block = ($this->random)(1, 100);
            if ($block <= $chance) {
                $this->log($s, Chronicle::fill(Chronicle::BLOCKED, [
                    'name' => Chronicle::unitName($s, $t),
                    'chance' => $chance,
                ]));
                $this->emit($s, 'attack', [
                    'unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'target_id' => $t['id'], 'target_owner_id' => $t['owner_id'],
                    'side' => $side, 'roll' => ['accuracy' => $c['accuracy'], 'hit_roll' => $hit, 'block_chance' => $chance, 'block_roll' => $block],
                    'outcome' => 'block', 'damage' => 0,
                ]);

                return 0;
            }
            $this->log($s, Chronicle::fill(Chronicle::HIT, [
                'name' => Chronicle::unitName($s, $u),
                'chance' => $c['accuracy'],
            ]));
        }
        $damage = $this->resolveDamage($s, $i, $j, $amount, $pierce);
        $s['units'][$j]['hp'] -= $damage;
        $this->log($s, Chronicle::fill(Chronicle::DAMAGE, [
            'attacker' => Chronicle::unitName($s, $u),
            'defender' => Chronicle::unitName($s, $t),
            'damage' => $damage,
        ]));
        DecidingMoment::noteHit($s, $u, $t, $damage);
        if ($roll) {
            $this->emit($s, 'attack', [
                'unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'target_id' => $t['id'], 'target_owner_id' => $t['owner_id'],
                'side' => $side, 'roll' => ['accuracy' => $c['accuracy'], 'hit_roll' => $hit, 'block_chance' => $chance, 'block_roll' => $block],
                'outcome' => 'hit', 'damage' => $damage,
            ]);
        }
        if ($s['units'][$j]['hp'] === 0) {
            $this->death($s, $j, $u['owner_id']);
            DecidingMoment::noteKill($s, $u, $t, $roll ? $side : null, $s['casting_skill'] ?? null);
        }

        return $damage;
    }

    private function death(array &$s, int $j, int $killer): void
    {
        $this->log($s, Chronicle::fill(Chronicle::DEFEATED, ['name' => Chronicle::unitName($s, $s['units'][$j])]));
        $this->emit($s, 'death', ['unit_id' => $s['units'][$j]['id'], 'owner_id' => $s['units'][$j]['owner_id'], 'by' => $killer]);
        if ($s['units'][$j]['character_id'] === 'herald') {
            foreach ($s['units'] as $k => $u) {
                if ($u['owner_id'] === $killer && $u['hp'] > 0) {
                    $s['units'][$k]['mana'] = min($u['max_mana'], $u['mana'] + 12);
                }
            }
            $this->log($s, 'The fallen banner grants the opposing team 12 mana.');
        }
    }

    private function endTurn(array &$s, int $actorId): void
    {
        // Counters tick at the END of their owner's turn. Recovery is assigned +1
        // to include the current activation; hostile statuses retain their full next turn.
        foreach ($s['units'] as $i => $u) {
            if ($u['owner_id'] === $actorId && $u['hp'] > 0) {
                $s['units'][$i]['recovery'] = max(0, $u['recovery'] - 1);
                $s['units'][$i]['cooldown'] = max(0, $u['cooldown'] - 1);
                $s['units'][$i]['mana'] = min($u['max_mana'], $u['mana'] + 5);
                if (($u['statuses']['burn'] ?? 0) > 0) {
                    $burn = StatusCatalog::amount('burn');
                    $s['units'][$i]['hp'] = max(0, $u['hp'] - $burn);
                    $this->log($s, Chronicle::fill(Chronicle::BURN, [
                        'name' => Chronicle::unitName($s, $u),
                        'amount' => $burn,
                    ]));
                    $this->emit($s, 'status_tick', ['unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'status' => 'burn', 'amount' => $burn]);
                    if ($s['units'][$i]['hp'] === 0) {
                        $killerId = $u['burn_source'] ?? $this->opponent($s, $actorId);
                        $this->death($s, $i, $killerId);
                        $killer = $this->livingOwned($s, (int) $killerId);
                        if ($killer) {
                            DecidingMoment::noteKill($s, $killer, $u, null, null);
                        } else {
                            $s['story']['last_kill'] = [
                                'attacker' => Chronicle::playerName($s, $killerId),
                                'defender' => Chronicle::unitName($s, $u),
                                'side' => null,
                                'skill' => null,
                            ];
                        }
                    }
                }
                foreach ($u['statuses'] as $key => $duration) {
                    if ($duration <= 1) {
                        unset($s['units'][$i]['statuses'][$key]);
                        $this->emit($s, 'status_tick', ['unit_id' => $u['id'], 'owner_id' => $u['owner_id'], 'status' => $key]);
                    } else {
                        $s['units'][$i]['statuses'][$key] = $duration - 1;
                    }
                }
            }
        }
        $this->checkWinner($s);
        if ($s['phase'] !== 'finished') {
            $s['turn_player_id'] = $this->opponent($s, $actorId);
            $s['turn_number']++;
            $this->emit($s, 'turn_start', ['player_id' => $s['turn_player_id'], 'turn_number' => $s['turn_number']]);
        }
        $s['active_unit_id'] = null;
        $s['moved'] = false;
        $s['acted'] = false;
    }

    private function checkWinner(array &$s): void
    {
        foreach ($s['players'] as $p) {
            $living = array_filter($s['units'], fn ($u) => $u['owner_id'] === $p['id'] && $u['hp'] > 0);
            if (! $living) {
                $s['phase'] = 'finished';
                $s['winner_id'] = $this->opponent($s, $p['id']);
                $s['turn_player_id'] = null;
                $s['finish_reason'] = 'elimination';
                $this->log($s, Chronicle::fill(Chronicle::ELIMINATION, [
                    'name' => Chronicle::playerName($s, $s['winner_id']),
                ]));
                $s['deciding'] = DecidingMoment::resolve($s);
                $this->emit($s, 'game_over', ['winner_id' => $s['winner_id']]);

                return;
            }
        }
    }

    private function heal(array &$s, int $j, int $hp): void
    {
        $s['units'][$j]['hp'] = min($s['units'][$j]['max_hp'], $s['units'][$j]['hp'] + $hp);
    }

    private function turn(array $s, int $id): void
    {
        $this->require($s['turn_player_id'] === $id, 'It is not your turn.');
    }

    private function opponent(array $s, int $id): ?int
    {
        foreach ($s['players'] as $p) {
            if ($p['id'] !== $id) {
                return $p['id'];
            }
        }

        return null;
    }

    private function livingOwned(array $s, int $ownerId): ?array
    {
        foreach ($s['units'] as $unit) {
            if ($unit['owner_id'] === $ownerId && $unit['hp'] > 0) {
                return $unit;
            }
        }

        return null;
    }

    private function require(bool $test, string $message): void
    {
        if (! $test) {
            throw new GameRuleException($message);
        }
    }

    private function unit(array $s, mixed $id, ?int $owner = null): int
    {
        $this->require(is_string($id), 'Select a character.');
        foreach ($s['units'] as $i => $u) {
            if ($u['id'] === $id) {
                $this->require($u['hp'] > 0, 'This character is defeated.');
                $this->require($owner === null || $u['owner_id'] === $owner, 'You do not control that character.');

                return $i;
            }
        }
        throw new GameRuleException('Character not found.');
    }

    private function tile(array $p): array
    {
        $x = $p['x'] ?? null;
        $y = $p['y'] ?? null;
        $this->require(is_int($x) && is_int($y) && $x >= 0 && $x < 8 && $y >= 0 && $y < 8, 'Choose a valid board tile.');

        return [$x, $y];
    }

    private function distance(array $a, array $b): int
    {
        return abs($a['x'] - $b['x']) + abs($a['y'] - $b['y']);
    }

    private function direction(int $x, int $y): string
    {
        return abs($x) > abs($y) ? ($x > 0 ? 'east' : 'west') : ($y > 0 ? 'south' : 'north');
    }

    private function blockFactor(array $attacker, array $defender): float
    {
        $from = $this->direction($attacker['x'] - $defender['x'], $attacker['y'] - $defender['y']);
        if ($from === $defender['facing']) {
            return 1.0;
        }
        $opposite = ['north' => 'south', 'south' => 'north', 'east' => 'west', 'west' => 'east'];

        return $from === $opposite[$defender['facing']] ? 0.0 : 0.5;
    }

    private function reachable(array $s, array $u, int $x, int $y, int $range): bool
    {
        return $this->path($s, $u, $x, $y, $range) !== null;
    }

    /** @return list<array{0:int,1:int}>|null */
    private function path(array $s, array $u, int $x, int $y, int $range): ?array
    {
        if ($x === $u['x'] && $y === $u['y']) {
            return null;
        }
        $blocked = [];
        foreach ($s['units'] as $v) {
            if ($v['hp'] > 0 && $v['id'] !== $u['id']) {
                $blocked[$v['x'].','.$v['y']] = true;
            }
        }
        $queue = [[$u['x'], $u['y'], 0]];
        $seen = [$u['x'].','.$u['y'] => true];
        $from = [];
        for ($i = 0; $i < count($queue); $i++) {
            [$cx,$cy,$d] = $queue[$i];
            if ($cx === $x && $cy === $y) {
                $trail = [[$cx, $cy]];
                $key = $cx.','.$cy;
                while (isset($from[$key])) {
                    [$px, $py] = $from[$key];
                    array_unshift($trail, [$px, $py]);
                    $key = $px.','.$py;
                }

                return $trail;
            }
            if ($d === $range) {
                continue;
            }
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx,$dy]) {
                $nx = $cx + $dx;
                $ny = $cy + $dy;
                $key = $nx.','.$ny;
                if ($nx < 0 || $nx > 7 || $ny < 0 || $ny > 7 || isset($blocked[$key]) || isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $from[$key] = [$cx, $cy];
                $queue[] = [$nx, $ny, $d + 1];
            }
        }

        return null;
    }

    private function describeUnit(self $oracle, array $s, int $viewerId, array $unit): array
    {
        $catalog = CharacterCatalog::get($unit['character_id']);
        $activation = $this->probe($oracle, $s, $viewerId, 'face', ['unit_id' => $unit['id'], 'facing' => $unit['facing']]);
        $reasonCode = $this->activationReasonCode($activation);
        $spent = $this->unitIsSpent($s, $unit);
        $entry = [
            'can_activate' => $activation === null,
            'reason' => $activation,
            'reason_code' => $reasonCode,
            'spent' => $spent,
            'spent_reason' => $spent ? $this->spentReason($s, $unit) : null,
            'moves' => [],
            'attack' => [],
            'skill' => ['usable' => false, 'reason' => $activation, 'cost' => $catalog['skill']['cost'], 'targets' => []],
            'facing' => [],
        ];
        if ($activation !== null) {
            return $entry;
        }
        $entry['facing'] = ['north', 'east', 'south', 'west'];
        for ($x = 0; $x < 8; $x++) {
            for ($y = 0; $y < 8; $y++) {
                if ($this->probe($oracle, $s, $viewerId, 'move', ['unit_id' => $unit['id'], 'x' => $x, 'y' => $y]) !== null) {
                    continue;
                }
                $entry['moves'][] = ['x' => $x, 'y' => $y, 'path' => $this->path($s, $unit, $x, $y, $catalog['move'])];
            }
        }
        foreach ($s['units'] as $target) {
            if ($target['hp'] <= 0 || $this->probe($oracle, $s, $viewerId, 'attack', ['unit_id' => $unit['id'], 'target_id' => $target['id']]) !== null) {
                continue;
            }
            $entry['attack'][] = $this->attackPreview($s, $unit, $target);
        }
        $skillReason = null;
        foreach ($this->skillCandidates($s, $unit, $catalog['skill']['target']) as $target) {
            $error = $this->probe($oracle, $s, $viewerId, 'skill', ['unit_id' => $unit['id'], 'target_id' => $target['id']]);
            if ($error !== null) {
                $skillReason ??= $error;

                continue;
            }
            $entry['skill']['targets'][] = $this->skillPreview($s, $unit, $target);
        }
        if ($entry['skill']['targets']) {
            $entry['skill']['usable'] = true;
            $entry['skill']['reason'] = null;
        } else {
            $entry['skill']['reason'] = $skillReason;
        }

        return $entry;
    }

    private function activationReasonCode(?string $reason): ?string
    {
        return match ($reason) {
            null => null,
            'This character is recovering.' => 'recovering',
            'This character is stunned.' => 'stunned',
            'Only one character can activate per turn.' => 'other_active',
            default => 'blocked',
        };
    }

    private function unitIsSpent(array $s, array $unit): bool
    {
        if (($unit['recovery'] ?? 0) > 0) {
            return true;
        }
        if (($unit['statuses']['stun'] ?? 0) > 0) {
            return true;
        }

        return ($s['active_unit_id'] ?? null) === $unit['id'] && ($s['acted'] ?? false);
    }

    private function spentReason(array $s, array $unit): string
    {
        if (($unit['statuses']['stun'] ?? 0) > 0) {
            return 'This character is stunned.';
        }
        if (($unit['recovery'] ?? 0) > 0) {
            return 'This character is recovering.';
        }

        return 'This character has already acted.';
    }

    private function probe(self $oracle, array $s, int $actorId, string $type, array $payload): ?string
    {
        try {
            $oracle->apply($s, $actorId, $type, $payload);

            return null;
        } catch (GameRuleException $e) {
            return $e->getMessage();
        }
    }

    private function attackPreview(array $s, array $attacker, array $defender): array
    {
        [$i, $j] = [$this->unitIndex($s, $attacker['id']), $this->unitIndex($s, $defender['id'])];
        $hit = CharacterCatalog::get($attacker['character_id'])['accuracy'];
        $block = $this->blockChance($s, $i, $j);
        $factor = $this->blockFactor($attacker, $defender);

        $damage = $this->resolveDamage($s, $i, $j, CharacterCatalog::get($attacker['character_id'])['attack'], false);
        $catalogBlock = CharacterCatalog::get($defender['character_id'])['block'];

        return [
            'target_id' => $defender['id'],
            'hit_chance' => $hit,
            'block_side' => $factor === 1.0 ? 'front' : ($factor === 0.0 ? 'rear' : 'side'),
            'block_chance' => $block,
            'damage_on_hit' => $damage,
            'land_chance' => (int) round($hit * (1 - $block / 100)),
            'lethal' => $damage >= $defender['hp'],
            'block_chances' => [
                'front' => (int) floor($catalogBlock * 1.0),
                'side' => (int) floor($catalogBlock * 0.5),
                'rear' => 0,
            ],
        ];
    }

    private function skillPreview(array $s, array $unit, array $target): array
    {
        $i = $this->unitIndex($s, $unit['id']);
        $j = $this->unitIndex($s, $target['id']);
        $amount = $this->skillAmount($s, $i, $j);
        $effect = match ($unit['character_id']) {
            'warden' => 'ward',
            'cleric', 'druid', 'herald' => 'heal',
            default => 'damage',
        };
        $preview = [
            'target_id' => $target['id'],
            'effect' => $effect,
            'amount' => $amount,
            'always_hits' => true,
            'land_chance' => 100,
            'lethal' => false,
        ];
        if ($effect === 'damage') {
            $damage = $this->resolveDamage($s, $i, $j, $amount, $this->skillPierces($unit['character_id']));
            $preview['damage_on_hit'] = $damage;
            $preview['lethal'] = $damage >= $target['hp'];
        }

        return $preview;
    }

    private function skillPierces(string $id): bool
    {
        return in_array($id, ['ranger', 'arcanist', 'rogue', 'revenant'], true);
    }

    private function resolveDamage(array $s, int $i, int $j, int $amount, bool $pierce): int
    {
        return min($s['units'][$j]['hp'], max(1, $amount - ($pierce ? 0 : $this->armorFor($s, $j))));
    }

    private function skillCandidates(array $s, array $unit, string $targetType): array
    {
        return array_values(array_filter($s['units'], fn ($target) => $target['hp'] > 0 && match ($targetType) {
            'enemy' => $target['owner_id'] !== $unit['owner_id'],
            'ally' => $target['owner_id'] === $unit['owner_id'],
            'self' => $target['id'] === $unit['id'],
            default => false,
        }));
    }

    private function unitIndex(array $s, string $id): int
    {
        foreach ($s['units'] as $i => $unit) {
            if ($unit['id'] === $id) {
                return $i;
            }
        }

        throw new GameRuleException('Character not found.');
    }

    private function blockChance(array $s, int $i, int $j): int
    {
        $defender = CharacterCatalog::get($s['units'][$j]['character_id']);

        return (int) floor($defender['block'] * $this->blockFactor($s['units'][$i], $s['units'][$j]));
    }

    private function armorFor(array $s, int $j): int
    {
        $target = $s['units'][$j];
        $armor = CharacterCatalog::get($target['character_id'])['armor'] + (($target['statuses']['ward'] ?? 0) > 0 ? StatusCatalog::amount('ward') : 0);
        foreach ($s['units'] as $ally) {
            if ($ally['character_id'] === 'herald' && $ally['hp'] > 0 && $ally['owner_id'] === $target['owner_id'] && $this->distance($ally, $target) <= 2) {
                $armor += 4;
                break;
            }
        }

        return $armor;
    }

    private function skillAmount(array $s, int $i, int $j): int
    {
        $id = $s['units'][$i]['character_id'];

        return match ($id) {
            'ranger' => 34,
            'knight' => 22,
            'arcanist' => 39,
            'rogue' => $this->blockFactor($s['units'][$i], $s['units'][$j]) === 0.0 ? 52 : 32,
            'pikeman' => 26,
            'pyromancer' => 28,
            'frostweaver' => 23,
            'revenant' => 31,
            'cleric' => 38,
            'druid' => 25,
            'herald' => 12,
            'warden' => 12,
        };
    }

    private function emit(array &$s, string $type, array $payload = []): void
    {
        $s['events'][] = ['type' => $type] + $payload;
    }

    public function excludeFromPool(array $s, int $playerId, array $excluded): array
    {
        $s['pool'][$playerId] = array_values(array_diff($s['pool'][$playerId] ?? [], $excluded));
        $s['offers'][$playerId] = $this->offers($s, $playerId);

        return $s;
    }

    private function pool(array $loadout): array
    {
        $this->require(count($loadout) <= 4 && count(array_unique($loadout, SORT_REGULAR)) === count($loadout), 'Choose up to four distinct specialist cards.');
        foreach ($loadout as $id) {
            $this->require(is_string($id) && isset(CharacterCatalog::all()[$id]) && ! CharacterCatalog::get($id)['standard'], 'Loadout must contain specialist cards.');
        }

        return array_values(array_unique(array_merge($loadout, array_keys(CharacterCatalog::all()))));
    }

    private function offers(array $s, int $id): array
    {
        $available = array_values(array_diff($s['pool'][$id], $s['draft_picks'][$id]));
        if (($s['mode'] ?? 'multiplayer') === 'practice' && $id === $s['host_id']) {
            return $available;
        }
        $offers = [];
        // A chosen specialist is guaranteed in the first offer; all players retain the same full pool.
        if (! $s['draft_picks'][$id] && $s['loadouts'][$id]) {
            $offers[] = $s['loadouts'][$id][0];
            $available = array_values(array_diff($available, $offers));
        }
        while (count($offers) < 3 && $available) {
            // Every character keeps one ticket; preferred specialists receive a second.
            // Remove the chosen character entirely so an offer never contains duplicates.
            $tickets = [];
            foreach ($available as $index => $characterId) {
                $tickets[] = $index;
                if (in_array($characterId, $s['loadouts'][$id], true)) {
                    $tickets[] = $index;
                }
            }
            $i = $tickets[($this->random)(0, count($tickets) - 1)];
            $offers[] = array_splice($available, $i, 1)[0];
        }

        return $offers;
    }

    private function log(array &$s, string $text): void
    {
        $s['log'][] = ['turn' => $s['turn_number'], 'text' => $text];
        $s['log'] = array_slice($s['log'], -80);
    }
}
