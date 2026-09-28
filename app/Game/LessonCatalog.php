<?php

namespace App\Game;

use App\Game\Scenarios\FirstMatch;

/** Server-owned player copy. Brief or Marquee can edit the sentences here. */
final class LessonCatalog
{
    public const DECIDING_RULES = [
        'decisive_defeat',
        'flanking_hit',
        'biggest_hit',
        'resign',
        'timeout',
        'draw',
        'worthy',
    ];

    public const DECIDING = [
        'decisive_defeat' => 'Turn {n}: {attacker} defeated {defender}.',
        'decisive_defeat_consequence' => 'Turn {n}: {attacker} defeated {defender}, {consequence}.',
        'flanking_hit' => '{attacker} dealt {damage} to {defender} from behind.',
        'flanking_backstab' => '{attacker} dealt {damage} to {defender} with Backstab.',
        'biggest_hit' => '{attacker} dealt {damage} to {defender}.',
        'resign' => '{name} resigned.',
        'timeout' => '{name} ran out of time.',
        'draw' => 'Neither formation held the field.',
        'worthy' => 'A worthy battle.',
    ];

    public const CONSEQUENCE = [
        'without_healing' => 'leaving them without healing',
    ];

    public const END_LESSON_RULES = [
        'rear_hits',
        'blocked',
        'resting_defeat',
        'fallback',
    ];

    public const END_LESSON = [
        'rear_hits' => 'They reached your rear twice. Face the threat before you strike.',
        'blocked' => 'Your attacks were blocked twice. Find the rear, or a skill that always hits.',
        'resting_defeat' => 'A champion fell while resting. Do not leave them spent in range.',
        'fallback' => 'One champion. Then a gold tile. Then an enemy in range.',
    ];

    public static function isHealer(string $characterId): bool
    {
        return (CharacterCatalog::get($characterId)['role'] ?? null) === 'Healer';
    }

    /**
     * @return array{title: string, body: string}|null
     */
    public static function copy(int $step, ?string $variant = null): ?array
    {
        $lessons = [
            1 => [
                'title' => 'Select, move, attack',
                'body' => 'Click a champion, then a gold tile, then an enemy in range. One champion acts each turn.',
            ],
            2 => [
                'title' => 'Recovery',
                'body' => 'The champion who just attacked is resting. Pick someone else this turn.',
            ],
            3 => [
                'title' => 'Facing',
                'body' => 'Before you click, check the chip. Attacks from behind can\'t be blocked.',
            ],
            4 => [
                'title' => 'Skills',
                'body' => 'Skills always hit and bypass block, but they cost mana and go on cooldown.',
            ],
        ];
        if ($step === 1 && $variant === 'miss') {
            return [
                'title' => 'A miss still spends the action',
                'body' => 'Misses happen, 5% here, and your action is still spent.',
            ];
        }

        return $lessons[$step] ?? null;
    }

    public static function present(array $state): ?array
    {
        if (($state['scenario'] ?? null) !== FirstMatch::KEY) {
            return null;
        }
        $step = $state['lesson_step'] ?? null;
        if (! is_int($step)) {
            return null;
        }
        $variant = isset($state['lesson_variant']) && is_string($state['lesson_variant']) ? $state['lesson_variant'] : null;
        $copy = self::copy($step, $variant);
        if (! $copy) {
            return null;
        }

        return ['step' => $step, 'variant' => $variant, 'title' => $copy['title'], 'body' => $copy['body']];
    }

    public static function advance(array $state): array
    {
        if (($state['scenario'] ?? null) !== FirstMatch::KEY) {
            return $state;
        }
        $hostId = $state['host_id'] ?? null;
        foreach ($state['events'] ?? [] as $event) {
            if (! is_array($event)) {
                continue;
            }
            if (($event['type'] ?? '') === 'attack' && ($event['outcome'] ?? '') === 'miss'
                && ($event['owner_id'] ?? null) === $hostId && (int) ($state['lesson_step'] ?? 0) === 1) {
                $state['lesson_variant'] = 'miss';
            }
            if (($event['type'] ?? '') === 'turn_start' && ($event['player_id'] ?? null) === $hostId) {
                $n = (int) ($event['turn_number'] ?? 0);
                $state['lesson_step'] = match (true) {
                    $n === 1 => 1,
                    $n === 3 => 2,
                    $n === 5 => 3,
                    $n === 7 => 4,
                    default => null,
                };
                if ($n !== 1) {
                    unset($state['lesson_variant']);
                }
            }
        }

        return $state;
    }
}
