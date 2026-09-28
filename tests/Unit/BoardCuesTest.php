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

    public function test_visibility_counts_own_turns_for_host_and_guest_going_first_or_second(): void
    {
        $host = 10;
        $guest = 20;

        $hostFirstTurn1 = $this->battleState(1, $host, $host, $guest);
        self::assertSame(1, BoardCues::ownTurns($hostFirstTurn1, $host));
        self::assertSame(0, BoardCues::ownTurns($hostFirstTurn1, $guest));
        self::assertSame(
            ['breakdown' => false, 'skill_strip' => false],
            BoardCues::forViewer(true, $hostFirstTurn1, $host),
        );

        $hostFirstHostThird = $this->battleState(5, $host, $host, $guest);
        self::assertSame(3, BoardCues::ownTurns($hostFirstHostThird, $host));
        self::assertSame(2, BoardCues::ownTurns($hostFirstHostThird, $guest));
        self::assertTrue(BoardCues::forViewer(true, $hostFirstHostThird, $host)['breakdown']);
        self::assertFalse(BoardCues::forViewer(true, $hostFirstHostThird, $host)['skill_strip']);

        $hostFirstHostFourth = $this->battleState(7, $host, $host, $guest);
        self::assertSame(4, BoardCues::ownTurns($hostFirstHostFourth, $host));
        self::assertTrue(BoardCues::forViewer(true, $hostFirstHostFourth, $host)['skill_strip']);

        $guestFirstTurn1 = $this->battleState(1, $guest, $host, $guest);
        self::assertSame(0, BoardCues::ownTurns($guestFirstTurn1, $host));
        self::assertSame(1, BoardCues::ownTurns($guestFirstTurn1, $guest));
        self::assertSame(
            ['breakdown' => false, 'skill_strip' => false],
            BoardCues::forViewer(true, $guestFirstTurn1, $guest),
        );

        $hostSecondOwnThird = $this->battleState(6, $host, $host, $guest);
        self::assertSame(3, BoardCues::ownTurns($hostSecondOwnThird, $host));
        self::assertSame(3, BoardCues::ownTurns($hostSecondOwnThird, $guest));
        self::assertTrue(BoardCues::forViewer(true, $hostSecondOwnThird, $host)['breakdown']);
        self::assertFalse(BoardCues::forViewer(true, $hostSecondOwnThird, $host)['skill_strip']);

        $guestSecondOwnFourth = $this->battleState(8, $guest, $host, $guest);
        self::assertSame(4, BoardCues::ownTurns($guestSecondOwnFourth, $host));
        self::assertSame(4, BoardCues::ownTurns($guestSecondOwnFourth, $guest));
        self::assertTrue(BoardCues::forViewer(true, $guestSecondOwnFourth, $guest)['skill_strip']);
    }

    /**
     * @return array{turn_number: int, turn_player_id: int, host_id: int, players: list<array{id: int}>}
     */
    private function battleState(int $turn, int $current, int $host, int $guest): array
    {
        return [
            'turn_number' => $turn,
            'turn_player_id' => $current,
            'host_id' => $host,
            'players' => [['id' => $host], ['id' => $guest]],
        ];
    }
}
