<?php

namespace App\Game;

/**
 * Rank 11: one server-owned line for what decided the match.
 * Rules are checked in order; the first match wins. Brief can change copy here.
 */
final class DecidingMoment
{
    public const RULES = [
        'resign',
        'timeout',
        'draw',
        'last_rear',
        'last_skill',
        'last_kill',
        'biggest_hit',
        'worthy',
    ];

    public const COPY = [
        'resign' => '{name} resigned.',
        'timeout' => '{name} ran out of time.',
        'draw' => 'Neither formation held the field.',
        'last_rear' => '{attacker} struck {defender} from behind.',
        'last_skill' => '{attacker} ended it with {skill}.',
        'last_kill' => '{attacker} defeated {defender}.',
        'biggest_hit' => '{attacker} dealt {damage} to {defender}.',
        'worthy' => 'A worthy battle.',
    ];

    /**
     * @return array{rule: string, text: string}
     */
    public static function resolve(array $s): array
    {
        $reason = $s['finish_reason'] ?? null;
        $story = $s['story'] ?? [];
        $winnerId = $s['winner_id'] ?? null;

        if ($reason === 'resign') {
            $name = Chronicle::playerName($s, self::loserId($s));

            return self::line('resign', ['name' => $name]);
        }
        if ($reason === 'timeout') {
            if ($winnerId === null) {
                return self::line('draw', []);
            }
            $expired = $s['expired_player_ids'][0] ?? self::loserId($s);

            return self::line('timeout', ['name' => Chronicle::playerName($s, $expired)]);
        }
        if ($winnerId === null) {
            return self::line('draw', []);
        }

        $kill = $story['last_kill'] ?? null;
        if (is_array($kill)) {
            $attacker = $kill['attacker'] ?? '';
            $defender = $kill['defender'] ?? '';
            if (($kill['side'] ?? null) === 'rear') {
                return self::line('last_rear', ['attacker' => $attacker, 'defender' => $defender]);
            }
            if (! empty($kill['skill'])) {
                return self::line('last_skill', [
                    'attacker' => $attacker,
                    'defender' => $defender,
                    'skill' => $kill['skill'],
                ]);
            }

            return self::line('last_kill', ['attacker' => $attacker, 'defender' => $defender]);
        }

        $hit = $story['biggest_hit'] ?? null;
        if (is_array($hit) && ($hit['damage'] ?? 0) > 0) {
            return self::line('biggest_hit', [
                'attacker' => $hit['attacker'] ?? '',
                'defender' => $hit['defender'] ?? '',
                'damage' => $hit['damage'],
            ]);
        }

        return self::line('worthy', []);
    }

    public static function noteHit(array &$s, array $attacker, array $defender, int $damage): void
    {
        if ($damage <= 0) {
            return;
        }
        $current = (int) ($s['story']['biggest_hit']['damage'] ?? 0);
        if ($damage < $current) {
            return;
        }
        $s['story']['biggest_hit'] = [
            'damage' => $damage,
            'attacker' => Chronicle::unitName($s, $attacker),
            'defender' => Chronicle::unitName($s, $defender),
        ];
    }

    public static function noteKill(array &$s, array $attacker, array $defender, ?string $side, ?string $skill): void
    {
        $s['story']['last_kill'] = [
            'attacker' => Chronicle::unitName($s, $attacker),
            'defender' => Chronicle::unitName($s, $defender),
            'side' => $side,
            'skill' => $skill,
        ];
    }

    /**
     * @return array{rule: string, text: string}
     */
    public static function line(string $rule, array $values): array
    {
        $template = self::COPY[$rule] ?? self::COPY['worthy'];

        return ['rule' => $rule, 'text' => Chronicle::fill($template, $values)];
    }

    private static function loserId(array $s): ?int
    {
        $winner = $s['winner_id'] ?? null;
        foreach ($s['players'] ?? [] as $player) {
            if ((int) $player['id'] !== (int) $winner) {
                return (int) $player['id'];
            }
        }

        return null;
    }
}
