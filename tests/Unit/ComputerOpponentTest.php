<?php

namespace Tests\Unit;

use App\Game\CharacterCatalog;
use App\Game\ComputerOpponent;
use App\Game\GameEngine;
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
}
