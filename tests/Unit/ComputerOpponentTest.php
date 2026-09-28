<?php

namespace Tests\Unit;

use App\Game\CharacterCatalog;
use App\Game\ComputerOpponent;
use App\Game\GameEngine;
use App\Game\Scenarios\FirstMatch;
use PHPUnit\Framework\TestCase;

class ComputerOpponentTest extends TestCase
{
    private function unit(string $character, int $owner, int $x, int $y): array
    {
        $c = CharacterCatalog::get($character);

        return ['id' => $owner.'-'.$character, 'owner_id' => $owner, 'character_id' => $character, 'x' => $x, 'y' => $y, 'hp' => $c['hp'], 'max_hp' => $c['hp'], 'mana' => $c['mana'], 'max_mana' => $c['mana'], 'facing' => $owner === -1 ? 'south' : 'north', 'recovery' => 0, 'cooldown' => 0, 'statuses' => []];
    }

    private function board(array $units): array
    {
        $engine = new GameEngine(fn ($min, $max) => $min);
        $state = $engine->apply($engine->create(1, 'Human'), -1, 'join', ['id' => -1, 'name' => 'Computer']);

        return array_replace($state, ['phase' => 'battle', 'turn_player_id' => -1, 'turn_number' => 2, 'units' => $units]);
    }

    public function test_computer_uses_a_guaranteed_finishing_skill_without_using_real_random_rolls(): void
    {
        $enemy = $this->unit('warden', 1, 3, 3);
        $enemy['hp'] = 30;
        $state = $this->board([$this->unit('ranger', -1, 3, 1), $enemy]);
        $choice = (new ComputerOpponent)->choose($state);
        self::assertSame('skill', $choice['type']);
        $next = (new GameEngine(fn () => throw new \LogicException('A guaranteed spell must not roll.')))->apply($state, -1, $choice['type'], $choice['payload']);
        self::assertSame('finished', $next['phase']);
        self::assertSame(-1, $next['winner_id']);
    }

    public function test_computer_heals_a_wounded_ally_and_passes_when_all_units_are_stunned(): void
    {
        $wounded = $this->unit('warden', -1, 2, 1);
        $wounded['hp'] = 20;
        $wounded['recovery'] = 1;
        $state = $this->board([$this->unit('cleric', -1, 3, 1), $wounded, $this->unit('ranger', 1, 3, 7)]);
        $choice = (new ComputerOpponent)->choose($state);
        if ($choice['type'] === 'move') {
            $state = (new GameEngine)->apply($state, -1, $choice['type'], $choice['payload']);
            $choice = (new ComputerOpponent)->choose($state);
        }
        self::assertSame('skill', $choice['type']);
        self::assertSame($wounded['id'], $choice['payload']['target_id']);
        foreach ($state['units'] as &$unit) {
            $unit['statuses']['stun'] = 1;
        }
        unset($unit);
        self::assertSame('end_turn', (new ComputerOpponent)->choose($state)['type']);
    }

    public function test_computer_moves_then_fights_to_completion_with_only_legal_actions(): void
    {
        $state = $this->board([$this->unit('ranger', -1, 3, 0), $this->unit('knight', 1, 3, 7)]);
        $engine = new GameEngine(fn ($min, $max) => $max === 100 ? 50 : $min);
        $computer = new ComputerOpponent;
        $types = [];
        for ($step = 0; $step < 120 && $state['phase'] !== 'finished'; $step++) {
            if ($state['turn_player_id'] === 1) {
                $state = $engine->apply($state, 1, 'end_turn');

                continue;
            }
            $choice = $computer->choose($state);
            self::assertNotNull($choice);
            $types[] = $choice['type'];
            $state = $engine->apply($state, -1, $choice['type'], $choice['payload']);
        }
        self::assertContains('move', $types);
        self::assertSame('finished', $state['phase']);
        self::assertSame(-1, $state['winner_id']);
    }

    public function test_first_match_script_faces_then_falls_back_when_the_move_is_illegal(): void
    {
        $engine = new GameEngine(fn ($min, $max) => $max === 100 ? 1 : $min);
        $state = $engine->apply($engine->create(1, 'Human'), -1, 'join', ['id' => -1, 'name' => 'Computer']);
        $units = [];
        foreach (FirstMatch::playerSquad() as $placed) {
            $units[] = $this->placed($placed, 1);
        }
        foreach (FirstMatch::computerSquad() as $placed) {
            $units[] = $this->placed($placed, -1);
        }
        $state = array_replace($state, [
            'phase' => 'battle',
            'turn_player_id' => -1,
            'turn_number' => 2,
            'scenario' => FirstMatch::KEY,
            'units' => $units,
        ]);
        $computer = new ComputerOpponent;
        $move = $computer->choose($state);
        self::assertSame('move', $move['type']);
        self::assertSame('-1-warden', $move['payload']['unit_id']);
        self::assertSame(4, $move['payload']['x']);
        self::assertSame(3, $move['payload']['y']);
        $state = $engine->apply($state, -1, $move['type'], $move['payload']);
        self::assertSame(['x' => 4, 'y' => 3], ['x' => collect($state['units'])->firstWhere('id', '-1-warden')['x'], 'y' => collect($state['units'])->firstWhere('id', '-1-warden')['y']]);

        $state['turn_number'] = 4;
        $state['turn_player_id'] = -1;
        $state['moved'] = false;
        $state['acted'] = false;
        $state['active_unit_id'] = null;
        $face = $computer->choose($state);
        self::assertSame('face', $face['type']);
        self::assertSame('north', $face['payload']['facing']);
        $state = $engine->apply($state, -1, $face['type'], $face['payload']);
        self::assertSame('north', collect($state['units'])->firstWhere('id', '-1-knight')['facing']);

        $blocked = $state;
        $blocked['turn_number'] = 2;
        $blocked['turn_player_id'] = -1;
        $blocked['moved'] = false;
        $blocked['acted'] = false;
        $blocked['active_unit_id'] = null;
        foreach ($blocked['units'] as $i => $unit) {
            if ($unit['id'] === '1-knight') {
                $blocked['units'][$i]['x'] = 4;
                $blocked['units'][$i]['y'] = 3;
            }
            if ($unit['id'] === '-1-warden') {
                $blocked['units'][$i]['x'] = 3;
                $blocked['units'][$i]['y'] = 3;
            }
        }
        $fallback = $computer->choose($blocked);
        self::assertNotSame(['type' => 'move', 'payload' => ['unit_id' => '-1-warden', 'x' => 4, 'y' => 3]], $fallback);
        $engine->apply($blocked, -1, $fallback['type'], $fallback['payload']);
    }

    private function placed(array $placed, int $owner): array
    {
        return array_replace($this->unit($placed['character_id'], $owner, $placed['x'], $placed['y']), ['facing' => $placed['facing']]);
    }
}
