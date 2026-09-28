<?php

namespace Tests\Unit;

use App\Game\ScriptedCombatRandom;
use Tests\TestCase;

class ScriptedCombatRandomTest extends TestCase
{
    public function test_tokens_expand_to_combat_rolls(): void
    {
        $this->assertSame([100], ScriptedCombatRandom::readTokens('miss'));
        $this->assertSame([1, 100], ScriptedCombatRandom::readTokens('hit'));
        $this->assertSame([1, 1], ScriptedCombatRandom::readTokens('block'));
        $this->assertSame([10, 99], ScriptedCombatRandom::readTokens('10,99'));
    }

    public function test_only_scripts_one_to_one_hundred(): void
    {
        $random = new ScriptedCombatRandom([7], fn (int $min, int $max) => $min + $max);
        $this->assertSame(7, $random(1, 100));
        $this->assertSame(5, $random(0, 5));
    }
}
