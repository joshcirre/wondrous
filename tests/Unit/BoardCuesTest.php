<?php

namespace Tests\Unit;

use App\Game\BoardCues;
use PHPUnit\Framework\TestCase;

class BoardCuesTest extends TestCase
{
    public function test_full_board_always_shows_breakdown_and_skill_strip(): void
    {
        foreach ([1, 2, 3, 8] as $turn) {
            self::assertSame(
                ['breakdown' => true, 'skill_strip' => true],
                BoardCues::visibility(false, $turn),
                'turn '.$turn,
            );
        }
    }

    public function test_reduced_board_hides_breakdown_on_turns_one_and_two(): void
    {
        self::assertFalse(BoardCues::visibility(true, 1)['breakdown']);
        self::assertFalse(BoardCues::visibility(true, 2)['breakdown']);
        self::assertTrue(BoardCues::visibility(true, 3)['breakdown']);
    }

    public function test_reduced_board_hides_skill_strip_on_turns_one_to_three(): void
    {
        self::assertFalse(BoardCues::visibility(true, 1)['skill_strip']);
        self::assertFalse(BoardCues::visibility(true, 2)['skill_strip']);
        self::assertFalse(BoardCues::visibility(true, 3)['skill_strip']);
        self::assertTrue(BoardCues::visibility(true, 4)['skill_strip']);
    }
}
