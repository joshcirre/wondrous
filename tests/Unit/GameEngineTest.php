<?php

namespace Tests\Unit;

use App\Game\CharacterCatalog;
use App\Game\GameEngine;
use App\Game\GameRuleException;
use PHPUnit\Framework\TestCase;

class GameEngineTest extends TestCase
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

    public function test_twelve_alternating_picks_produce_six_distinct_units_each(): void
    {
        $s = $this->deployment();
        self::assertSame('deployment', $s['phase']);
        self::assertCount(12, $s['units']);
        foreach ([1, 2] as $id) {
            self::assertCount(6, array_unique($s['draft_picks'][$id]));
            self::assertCount(12, $s['pool'][$id]);
        }
    }

    public function test_owned_cards_do_not_limit_new_player_access(): void
    {
        $e = $this->engine();
        $s = $e->create(1, 'A', ['revenant']);
        $s = $e->apply($s, 2, 'join', ['id' => 2, 'name' => 'B']);
        self::assertContains('revenant', $s['offers'][1]);
        self::assertEqualsCanonicalizing($s['pool'][1], $s['pool'][2]);
    }

    public function test_wrong_turn_is_rejected(): void
    {
        $this->expectException(GameRuleException::class);
        $this->engine()->apply($this->battle(), 2, 'end_turn');
    }

    public function test_deployment_swaps_own_units_and_requires_both_ready(): void
    {
        $e = $this->engine();
        $s = $this->deployment();
        $s = $e->apply($s, 1, 'deploy', ['unit_id' => '1-warden', 'x' => 2, 'y' => 7]);
        self::assertSame(2, $s['units'][0]['x']);
        self::assertSame(1, $s['units'][1]['x']);
        $s = $e->apply($s, 1, 'ready');
        self::assertSame('deployment', $s['phase']);
        $s = $e->apply($s, 2, 'ready');
        self::assertSame('battle', $s['phase']);
    }

    public function test_movement_uses_paths_and_cannot_jump_blocker(): void
    {
        $s = $this->duel();
        $this->expectException(GameRuleException::class);
        $this->engine()->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 3, 'y' => 2]);
    }

    public function test_malformed_coordinates_are_rejected(): void
    {
        $this->expectException(GameRuleException::class);
        $this->engine()->apply($this->duel(), 1, 'move', ['unit_id' => '1-warden', 'x' => '3', 'y' => 5]);
    }

    public function test_only_one_unit_activates_per_turn(): void
    {
        $e = $this->engine();
        $s = $this->battle();
        $s = $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 1, 'y' => 6]);
        $this->expectException(GameRuleException::class);
        $e->apply($s, 1, 'face', ['unit_id' => '1-ranger', 'facing' => 'west']);
    }

    public function test_directional_block_and_rear_counter(): void
    {
        $e = $this->engine();
        $s = $this->duel();
        $front = $e->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame(130, $front['units'][1]['hp']);
        $s['units'][1]['facing'] = 'north';
        $rear = $e->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame(116, $rear['units'][1]['hp']);
        self::assertStringContainsString('Hit, 95% chance', implode(' ', array_column($rear['log'], 'text')));
        self::assertStringContainsString("Alice's Iron Warden", implode(' ', array_column($rear['log'], 'text')));
    }

    public function test_missed_attack_still_consumes_action_and_recovery(): void
    {
        $s = (new GameEngine(fn ($min, $max) => $max))->apply($this->duel(), 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertTrue($s['acted']);
        self::assertSame(2, $s['units'][0]['recovery']);
        self::assertSame(130, $s['units'][1]['hp']);
    }

    public function test_recovery_skips_exactly_next_owner_turn(): void
    {
        $e = $this->engine();
        $s = $e->apply($this->duel(), 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        $s = $e->apply($s, 1, 'end_turn');
        $s = $e->apply($s, 2, 'end_turn');
        self::assertSame(1, $s['units'][0]['recovery']);
        try {
            $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 2, 'y' => 4]);
            self::fail('Recovering unit moved');
        } catch (GameRuleException $e2) {
            self::assertStringContainsString('recovering', $e2->getMessage());
        }
        $s = $e->apply($s, 1, 'end_turn');
        $s = $e->apply($s, 2, 'end_turn');
        $s = $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 2, 'y' => 4]);
        self::assertSame(2, $s['units'][0]['x']);
    }

    public function test_skill_mana_stun_and_cooldown(): void
    {
        $e = $this->engine();
        $s = $e->apply($this->duel('knight'), 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
        self::assertSame(30, $s['units'][0]['mana']);
        self::assertSame(4, $s['units'][0]['cooldown']);
        self::assertSame(1, $s['units'][1]['statuses']['stun']);
        $s = $e->apply($s, 1, 'end_turn');
        $this->expectException(GameRuleException::class);
        $e->apply($s, 2, 'attack', ['unit_id' => '2-warden', 'target_id' => '1-knight']);
    }

    public function test_insufficient_mana_rejected(): void
    {
        $s = $this->duel('knight');
        $s['units'][0]['mana'] = 0;
        $this->expectException(GameRuleException::class);
        $this->engine()->apply($s, 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
    }

    public function test_rear_finishing_blow_uses_the_rear_deciding_line(): void
    {
        $s = $this->duel();
        $s['units'][1]['hp'] = 1;
        $s['units'][1]['facing'] = 'north';
        $s = $this->engine()->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertSame('finished', $s['phase']);
        self::assertSame('decisive_defeat', $s['deciding']['rule']);
        self::assertSame("Turn 1: Alice's Iron Warden defeated Bob's Iron Warden.", $s['deciding']['text']);
        self::assertStringContainsString("Alice's Iron Warden: Hit, 95% chance.", implode("\n", array_column($s['log'], 'text')));
        self::assertStringContainsString("Bob's Iron Warden was defeated.", implode("\n", array_column($s['log'], 'text')));
    }

    public function test_resign_uses_the_resign_deciding_line(): void
    {
        $s = $this->engine()->apply($this->duel(), 1, 'resign');
        self::assertSame('resign', $s['deciding']['rule']);
        self::assertSame('Alice resigned.', $s['deciding']['text']);
    }

    public function test_elimination_finishes_and_rejects_future_actions(): void
    {
        $s = $this->duel('arcanist');
        $s['units'][1]['hp'] = 1;
        $e = $this->engine();
        $s = $e->apply($s, 1, 'skill', ['unit_id' => '1-arcanist', 'target_id' => '2-warden']);
        self::assertSame('finished', $s['phase']);
        self::assertSame(1, $s['winner_id']);
        self::assertSame('elimination', $s['finish_reason']);
        self::assertSame('decisive_defeat', $s['deciding']['rule']);
        self::assertSame("Turn 1: Alice's Violet Arcanist defeated Bob's Iron Warden.", $s['deciding']['text']);
        self::assertStringContainsString("Alice's Violet Arcanist", implode(' ', array_column($s['log'], 'text')));
        $this->expectException(GameRuleException::class);
        $e->apply($s, 1, 'end_turn');
    }

    public function test_enemy_units_cannot_be_controlled(): void
    {
        $this->expectException(GameRuleException::class);
        $this->engine()->apply($this->duel(), 1, 'face', ['unit_id' => '2-warden', 'facing' => 'west']);
    }

    public function test_collection_contains_twelve_distinct_character_skills(): void
    {
        $all = CharacterCatalog::all();
        self::assertCount(12, $all);
        self::assertCount(8, array_filter($all, fn ($c) => $c['standard']));
        self::assertCount(12, array_unique(array_column(array_column($all, 'skill'), 'name')));
    }

    public function test_root_blocks_movement_but_allows_attacking(): void
    {
        $s = $this->duel();
        $s['units'][0]['statuses']['root'] = 2;
        $e = $this->engine();
        try {
            $e->apply($s, 1, 'move', ['unit_id' => '1-warden', 'x' => 2, 'y' => 4]);
            self::fail('Rooted unit moved');
        } catch (GameRuleException $error) {
            self::assertStringContainsString('rooted', $error->getMessage());
        }
        $s = $e->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        self::assertTrue($s['acted']);
    }

    public function test_burn_ticks_twice_then_expires(): void
    {
        $e = $this->engine();
        $s = $e->apply($this->duel('pyromancer'), 1, 'skill', ['unit_id' => '1-pyromancer', 'target_id' => '2-warden']);
        $health = $s['units'][1]['hp'];
        foreach ([1, 2, 1, 2] as $id) {
            $s = $e->apply($s, $id, 'end_turn');
        }
        self::assertSame($health - 16, $s['units'][1]['hp']);
        self::assertArrayNotHasKey('burn', $s['units'][1]['statuses']);
    }

    public function test_herald_death_restores_killer_mana_and_ends_duel(): void
    {
        $s = $this->duel('arcanist', 'herald');
        $s['units'][1]['hp'] = 1;
        $s['units'][0]['mana'] = 30;
        $s = $this->engine()->apply($s, 1, 'skill', ['unit_id' => '1-arcanist', 'target_id' => '2-herald']);
        self::assertSame(17, $s['units'][0]['mana']);
        self::assertSame(1, $s['winner_id']);
    }

    public function test_sparse_legacy_loadouts_are_normalized_before_offers(): void
    {
        $e = $this->engine();
        $s = $e->create(1, 'Alice', ['favorite' => 'druid']);
        $s = $e->apply($s, 2, 'join', ['id' => 2, 'name' => 'Bob', 'loadout' => [3 => 'revenant']]);
        self::assertSame(['druid'], $s['loadouts'][1]);
        self::assertSame(['revenant'], $s['loadouts'][2]);
        self::assertContains('druid', $s['offers'][1]);
        self::assertContains('revenant', $s['offers'][2]);
    }

    public function test_healing_is_capped_and_consumes_action_mana_and_recovery(): void
    {
        $s = $this->duel('cleric');
        $s['units'][0]['hp'] -= 1;
        $s = $this->engine()->apply($s, 1, 'skill', ['unit_id' => '1-cleric', 'target_id' => '1-cleric']);
        self::assertSame($s['units'][0]['max_hp'], $s['units'][0]['hp']);
        self::assertSame(45, $s['units'][0]['mana']);
        self::assertSame(2, $s['units'][0]['recovery']);
        self::assertTrue($s['acted']);
    }

    public function test_lethal_burn_credits_herald_bonus_then_finishes_without_underflow(): void
    {
        $s = $this->duel('pyromancer', 'herald');
        $s['units'][1]['hp'] = 3;
        $s['units'][1]['statuses']['burn'] = 1;
        $s['units'][1]['burn_source'] = 1;
        $s['units'][0]['mana'] = 0;
        $s['turn_player_id'] = 2;
        $s = $this->engine()->apply($s, 2, 'end_turn');
        self::assertSame(0, $s['units'][1]['hp']);
        self::assertSame(12, $s['units'][0]['mana']);
        self::assertSame('finished', $s['phase']);
        self::assertSame(1, $s['winner_id']);
        self::assertNull($s['turn_player_id']);
        self::assertSame('burn', $s['story']['defeats'][0]['cause'] ?? null);
        self::assertSame('decisive_defeat', $s['deciding']['rule']);
        self::assertSame("Turn 1: Bob's Crown Herald fell to burn.", $s['deciding']['text']);
        self::assertStringNotContainsString('Ember Witch', $s['deciding']['text']);
    }

    public function test_drain_uses_actual_damage_and_cannot_overheal(): void
    {
        $s = $this->duel('revenant');
        $s['units'][0]['hp'] = 100;
        $s['units'][1]['hp'] = 2;
        $s = $this->engine()->apply($s, 1, 'skill', ['unit_id' => '1-revenant', 'target_id' => '2-warden']);
        self::assertSame(102, $s['units'][0]['hp']);
        self::assertSame(0, $s['units'][1]['hp']);
    }

    public function test_every_later_preference_gets_an_extra_draw_ticket_without_duplicates(): void
    {
        foreach ([1 => 'druid', 3 => 'frostweaver', 5 => 'pyromancer'] as $ticket => $expected) {
            $e = new GameEngine(fn ($min, $max) => min($ticket, $max));
            $s = $e->create(1, 'Alice', ['revenant', 'druid', 'frostweaver', 'pyromancer']);
            $s = $e->apply($s, 2, 'join', ['id' => 2, 'name' => 'Bob']);
            self::assertSame('revenant', $s['offers'][1][0]);
            self::assertSame($expected, $s['offers'][1][1]);
            self::assertCount(3, array_unique($s['offers'][1]));
            self::assertEqualsCanonicalizing($s['pool'][1], $s['pool'][2]);
            self::assertCount(12, $s['pool'][2]);
        }
    }

    public function test_move_emits_the_true_orthogonal_path_around_a_blocker(): void
    {
        $s = $this->duel('rogue');
        $s = $this->engine()->apply($s, 1, 'move', ['unit_id' => '1-rogue', 'x' => 3, 'y' => 2]);
        $move = $this->onlyEvent($s, 'move');
        self::assertSame('1-rogue', $move['unit_id']);
        self::assertSame(1, $move['owner_id']);
        self::assertSame([3, 4], $move['from']);
        self::assertSame([3, 2], $move['to']);
        self::assertSame([[3, 4], [4, 4], [4, 3], [4, 2], [3, 2]], $move['path']);
        self::assertNotSame([[3, 4], [3, 3], [3, 2]], $move['path']);
    }

    public function test_attack_emits_hit_miss_and_block_with_the_engine_rolls(): void
    {
        $s = $this->duel();
        $hit = (new GameEngine($this->rolls([10, 99])))->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        $miss = (new GameEngine($this->rolls([100])))->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);
        $block = (new GameEngine($this->rolls([10, 1])))->apply($s, 1, 'attack', ['unit_id' => '1-warden', 'target_id' => '2-warden']);

        $hitEvent = $this->onlyEvent($hit, 'attack');
        self::assertSame([
            'type' => 'attack',
            'unit_id' => '1-warden',
            'owner_id' => 1,
            'target_id' => '2-warden',
            'target_owner_id' => 2,
            'side' => 'front',
            'roll' => ['accuracy' => 95, 'hit_roll' => 10, 'block_chance' => 40, 'block_roll' => 99],
            'outcome' => 'hit',
            'damage' => 14,
        ], $hitEvent);
        self::assertSame(116, $hit['units'][1]['hp']);

        $missEvent = $this->onlyEvent($miss, 'attack');
        self::assertSame('miss', $missEvent['outcome']);
        self::assertSame(['accuracy' => 95, 'hit_roll' => 100, 'block_chance' => 40, 'block_roll' => null], $missEvent['roll']);
        self::assertSame(0, $missEvent['damage']);
        self::assertSame(130, $miss['units'][1]['hp']);

        $blockEvent = $this->onlyEvent($block, 'attack');
        self::assertSame('block', $blockEvent['outcome']);
        self::assertSame(['accuracy' => 95, 'hit_roll' => 10, 'block_chance' => 40, 'block_roll' => 1], $blockEvent['roll']);
        self::assertSame(0, $blockEvent['damage']);
        self::assertSame('front', $blockEvent['side']);
        self::assertSame(130, $block['units'][1]['hp']);
    }

    public function test_skill_emits_resolved_amounts_and_statuses(): void
    {
        $s = $this->engine()->apply($this->duel('knight'), 1, 'skill', ['unit_id' => '1-knight', 'target_id' => '2-warden']);
        $skill = $this->onlyEvent($s, 'skill');
        self::assertSame('1-knight', $skill['unit_id']);
        self::assertSame(1, $skill['owner_id']);
        self::assertSame('Shield Bash', $skill['skill']);
        self::assertSame(['2-warden'], $skill['target_ids']);
        self::assertSame(['2-warden' => 13], $skill['amounts']);
        self::assertSame(['2-warden' => ['stun' => 1]], $skill['statuses']);
        self::assertSame(117, $s['units'][1]['hp']);
    }

    public function test_kill_emits_death_and_game_over(): void
    {
        $s = $this->duel('arcanist');
        $s['units'][1]['hp'] = 1;
        $s = $this->engine()->apply($s, 1, 'skill', ['unit_id' => '1-arcanist', 'target_id' => '2-warden']);
        $death = $this->onlyEvent($s, 'death');
        self::assertSame('2-warden', $death['unit_id']);
        self::assertSame(2, $death['owner_id']);
        self::assertSame(1, $death['by']);
        $over = $this->onlyEvent($s, 'game_over');
        self::assertSame(1, $over['winner_id']);
        self::assertSame('finished', $s['phase']);
    }

    public function test_burn_tick_emits_status_tick(): void
    {
        $s = $this->duel('pyromancer', 'herald');
        $s['units'][1]['hp'] = 3;
        $s['units'][1]['statuses']['burn'] = 1;
        $s['units'][1]['burn_source'] = 1;
        $s['units'][0]['mana'] = 0;
        $s['turn_player_id'] = 2;
        $s = $this->engine()->apply($s, 2, 'end_turn');
        $ticks = array_values(array_filter($s['events'], fn ($e) => $e['type'] === 'status_tick'));
        self::assertContains([
            'type' => 'status_tick',
            'unit_id' => '2-herald',
            'owner_id' => 2,
            'status' => 'burn',
            'amount' => 8,
        ], $ticks);
        self::assertSame('death', $s['events'][array_search('death', array_column($s['events'], 'type'), true)]['type']);
        self::assertSame(0, $s['units'][1]['hp']);
    }

    public function test_legacy_state_without_events_still_applies(): void
    {
        $s = $this->duel();
        unset($s['events']);
        $s = $this->engine()->apply($s, 1, 'face', ['unit_id' => '1-warden', 'facing' => 'west']);
        self::assertSame('west', $s['units'][0]['facing']);
        $face = $this->onlyEvent($s, 'face');
        self::assertSame('north', $face['from']);
        self::assertSame('west', $face['to']);
        self::assertSame(1, $face['owner_id']);
    }

    public function test_ready_and_end_turn_emit_turn_start(): void
    {
        $e = $this->engine();
        $s = $e->apply($this->deployment(), 1, 'ready');
        $s = $e->apply($s, 2, 'ready');
        $start = $this->onlyEvent($s, 'turn_start');
        self::assertSame(['type' => 'turn_start', 'player_id' => 1, 'turn_number' => 1], $start);
        $s = $e->apply($s, 1, 'end_turn');
        self::assertSame(['type' => 'turn_start', 'player_id' => 2, 'turn_number' => 2], $this->onlyEvent($s, 'turn_start'));
    }

    private function onlyEvent(array $s, string $type): array
    {
        $matches = array_values(array_filter($s['events'] ?? [], fn ($e) => ($e['type'] ?? null) === $type));
        self::assertCount(1, $matches, 'Expected one '.$type.' event, got '.json_encode($s['events'] ?? []));

        return $matches[0];
    }

    private function rolls(array $sequence): \Closure
    {
        return function (int $min, int $max) use (&$sequence) {
            return $sequence ? array_shift($sequence) : $min;
        };
    }
}
