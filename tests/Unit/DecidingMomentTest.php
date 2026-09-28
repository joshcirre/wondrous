<?php

namespace Tests\Unit;

use App\Game\Chronicle;
use App\Game\ComputerOpponent;
use App\Game\DecidingMoment;
use App\Game\LessonCatalog;
use PHPUnit\Framework\TestCase;

class DecidingMomentTest extends TestCase
{
    private function players(array $extra = []): array
    {
        return $extra + [
            'players' => [
                ['id' => 1, 'name' => 'Alice'],
                ['id' => 2, 'name' => 'Bob'],
            ],
            'winner_id' => 1,
            'finish_reason' => 'elimination',
            'units' => [],
            'story' => [],
        ];
    }

    public function test_copy_lives_on_the_lesson_catalog(): void
    {
        self::assertSame([
            'decisive_defeat',
            'flanking_hit',
            'biggest_hit',
            'resign',
            'timeout',
            'draw',
            'worthy',
        ], LessonCatalog::DECIDING_RULES);
        self::assertSame(LessonCatalog::DECIDING_RULES, DecidingMoment::RULES);
        self::assertSame('Turn {n}: {attacker} defeated {defender}.', LessonCatalog::DECIDING['decisive_defeat']);
        self::assertSame('Turn {n}: {attacker} defeated {defender}, {consequence}.', LessonCatalog::DECIDING['decisive_defeat_consequence']);
        self::assertSame('Turn {n}: {defender} fell to burn.', LessonCatalog::DECIDING['decisive_defeat_burn']);
        self::assertSame('leaving them without healing', LessonCatalog::CONSEQUENCE['without_healing']);
        self::assertSame('{attacker} dealt {damage} to {defender} from behind.', LessonCatalog::DECIDING['flanking_hit']);
        self::assertSame('{attacker} dealt {damage} to {defender}.', LessonCatalog::DECIDING['biggest_hit']);
        self::assertSame('{name} resigned.', LessonCatalog::DECIDING['resign']);
        self::assertSame('{name} ran out of time.', LessonCatalog::DECIDING['timeout']);
        self::assertSame('Neither formation held the field.', LessonCatalog::DECIDING['draw']);
        self::assertSame('A worthy battle.', LessonCatalog::DECIDING['worthy']);
        self::assertSame(['rear_hits', 'blocked', 'resting_defeat', 'fallback'], LessonCatalog::END_LESSON_RULES);
        self::assertArrayHasKey('rear_hits', LessonCatalog::END_LESSON);
        self::assertArrayHasKey('blocked', LessonCatalog::END_LESSON);
        self::assertArrayHasKey('resting_defeat', LessonCatalog::END_LESSON);
        self::assertSame('Keep your champions close enough to cover each other.', LessonCatalog::END_LESSON['fallback']);
    }

    public function test_earliest_defeat_that_never_lost_the_lead(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'story' => [
                'defeats' => [
                    $this->defeat(1, 1, 'warden', 2, 'ranger', [1 => 6, 2 => 5]),
                    $this->defeat(2, 1, 'warden', 2, 'knight', [1 => 6, 2 => 4]),
                ],
            ],
        ]));
        self::assertSame('decisive_defeat', $line['rule']);
        self::assertSame("Turn 1: Alice's Iron Warden defeated Bob's Ashen Ranger.", $line['text']);
        self::assertSame(1, $line['turn']);
        self::assertContains("Alice's Iron Warden", $line['names']);
        self::assertContains("Bob's Ashen Ranger", $line['names']);
    }

    public function test_early_lead_that_is_later_reversed_uses_the_later_defeat(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'story' => [
                'defeats' => [
                    $this->defeat(1, 1, 'warden', 2, 'ranger', [1 => 6, 2 => 5]),
                    $this->defeat(2, 2, 'knight', 1, 'ranger', [1 => 5, 2 => 5]),
                    $this->defeat(4, 1, 'warden', 2, 'knight', [1 => 5, 2 => 4]),
                    $this->defeat(5, 1, 'warden', 2, 'cleric', [1 => 5, 2 => 3]),
                ],
            ],
        ]));
        self::assertSame('decisive_defeat', $line['rule']);
        self::assertSame("Turn 4: Alice's Iron Warden defeated Bob's Dawn Knight.", $line['text']);
    }

    public function test_burn_defeat_does_not_credit_a_living_ally(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'story' => [
                'defeats' => [[
                    'turn' => 2,
                    'cause' => 'burn',
                    'attacker_owner_id' => 1,
                    'attacker_character_id' => 'warden',
                    'defender_owner_id' => 2,
                    'defender_character_id' => 'herald',
                    'defender_recovery' => 0,
                    'only_healer' => false,
                    'standing' => [1 => 1, 2 => 0],
                ]],
            ],
        ]));
        self::assertSame('decisive_defeat', $line['rule']);
        self::assertSame('burn', $line['facts']['cause']);
        self::assertSame("Turn 2: Bob's Crown Herald fell to burn.", $line['text']);
        self::assertStringNotContainsString('Iron Warden', $line['text']);
        self::assertContains("Bob's Crown Herald", $line['names']);
    }

    public function test_only_healer_defeat_adds_the_consequence_clause(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'story' => [
                'defeats' => [
                    $this->defeat(3, 1, 'rogue', 2, 'cleric', [1 => 6, 2 => 5], onlyHealer: true),
                ],
            ],
        ]));
        self::assertSame(
            "Turn 3: Alice's Velvet Rogue defeated Bob's Sun Cleric, leaving them without healing.",
            $line['text'],
        );
    }

    public function test_two_healers_do_not_add_a_consequence(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'story' => [
                'defeats' => [
                    $this->defeat(3, 1, 'rogue', 2, 'cleric', [1 => 6, 2 => 5], onlyHealer: false),
                ],
            ],
        ]));
        self::assertSame("Turn 3: Alice's Velvet Rogue defeated Bob's Sun Cleric.", $line['text']);
    }

    public function test_highest_hit_from_behind_beats_resign(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'finish_reason' => 'resign',
            'winner_id' => 1,
            'story' => [
                'hits' => [
                    $this->hit(1, 18, 'front', 1, 'ranger', 2, 'warden'),
                    $this->hit(2, 26, 'rear', 1, 'rogue', 2, 'warden'),
                ],
            ],
        ]));
        self::assertSame('flanking_hit', $line['rule']);
        self::assertSame("Alice's Velvet Rogue dealt 26 to Bob's Iron Warden from behind.", $line['text']);
    }

    public function test_highest_hit_that_is_a_backstab_uses_the_flanking_rule(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'finish_reason' => 'resign',
            'story' => [
                'hits' => [
                    $this->hit(1, 32, 'front', 1, 'rogue', 2, 'warden', 'Backstab'),
                ],
            ],
        ]));
        self::assertSame('flanking_hit', $line['rule']);
        self::assertSame("Alice's Velvet Rogue dealt 32 to Bob's Iron Warden with Backstab.", $line['text']);
    }

    public function test_biggest_front_hit_beats_a_smaller_rear_hit(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'finish_reason' => 'resign',
            'story' => [
                'hits' => [
                    $this->hit(1, 40, 'front', 1, 'arcanist', 2, 'warden', 'Arcane Lance'),
                    $this->hit(2, 12, 'rear', 1, 'rogue', 2, 'knight'),
                ],
            ],
        ]));
        self::assertSame('biggest_hit', $line['rule']);
        self::assertSame("Alice's Violet Arcanist dealt 40 to Bob's Iron Warden.", $line['text']);
    }

    public function test_turn_one_resign_uses_the_resign_line(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'finish_reason' => 'resign',
            'winner_id' => 2,
        ]));
        self::assertSame('resign', $line['rule']);
        self::assertSame('Alice resigned.', $line['text']);
        self::assertNull($line['lesson'] ?? null);
    }

    public function test_timeout_and_draw_fallbacks(): void
    {
        $timeout = DecidingMoment::resolve($this->players([
            'finish_reason' => 'timeout',
            'expired_player_ids' => [2],
        ]));
        self::assertSame('timeout', $timeout['rule']);
        self::assertSame('Bob ran out of time.', $timeout['text']);

        $draw = DecidingMoment::resolve($this->players([
            'winner_id' => null,
            'finish_reason' => 'timeout',
            'expired_player_ids' => [1, 2],
        ]));
        self::assertSame('draw', $draw['rule']);
        self::assertSame('Neither formation held the field.', $draw['text']);
    }

    public function test_worthy_is_last_resort(): void
    {
        $line = DecidingMoment::resolve($this->players([
            'finish_reason' => 'elimination',
        ]));
        self::assertSame('worthy', $line['rule']);
        self::assertSame('A worthy battle.', $line['text']);
    }

    public function test_participants_use_your_and_their_names(): void
    {
        $state = $this->players([
            'story' => [
                'defeats' => [
                    $this->defeat(1, 1, 'warden', 2, 'cleric', [1 => 1, 2 => 0], onlyHealer: true),
                ],
            ],
        ]);
        $winner = DecidingMoment::forViewer($state, 1);
        self::assertSame(
            'Turn 1: your Iron Warden defeated their Sun Cleric, leaving them without healing.',
            $winner['text'],
        );
        self::assertContains('your Iron Warden', $winner['names']);
        self::assertNull($winner['lesson']);

        $loser = DecidingMoment::forViewer($state, 2);
        self::assertSame(
            'Turn 1: their Iron Warden defeated your Sun Cleric, leaving them without healing.',
            $loser['text'],
        );
        self::assertNotNull($loser['lesson']);
    }

    public function test_replay_uses_owner_names_and_the_computer_display_name(): void
    {
        $state = $this->players([
            'players' => [
                ['id' => 1, 'name' => 'Elara'],
                ['id' => ComputerOpponent::ID, 'name' => 'Practice opponent'],
            ],
            'winner_id' => 1,
            'story' => [
                'defeats' => [
                    $this->defeat(2, 1, 'ranger', ComputerOpponent::ID, 'warden', [1 => 6, ComputerOpponent::ID => 5]),
                ],
            ],
        ]);
        $replay = DecidingMoment::forViewer($state, 1, spectator: true);
        self::assertSame("Turn 2: Elara's Ashen Ranger defeated Practice opponent's Iron Warden.", $replay['text']);
        self::assertNull($replay['lesson']);
    }

    public function test_lesson_rear_hits_blocked_resting_and_fallback(): void
    {
        $rear = DecidingMoment::forViewer($this->players([
            'winner_id' => 2,
            'story' => [
                'hits' => [
                    $this->hit(1, 10, 'rear', 2, 'rogue', 1, 'warden'),
                    $this->hit(2, 10, 'rear', 2, 'rogue', 1, 'ranger'),
                ],
            ],
        ]), 1);
        self::assertSame('rear_hits', $rear['lesson']['rule']);
        self::assertSame(LessonCatalog::END_LESSON['rear_hits'], $rear['lesson']['text']);

        $blocked = DecidingMoment::forViewer($this->players([
            'winner_id' => 2,
            'story' => [
                'blocks' => [
                    ['turn' => 1, 'attacker_owner_id' => 1, 'defender_owner_id' => 2],
                    ['turn' => 2, 'attacker_owner_id' => 1, 'defender_owner_id' => 2],
                ],
            ],
        ]), 1);
        self::assertSame('blocked', $blocked['lesson']['rule']);
        self::assertSame(LessonCatalog::END_LESSON['blocked'], $blocked['lesson']['text']);

        $resting = DecidingMoment::forViewer($this->players([
            'winner_id' => 2,
            'story' => [
                'defeats' => [
                    $this->defeat(3, 2, 'ranger', 1, 'warden', [1 => 5, 2 => 6], recovery: 2),
                ],
            ],
        ]), 1);
        self::assertSame('resting_defeat', $resting['lesson']['rule']);
        self::assertSame(LessonCatalog::END_LESSON['resting_defeat'], $resting['lesson']['text']);

        $fallback = DecidingMoment::forViewer($this->players([
            'winner_id' => 2,
            'finish_reason' => 'resign',
        ]), 1);
        self::assertSame('fallback', $fallback['lesson']['rule']);
        self::assertSame(LessonCatalog::END_LESSON['fallback'], $fallback['lesson']['text']);
    }

    public function test_no_lesson_on_a_win_draw_or_spectator_view(): void
    {
        $state = $this->players([
            'story' => [
                'hits' => [
                    $this->hit(1, 10, 'rear', 2, 'rogue', 1, 'warden'),
                    $this->hit(2, 10, 'rear', 2, 'rogue', 1, 'ranger'),
                ],
                'defeats' => [
                    $this->defeat(3, 1, 'warden', 2, 'ranger', [1 => 1, 2 => 0]),
                ],
            ],
        ]);
        self::assertNull(DecidingMoment::forViewer($state, 1)['lesson']);
        $draw = $this->players(['winner_id' => null, 'finish_reason' => 'timeout']);
        self::assertNull(DecidingMoment::forViewer($draw, 1)['lesson']);
        self::assertNull(DecidingMoment::forViewer($state, 2, spectator: true)['lesson']);
    }

    public function test_chronicle_owner_names_and_roll_templates(): void
    {
        $s = $this->players([
            'units' => [[
                'id' => '1-ranger',
                'character_id' => 'ranger',
                'owner_id' => 1,
            ]],
        ]);
        self::assertSame("Alice's Ashen Ranger", Chronicle::unitName($s, $s['units'][0]));
        self::assertSame('Practice opponent', Chronicle::playerName(['players' => []], ComputerOpponent::ID));
        self::assertSame("James' Iron Warden", Chronicle::possessive('James').' Iron Warden');
    }

    /**
     * @return array<string, mixed>
     */
    private function defeat(
        int $turn,
        int $attackerOwner,
        string $attacker,
        int $defenderOwner,
        string $defender,
        array $standing,
        bool $onlyHealer = false,
        int $recovery = 0,
    ): array {
        return [
            'turn' => $turn,
            'attacker_owner_id' => $attackerOwner,
            'attacker_character_id' => $attacker,
            'defender_owner_id' => $defenderOwner,
            'defender_character_id' => $defender,
            'defender_recovery' => $recovery,
            'only_healer' => $onlyHealer,
            'standing' => $standing,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function hit(
        int $turn,
        int $damage,
        string $side,
        int $attackerOwner,
        string $attacker,
        int $defenderOwner,
        string $defender,
        ?string $skill = null,
    ): array {
        return [
            'turn' => $turn,
            'damage' => $damage,
            'side' => $side,
            'skill' => $skill,
            'attacker_owner_id' => $attackerOwner,
            'attacker_character_id' => $attacker,
            'defender_owner_id' => $defenderOwner,
            'defender_character_id' => $defender,
        ];
    }
}
