<?php

namespace Tests\Unit;

use App\Game\Chronicle;
use App\Game\ComputerOpponent;
use App\Game\DecidingMoment;
use PHPUnit\Framework\TestCase;

class DecidingMomentTest extends TestCase
{
    private function players(): array
    {
        return [
            'players' => [
                ['id' => 1, 'name' => 'Alice'],
                ['id' => 2, 'name' => 'Bob'],
            ],
        ];
    }

    public function test_copy_templates_are_the_brief_source(): void
    {
        self::assertSame([
            'resign',
            'timeout',
            'draw',
            'last_rear',
            'last_skill',
            'last_kill',
            'biggest_hit',
            'worthy',
        ], DecidingMoment::RULES);
        self::assertSame('{attacker} struck {defender} from behind.', DecidingMoment::COPY['last_rear']);
        self::assertSame('{attacker} ended it with {skill}.', DecidingMoment::COPY['last_skill']);
        self::assertSame('{attacker} defeated {defender}.', DecidingMoment::COPY['last_kill']);
        self::assertSame('{name} resigned.', DecidingMoment::COPY['resign']);
        self::assertSame('{name} ran out of time.', DecidingMoment::COPY['timeout']);
        self::assertSame('Neither formation held the field.', DecidingMoment::COPY['draw']);
        self::assertSame('{attacker} dealt {damage} to {defender}.', DecidingMoment::COPY['biggest_hit']);
        self::assertSame('A worthy battle.', DecidingMoment::COPY['worthy']);
    }

    public function test_resign_names_the_player_who_left(): void
    {
        $line = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'resign',
        ]);
        self::assertSame('resign', $line['rule']);
        self::assertSame('Bob resigned.', $line['text']);
    }

    public function test_timeout_names_the_expired_player(): void
    {
        $line = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'timeout',
            'expired_player_ids' => [2],
        ]);
        self::assertSame('timeout', $line['rule']);
        self::assertSame('Bob ran out of time.', $line['text']);
    }

    public function test_timeout_draw_uses_the_draw_template(): void
    {
        $line = DecidingMoment::resolve($this->players() + [
            'winner_id' => null,
            'finish_reason' => 'timeout',
            'expired_player_ids' => [1, 2],
        ]);
        self::assertSame('draw', $line['rule']);
        self::assertSame('Neither formation held the field.', $line['text']);
    }

    public function test_rear_kill_beats_skill_and_plain_kill(): void
    {
        $line = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'elimination',
            'story' => [
                'last_kill' => [
                    'attacker' => "Alice's Velvet Rogue",
                    'defender' => "Bob's Iron Warden",
                    'side' => 'rear',
                    'skill' => 'Backstab',
                ],
            ],
        ]);
        self::assertSame('last_rear', $line['rule']);
        self::assertSame("Alice's Velvet Rogue struck Bob's Iron Warden from behind.", $line['text']);
    }

    public function test_skill_kill_uses_the_skill_name(): void
    {
        $line = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'elimination',
            'story' => [
                'last_kill' => [
                    'attacker' => "Alice's Violet Arcanist",
                    'defender' => "Bob's Iron Warden",
                    'side' => 'front',
                    'skill' => 'Arcane Lance',
                ],
            ],
        ]);
        self::assertSame('last_skill', $line['rule']);
        self::assertSame("Alice's Violet Arcanist ended it with Arcane Lance.", $line['text']);
    }

    public function test_basic_kill_and_biggest_hit_fallbacks(): void
    {
        $kill = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'elimination',
            'story' => [
                'last_kill' => [
                    'attacker' => "Alice's Ashen Ranger",
                    'defender' => "Bob's Iron Warden",
                    'side' => 'front',
                    'skill' => null,
                ],
            ],
        ]);
        self::assertSame('last_kill', $kill['rule']);
        self::assertSame("Alice's Ashen Ranger defeated Bob's Iron Warden.", $kill['text']);

        $swing = DecidingMoment::resolve($this->players() + [
            'winner_id' => 1,
            'finish_reason' => 'elimination',
            'story' => [
                'biggest_hit' => [
                    'attacker' => "Alice's Ashen Ranger",
                    'defender' => "Bob's Iron Warden",
                    'damage' => 34,
                ],
            ],
        ]);
        self::assertSame('biggest_hit', $swing['rule']);
        self::assertSame("Alice's Ashen Ranger dealt 34 to Bob's Iron Warden.", $swing['text']);
    }

    public function test_chronicle_owner_names_and_roll_templates(): void
    {
        $s = $this->players() + [
            'units' => [[
                'id' => '1-ranger',
                'character_id' => 'ranger',
                'owner_id' => 1,
            ]],
        ];
        self::assertSame("Alice's Ashen Ranger", Chronicle::unitName($s, $s['units'][0]));
        self::assertSame("Practice opponent", Chronicle::playerName(['players' => []], ComputerOpponent::ID));
        self::assertSame("James' Iron Warden", Chronicle::possessive('James').' Iron Warden');
        self::assertSame("Alice's Ashen Ranger: Hit, 90% chance.", Chronicle::fill(Chronicle::HIT, [
            'name' => "Alice's Ashen Ranger",
            'chance' => 90,
        ]));
        self::assertSame("Bob's Iron Warden: Blocked, 40% chance.", Chronicle::fill(Chronicle::BLOCKED, [
            'name' => "Bob's Iron Warden",
            'chance' => 40,
        ]));
    }
}
