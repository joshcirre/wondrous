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
            $this->log($s, 'Player '.$actorId.' resigned.');

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
            $this->log($s, 'Player '.$actorId.' drafted '.CharacterCatalog::get($id)['name'].'.');
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
            $s['units'][$i]['facing'] = $f;
        } elseif ($type === 'move') {
            $this->require(! $s['moved'], 'You already moved this turn.');
            $this->require(($u['statuses']['root'] ?? 0) === 0, 'This character is rooted.');
            [$x,$y] = $this->tile($payload);
            $this->require($this->reachable($s, $u, $x, $y, $c['move']), 'Destination is blocked or beyond movement range.');
            $s['units'][$i]['facing'] = $this->direction($x - $u['x'], $y - $u['y']);
            $s['units'][$i]['x'] = $x;
            $s['units'][$i]['y'] = $y;
            $s['moved'] = true;
            $this->log($s, $c['name'].' moved.');
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

    private function cast(array &$s, int $i, int $j): void
    {
        $id = $s['units'][$i]['character_id'];
        $c = CharacterCatalog::get($id);
        $this->log($s, $c['name'].' used '.$c['skill']['name'].'.');
        switch ($id) {
            case 'warden': $s['units'][$j]['statuses']['ward'] = 2;
                break;
            case 'cleric': $this->heal($s, $j, 38);
                break;
            case 'druid':
                $this->heal($s, $j, 25);
                foreach (['burn', 'root', 'stun'] as $status) {
                    unset($s['units'][$j]['statuses'][$status]);
                } break;
            case 'herald':
                foreach ($s['units'] as $k => $u) {
                    if ($u['owner_id'] === $s['units'][$i]['owner_id'] && $u['hp'] > 0) {
                        $this->heal($s, $k, 12);
                        $s['units'][$k]['mana'] = min($u['max_mana'], $s['units'][$k]['mana'] + 12);
                    }
                } break;
            default:
                $amount = match ($id) {
                    'ranger' => 34,'knight' => 22,'arcanist' => 39,'rogue' => $this->blockFactor($s['units'][$i], $s['units'][$j]) === 0.0 ? 52 : 32,'pikeman' => 26,'pyromancer' => 28,'frostweaver' => 23,'revenant' => 31
                };
                $dealt = $this->damage($s, $i, $j, $amount, in_array($id, ['ranger', 'arcanist', 'rogue', 'revenant'], true), false);
                if ($dealt > 0 && $s['units'][$j]['hp'] > 0) {
                    if ($id === 'knight') {
                        $s['units'][$j]['statuses']['stun'] = 1;
                    }
                    if (in_array($id, ['pikeman', 'frostweaver'], true)) {
                        $s['units'][$j]['statuses']['root'] = 2;
                    }
                    if ($id === 'pyromancer') {
                        $s['units'][$j]['statuses']['burn'] = 2;
                        $s['units'][$j]['burn_source'] = $s['units'][$i]['owner_id'];
                    }
                }
                if ($id === 'revenant') {
                    $this->heal($s, $i, $dealt);
                }
        }
    }

    private function damage(array &$s, int $i, int $j, int $amount, bool $pierce, bool $roll): int
    {
        $u = $s['units'][$i];
        $t = $s['units'][$j];
        $c = CharacterCatalog::get($u['character_id']);
        $d = CharacterCatalog::get($t['character_id']);
        if ($roll) {
            $hit = ($this->random)(1, 100);
            $this->log($s, $c['name'].' accuracy roll '.$hit.' / '.$c['accuracy'].'.');
            if ($hit > $c['accuracy']) {
                $this->log($s, 'Attack missed '.$d['name'].'.');

                return 0;
            }
            $chance = (int) floor($d['block'] * $this->blockFactor($u, $t));
            $block = ($this->random)(1, 100);
            $this->log($s, $d['name'].' block roll '.$block.' / '.$chance.'.');
            if ($block <= $chance) {
                $this->log($s, $d['name'].' blocked the attack.');

                return 0;
            }
        }
        $armor = $d['armor'] + (($t['statuses']['ward'] ?? 0) > 0 ? 12 : 0);
        foreach ($s['units'] as $ally) {
            if ($ally['character_id'] === 'herald' && $ally['hp'] > 0 && $ally['owner_id'] === $t['owner_id'] && $this->distance($ally, $t) <= 2) {
                $armor += 4;
                break;
            }
        }
        $damage = min($t['hp'], max(1, $amount - ($pierce ? 0 : $armor)));
        $s['units'][$j]['hp'] -= $damage;
        $this->log($s, $c['name'].' dealt '.$damage.' damage to '.$d['name'].'.');
        if ($s['units'][$j]['hp'] === 0) {
            $this->death($s, $j, $u['owner_id']);
        }

        return $damage;
    }

    private function death(array &$s, int $j, int $killer): void
    {
        $this->log($s, CharacterCatalog::get($s['units'][$j]['character_id'])['name'].' was defeated.');
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
                    $s['units'][$i]['hp'] = max(0, $u['hp'] - 8);
                    $this->log($s, CharacterCatalog::get($u['character_id'])['name'].' suffered 8 burn damage.');
                    if ($s['units'][$i]['hp'] === 0) {
                        $this->death($s, $i, $u['burn_source'] ?? $this->opponent($s, $actorId));
                    }
                }
                foreach ($u['statuses'] as $key => $duration) {
                    if ($duration <= 1) {
                        unset($s['units'][$i]['statuses'][$key]);
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
                $this->log($s, 'Player '.$s['winner_id'].' wins by elimination.');

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
        if ($x === $u['x'] && $y === $u['y']) {
            return false;
        }
        $blocked = [];
        foreach ($s['units'] as $v) {
            if ($v['hp'] > 0 && $v['id'] !== $u['id']) {
                $blocked[$v['x'].','.$v['y']] = true;
            }
        }
        $queue = [[$u['x'], $u['y'], 0]];
        $seen = [$u['x'].','.$u['y'] => true];
        for ($i = 0; $i < count($queue); $i++) {
            [$cx,$cy,$d] = $queue[$i];
            if ($cx === $x && $cy === $y) {
                return true;
            } if ($d === $range) {
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
                $queue[] = [$nx, $ny, $d + 1];
            }
        }

        return false;
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
