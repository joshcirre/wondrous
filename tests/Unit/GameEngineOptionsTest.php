<?php

namespace Tests\Unit;

use App\Game\CharacterCatalog;
use App\Game\GameEngine;
use App\Game\GameRuleException;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class GameEngineOptionsTest extends TestCase
{
    private function engine(): GameEngine
    {
        return new GameEngine(fn ($min, $max) => $min);
    }

    private function deployment(): array
    {
        $e = $this->engine();
        $s = $e->create(1, 'Alice');
        $s = $e->apply($s, 2, 'join', ['id' => 2, 'name' => 'Bob']);
        for ($n = 0; $n < 12; $n++) {
            $id = $s['turn_player_id'];
            $s = $e->apply($s, $id, 'draft', ['character_id' => $s['offers'][$id][0]]);
        }

        return $s;
    }

    private function battle(): array
    {
        $e = $this->engine();
        $s = $this->deployment();
        $s = $e->apply($s, 1, 'ready');

        return $e->apply($s, 2, 'ready');
    }

    private function duel(string $a = 'warden', string $b = 'warden'): array
    {
        $s = $this->battle();
        $units = [];
        foreach ([1 => $a, 2 => $b] as $owner => $id) {
            $c = CharacterCatalog::get($id);
            $units[] = ['id' => $owner.'-'.$id, 'character_id' => $id, 'owner_id' => $owner, 'x' => 3, 'y' => $owner === 1 ? 4 : 3, 'hp' => $c['hp'], 'max_hp' => $c['hp'], 'mana' => $c['mana'], 'max_mana' => $c['mana'], 'facing' => $owner === 1 ? 'north' : 'south', 'recovery' => 0, 'cooldown' => 0, 'statuses' => []];
        }
        $s['units'] = $units;

        return $s;
    }

    private function unitOptions(array $s, int $viewerId, string $unitId): array
    {
        $options = $this->engine()->options($s, $viewerId);
        self::assertIsArray($options);
        self::assertArrayHasKey('units', $options);
        self::assertArrayHasKey($unitId, $options['units']);

        return $options['units'][$unitId];
    }

    public function test_options_are_empty_outside_battle_and_for_the_waiting_player(): void
    {
        $deployment = $this->deployment();
        self::assertTrue($this->engine()->options($deployment, 1) === null || $this->engine()->options($deployment, 1) === [] || ($this->engine()->options($deployment, 1)['units'] ?? null) === []);

        $battle = $this->battle();
        $waiting = $this->engine()->options($battle, 2);
        self::assertTrue($waiting === null || $waiting === [] || ($waiting['units'] ?? null) === []);

        $turn = $this->engine()->options($battle, 1);
        self::assertIsArray($turn);
        self::assertNotEmpty($turn['units']);
    }

    public function test_moves_match_apply_including_blocked_paths_root_and_path_tiles(): void
    {
        $e = $this->engine();
        $s = $this->duel();
        $opts = $this->unitOptions($s, 1, '1-warden');
        self::assertTrue($opts['can_activate']);
        self::assertNull($opts['reason']);

        $coords = array_map(fn ($m) => [$m['x'], $m['y']], $opts['moves']);
        self::assertNotContains([3, 3], $coords, 'cannot step onto a living unit');
        self::assertNotContains([3, 2], $coords, 'cannot jump the blocker');
        self::assertNotContains([3, 4], $coords, 'cannot stay on the current tile');

        foreach ($opts['moves'] as $move) {
            $next = $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => $move['x'], 'y' => $move['y']]);
            self::assertSame($move['x'], $next['units'][0]['x']);
            self::assertSame($move['y'], $next['units'][0]['y']);
            self::assertNotEmpty($move['path']);
            self::assertSame([$s['units'][0]['x'], $s['units'][0]['y']], $move['path'][0]);
            self::assertSame([$move['x'], $move['y']], $move['path'][array_key_last($move['path'])]);
        }

        try {
            $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 3, 'y' => 2]);
            self::fail('Blocked path should be rejected by apply()');
        } catch (GameRuleException $error) {
            self::assertStringContainsString('blocked', $error->getMessage());
        }

        $rooted = $s;
        $rooted['units'][0]['statuses']['root'] = 2;
        $rootedOpts = $this->unitOptions($rooted, 1, '1-warden');
        self::assertSame([], $rootedOpts['moves']);
        try {
            $e->apply($rooted, 1, 'move', ['unit_id' => '1-warden', 'x' => 2, 'y' => 4]);
            self::fail('Rooted unit should not move');
        } catch (GameRuleException $error) {
            self::assertSame($error->getMessage(), $rootedOpts['can_activate'] ? 'This character is rooted.' : $rootedOpts['reason']);
            self::assertStringContainsString('rooted', $error->getMessage());
        }
        self::assertNotEmpty($rootedOpts['attack']);
    }

    public function test_attack_targets_match_apply_range(): void
    {
        $e = $this->engine();
        $close = $this->duel('warden', 'warden');
        $closeOpts = $this->unitOptions($close, 1, '1-warden');
        $closeIds = array_column($closeOpts['attack'], 'target_id');
        self::assertSame(['2-warden'], $closeIds);
        $e->apply($close, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);

        $far = $this->duel('warden', 'warden');
        $far['units'][1]['x'] = 0;
        $far['units'][1]['y'] = 0;
        $farOpts = $this->unitOptions($far, 1, '1-warden');
        self::assertSame([], $farOpts['attack']);
        try {
            $e->apply($far, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
            self::fail('Out of range attack should be rejected');
        } catch (GameRuleException $error) {
            self::assertStringContainsString('range', $error->getMessage());
        }

        $ranger = $this->duel('ranger', 'warden');
        $ranger['units'][0]['x'] = 0;
        $ranger['units'][0]['y'] = 4;
        $ranger['units'][1]['x'] = 3;
        $ranger['units'][1]['y'] = 3;
        $rangerOpts = $this->unitOptions($ranger, 1, '1-ranger');
        self::assertSame(['2-warden'], array_column($rangerOpts['attack'], 'target_id'));
        $e->apply($ranger, 1, 'attack', ['unit_id' => '1-ranger', 'target_id' => '2-warden']);
    }

    public function test_recovery_and_one_active_champion_reasons_come_from_apply(): void
    {
        $e = $this->engine();
        $s = $this->battle();
        $recovering = $s;
        $recovering['units'][0]['recovery'] = 1;
        $opts = $this->unitOptions($recovering, 1, $recovering['units'][0]['id']);
        self::assertFalse($opts['can_activate']);
        self::assertSame('This character is recovering.', $opts['reason']);
        try {
            $e->apply($recovering, 1, 'face', ['unit_id' => $recovering['units'][0]['id'], 'facing' => 'west']);
            self::fail('Recovering unit should not activate');
        } catch (GameRuleException $error) {
            self::assertSame($opts['reason'], $error->getMessage());
        }

        $activated = $e->apply($s, 1, 'face', ['unit_id' => $s['units'][0]['id'], 'facing' => 'west']);
        $other = null;
        foreach ($activated['units'] as $candidate) {
            if ($candidate['owner_id'] === 1 && $candidate['id'] !== $s['units'][0]['id']) {
                $other = $candidate;
                break;
            }
        }
        self::assertNotNull($other);
        $otherOpts = $this->unitOptions($activated, 1, $other['id']);
        self::assertFalse($otherOpts['can_activate']);
        self::assertSame('Only one character can activate per turn.', $otherOpts['reason']);
        try {
            $e->apply($activated, 1, 'face', ['unit_id' => $other['id'], 'facing' => 'east']);
            self::fail('Second champion should be rejected');
        } catch (GameRuleException $error) {
            self::assertSame($otherOpts['reason'], $error->getMessage());
        }
    }

    public function test_skill_cooldown_and_mana_reasons_match_apply(): void
    {
        $e = $this->engine();
        $empty = $this->duel('knight');
        $empty['units'][0]['mana'] = 0;
        $emptyOpts = $this->unitOptions($empty, 1, '1-knight');
        self::assertTrue($emptyOpts['can_activate']);
        self::assertFalse($emptyOpts['skill']['usable']);
        self::assertSame('Not enough mana.', $emptyOpts['skill']['reason']);
        self::assertSame(CharacterCatalog::get('knight')['skill']['cost'], $emptyOpts['skill']['cost']);
        self::assertSame([], $emptyOpts['skill']['targets']);
        try {
            $e->apply($empty, 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
            self::fail('Empty mana should be rejected');
        } catch (GameRuleException $error) {
            self::assertSame($emptyOpts['skill']['reason'], $error->getMessage());
        }

        $cooling = $this->duel('knight');
        $cooling['units'][0]['cooldown'] = 2;
        $coolingOpts = $this->unitOptions($cooling, 1, '1-knight');
        self::assertFalse($coolingOpts['skill']['usable']);
        self::assertSame('This skill is on cooldown.', $coolingOpts['skill']['reason']);
        try {
            $e->apply($cooling, 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
            self::fail('Cooldown should be rejected');
        } catch (GameRuleException $error) {
            self::assertSame($coolingOpts['skill']['reason'], $error->getMessage());
        }

        $ready = $this->unitOptions($this->duel('knight'), 1, '1-knight');
        self::assertTrue($ready['skill']['usable']);
        self::assertNull($ready['skill']['reason']);
        self::assertNotEmpty($ready['skill']['targets']);
        self::assertTrue($ready['skill']['targets'][0]['always_hits']);
    }

    public function test_legal_options_succeed_through_apply_and_sampled_illegal_commands_throw(): void
    {
        $e = $this->engine();
        $boards = [];

        $boards[] = $this->duel();
        $boards[] = $this->duel('ranger', 'warden');
        $boards[] = $this->battle();

        $moved = $this->duel();
        $moved = $e->apply($moved, 1, 'move', ['unit_id' => '1-warden', 'x' => 2, 'y' => 4]);
        $boards[] = $moved;

        $rooted = $this->duel();
        $rooted['units'][0]['statuses']['root'] = 2;
        $boards[] = $rooted;

        $recovering = $this->battle();
        $recovering['units'][0]['recovery'] = 1;
        $boards[] = $recovering;

        $lowMana = $this->duel('knight');
        $lowMana['units'][0]['mana'] = 0;
        $boards[] = $lowMana;

        $rear = $this->duel('rogue', 'warden');
        $rear['units'][1]['facing'] = 'north';
        $boards[] = $rear;

        foreach ($boards as $index => $s) {
            $options = $e->options($s, 1);
            self::assertIsArray($options, 'board '.$index);
            foreach ($options['units'] as $unitId => $unit) {
                foreach ($unit['moves'] ?? [] as $move) {
                    $e->apply($s, 1, 'move', ['unit_id' => $unitId, 'x' => $move['x'], 'y' => $move['y']]);
                }
                foreach ($unit['attack'] ?? [] as $attack) {
                    $e->apply($s, 1, 'attack', ['unit_id' => $unitId, 'target_id' => $attack['target_id']]);
                }
                if (($unit['skill']['usable'] ?? false) === true) {
                    foreach ($unit['skill']['targets'] as $target) {
                        $e->apply($s, 1, 'skill', ['unit_id' => $unitId, 'target_id' => $target['target_id']]);
                    }
                }
                foreach ($unit['facing'] ?? [] as $facing) {
                    $e->apply($s, 1, 'face', ['unit_id' => $unitId, 'facing' => $facing]);
                }
            }

            $illegal = $this->illegalSamples($s, $options);
            self::assertNotEmpty($illegal, 'board '.$index.' should yield illegal samples');
            foreach ($illegal as $command) {
                try {
                    $e->apply($s, 1, $command['type'], $command['payload']);
                    self::fail('Illegal '.$command['type'].' on board '.$index.' was accepted');
                } catch (GameRuleException) {
                    // expected
                }
            }
        }
    }

    public function test_block_chance_matches_block_factor_for_front_side_and_rear(): void
    {
        $e = $this->engine();
        $s = $this->duel();
        $factor = new ReflectionMethod(GameEngine::class, 'blockChance');
        $blockFactor = new ReflectionMethod(GameEngine::class, 'blockFactor');

        $cases = [
            'south' => 'front',
            'east' => 'side',
            'west' => 'side',
            'north' => 'rear',
        ];
        foreach ($cases as $facing => $side) {
            $board = $s;
            $board['units'][1]['facing'] = $facing;
            $attack = $this->unitOptions($board, 1, '1-warden')['attack'][0];
            self::assertSame($side, $attack['block_side']);
            $expected = $factor->invoke($e, $board, 0, 1);
            self::assertSame($expected, $attack['block_chance']);
            $raw = $blockFactor->invoke($e, $board['units'][0], $board['units'][1]);
            self::assertSame((int) floor(CharacterCatalog::get('warden')['block'] * $raw), $attack['block_chance']);
            self::assertSame((int) round($attack['hit_chance'] * (1 - $attack['block_chance'] / 100)), $attack['land_chance']);
        }

        self::assertSame(40, $this->unitOptions((function () use ($s) {
            $s['units'][1]['facing'] = 'south';

            return $s;
        })(), 1, '1-warden')['attack'][0]['block_chance']);
        self::assertSame(20, $this->unitOptions((function () use ($s) {
            $s['units'][1]['facing'] = 'east';

            return $s;
        })(), 1, '1-warden')['attack'][0]['block_chance']);
        self::assertSame(0, $this->unitOptions((function () use ($s) {
            $s['units'][1]['facing'] = 'north';

            return $s;
        })(), 1, '1-warden')['attack'][0]['block_chance']);
    }

    public function test_damage_on_hit_equals_damage_dealt_on_a_forced_hit(): void
    {
        $e = $this->engine();
        $s = $this->duel();
        $s['units'][1]['facing'] = 'north';
        $preview = $this->unitOptions($s, 1, '1-warden')['attack'][0]['damage_on_hit'];
        $result = $e->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame($preview, $s['units'][1]['hp'] - $result['units'][1]['hp']);
        self::assertSame(14, $preview);

        $warded = $this->duel();
        $warded['units'][1]['facing'] = 'north';
        $warded['units'][1]['statuses']['ward'] = 2;
        $wardPreview = $this->unitOptions($warded, 1, '1-warden')['attack'][0]['damage_on_hit'];
        $wardResult = $e->apply($warded, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame($wardPreview, $warded['units'][1]['hp'] - $wardResult['units'][1]['hp']);

        $aura = $this->duel('warden', 'warden');
        $aura['units'][1]['facing'] = 'north';
        $herald = CharacterCatalog::get('herald');
        $aura['units'][] = ['id' => '2-herald', 'character_id' => 'herald', 'owner_id' => 2, 'x' => 4, 'y' => 3, 'hp' => $herald['hp'], 'max_hp' => $herald['hp'], 'mana' => $herald['mana'], 'max_mana' => $herald['mana'], 'facing' => 'north', 'recovery' => 0, 'cooldown' => 0, 'statuses' => []];
        $auraPreview = $this->unitOptions($aura, 1, '1-warden')['attack'][0]['damage_on_hit'];
        $auraResult = $e->apply($aura, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame($auraPreview, $aura['units'][1]['hp'] - $auraResult['units'][1]['hp']);
        self::assertSame(10, $auraPreview);
    }

    public function test_options_never_include_the_opponents_units(): void
    {
        $s = $this->battle();
        $options = $this->engine()->options($s, 1);
        self::assertIsArray($options);
        foreach (array_keys($options['units']) as $id) {
            self::assertStringStartsWith('1-', $id);
        }
        foreach ($s['units'] as $unit) {
            if ($unit['owner_id'] === 2) {
                self::assertArrayNotHasKey($unit['id'], $options['units']);
            }
        }
        $waiting = $this->engine()->options($s, 2);
        self::assertTrue($waiting === null || $waiting === [] || ($waiting['units'] ?? []) === []);
    }

    public function test_piercing_skill_damage_on_hit_matches_forced_cast(): void
    {
        $e = $this->engine();
        $s = $this->duel('ranger', 'warden');
        $target = $this->unitOptions($s, 1, '1-ranger')['skill']['targets'][0];
        self::assertSame('damage', $target['effect']);
        self::assertArrayHasKey('damage_on_hit', $target);
        $result = $e->apply($s, 1, 'skill', ['unit_id' => '1-ranger', 'target_id' => '2-warden']);
        self::assertSame($target['damage_on_hit'], $s['units'][1]['hp'] - $result['units'][1]['hp']);
        self::assertSame(34, $target['damage_on_hit']);
        self::assertFalse($target['lethal']);
    }

    public function test_non_piercing_skill_damage_on_hit_matches_forced_cast(): void
    {
        $e = $this->engine();
        $s = $this->duel('knight', 'warden');
        $target = $this->unitOptions($s, 1, '1-knight')['skill']['targets'][0];
        $result = $e->apply($s, 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
        self::assertSame($target['damage_on_hit'], $s['units'][1]['hp'] - $result['units'][1]['hp']);
        self::assertSame(13, $target['damage_on_hit']);

        $warded = $this->duel('knight', 'warden');
        $warded['units'][1]['statuses']['ward'] = 2;
        $wardTarget = $this->unitOptions($warded, 1, '1-knight')['skill']['targets'][0];
        $wardResult = $e->apply($warded, 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
        self::assertSame($wardTarget['damage_on_hit'], $warded['units'][1]['hp'] - $wardResult['units'][1]['hp']);
        self::assertSame(1, $wardTarget['damage_on_hit']);
    }

    public function test_rogue_skill_is_52_from_the_rear_and_32_from_other_sides(): void
    {
        $rear = $this->duel('rogue', 'warden');
        $rear['units'][1]['facing'] = 'north';
        $rearTarget = $this->unitOptions($rear, 1, '1-rogue')['skill']['targets'][0];
        $rearResult = $this->engine()->apply($rear, 1, 'skill', ['unit_id' => '1-rogue', 'target_id' => '2-warden']);
        self::assertSame(52, $rearTarget['damage_on_hit']);
        self::assertSame(52, $rear['units'][1]['hp'] - $rearResult['units'][1]['hp']);

        foreach (['south' => 32, 'east' => 32, 'west' => 32] as $facing => $expected) {
            $board = $this->duel('rogue', 'warden');
            $board['units'][1]['facing'] = $facing;
            $target = $this->unitOptions($board, 1, '1-rogue')['skill']['targets'][0];
            $result = $this->engine()->apply($board, 1, 'skill', ['unit_id' => '1-rogue', 'target_id' => '2-warden']);
            self::assertSame($expected, $target['damage_on_hit'], $facing);
            self::assertSame($expected, $board['units'][1]['hp'] - $result['units'][1]['hp'], $facing);
        }
    }

    public function test_lethal_flag_follows_damage_on_hit_versus_remaining_health(): void
    {
        $s = $this->duel('ranger', 'warden');
        $s['units'][1]['hp'] = 10;
        $attack = $this->unitOptions($s, 1, '1-ranger')['attack'][0];
        self::assertTrue($attack['lethal']);
        self::assertSame(10, $attack['damage_on_hit']);

        $s['units'][1]['hp'] = 80;
        $safe = $this->unitOptions($s, 1, '1-ranger')['attack'][0];
        self::assertFalse($safe['lethal']);
        self::assertSame(17, $safe['damage_on_hit']);

        $s['units'][1]['hp'] = 30;
        $skill = $this->unitOptions($s, 1, '1-ranger')['skill']['targets'][0];
        self::assertTrue($skill['lethal']);
        self::assertSame(30, $skill['damage_on_hit']);
    }

    public function test_options_computation_for_a_full_board_stays_bounded(): void
    {
        $s = $this->battle();
        self::assertCount(12, $s['units']);
        $started = hrtime(true);
        $this->engine()->options($s, 1);
        $ms = (hrtime(true) - $started) / 1_000_000;
        fwrite(STDOUT, sprintf("\nFull 12-unit options() took %.2f ms\n", $ms));
        self::assertLessThan(250, $ms);
    }

    /** @return list<array{type:string,payload:array}> */
    private function illegalSamples(array $s, array $options): array
    {
        $samples = [];
        $own = array_values(array_filter($s['units'], fn ($u) => $u['owner_id'] === 1 && $u['hp'] > 0));
        $enemy = array_values(array_filter($s['units'], fn ($u) => $u['owner_id'] === 2 && $u['hp'] > 0));
        $unit = $own[0];
        $listed = [];
        foreach (($options['units'][$unit['id']]['moves'] ?? []) as $move) {
            $listed[$move['x'].','.$move['y']] = true;
        }
        for ($x = 0; $x < 8 && count($samples) < 2; $x++) {
            for ($y = 0; $y < 8 && count($samples) < 2; $y++) {
                if (! isset($listed[$x.','.$y])) {
                    $samples[] = ['type' => 'move', 'payload' => ['unit_id' => $unit['id'], 'x' => $x, 'y' => $y]];
                }
            }
        }
        $samples[] = ['type' => 'attack', 'payload' => ['unit_id' => $unit['id'], 'target_id' => $own[0]['id']]];
        if ($enemy) {
            $listedTargets = array_column($options['units'][$unit['id']]['attack'] ?? [], 'target_id');
            if (! in_array($enemy[0]['id'], $listedTargets, true)) {
                $samples[] = ['type' => 'attack', 'payload' => ['unit_id' => $unit['id'], 'target_id' => $enemy[0]['id']]];
            }
        }
        if (($options['units'][$unit['id']]['skill']['usable'] ?? false) === false) {
            $samples[] = ['type' => 'skill', 'payload' => ['unit_id' => $unit['id'], 'target_id' => $enemy[0]['id'] ?? $unit['id']]];
        }
        if (count($own) > 1 && ($options['units'][$own[1]['id']]['can_activate'] ?? true) === false) {
            $samples[] = ['type' => 'face', 'payload' => ['unit_id' => $own[1]['id'], 'facing' => 'west']];
        }

        return $samples;
    }
}
