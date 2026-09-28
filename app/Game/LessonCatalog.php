<?php

namespace App\Game;

use App\Game\Scenarios\FirstMatch;

/** Server-owned first-match lesson copy. Brief or Marquee can edit the sentences here. */
final class LessonCatalog
{
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
                'body' => 'Hover an enemy to see hit and block chances. Attack from behind — the Rogue\'s Backstab deals 52 instead of 32.',
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
