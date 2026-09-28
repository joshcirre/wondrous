<?php

namespace App\Game;

/**
 * Rank 11: one server-owned line for what decided the match, plus a loss lesson.
 * Copy lives in LessonCatalog. This class returns structured parts, never HTML.
 */
final class DecidingMoment
{
    public const RULES = LessonCatalog::DECIDING_RULES;

    /**
     * @return array{rule: string, text: string, turn?: int|null, names: list<string>, facts: array<string, mixed>, lesson: array{rule: string, text: string}|null}
     */
    public static function resolve(array $s): array
    {
        return self::forViewer($s, null, spectator: true);
    }

    /**
     * @return array{rule: string, text: string, turn?: int|null, names: list<string>, facts: array<string, mixed>, lesson: array{rule: string, text: string}|null}
     */
    public static function forViewer(array $s, ?int $viewerId, bool $spectator = false): array
    {
        $facts = is_array($s['deciding']['facts'] ?? null) ? $s['deciding']['facts'] : self::choose($s);
        $line = self::render($s, $facts, $viewerId, $spectator);
        $line['facts'] = $facts;
        $line['lesson'] = self::lesson($s, $viewerId, $spectator);

        return $line;
    }

    public static function noteHit(array &$s, array $attacker, array $defender, int $damage, ?string $side = null, ?string $skill = null): void
    {
        if ($damage <= 0) {
            return;
        }
        $hit = self::actorFacts($attacker, $defender) + [
            'turn' => (int) ($s['turn_number'] ?? 0),
            'damage' => $damage,
            'side' => $side,
            'skill' => $skill,
        ];
        $s['story']['hits'][] = $hit;
        $current = (int) ($s['story']['biggest_hit']['damage'] ?? 0);
        if ($damage >= $current) {
            $s['story']['biggest_hit'] = $hit;
        }
    }

    public static function noteBlock(array &$s, array $attacker, array $defender): void
    {
        $s['story']['blocks'][] = [
            'turn' => (int) ($s['turn_number'] ?? 0),
            'attacker_owner_id' => (int) $attacker['owner_id'],
            'defender_owner_id' => (int) $defender['owner_id'],
        ];
    }

    public static function noteKill(array &$s, array $attacker, array $defender, ?string $side, ?string $skill): void
    {
        $standing = [];
        foreach ($s['players'] ?? [] as $player) {
            $standing[(int) $player['id']] = self::livingCount($s, (int) $player['id']);
        }
        $owner = (int) $defender['owner_id'];
        $characterId = (string) $defender['character_id'];
        $onlyHealer = LessonCatalog::isHealer($characterId);
        if ($onlyHealer) {
            foreach ($s['units'] ?? [] as $unit) {
                if ((int) $unit['owner_id'] === $owner && ($unit['hp'] ?? 0) > 0 && LessonCatalog::isHealer((string) $unit['character_id'])) {
                    $onlyHealer = false;
                    break;
                }
            }
        }
        $defeat = self::actorFacts($attacker, $defender) + [
            'turn' => (int) ($s['turn_number'] ?? 0),
            'side' => $side,
            'skill' => $skill,
            'cause' => null,
            'defender_recovery' => (int) ($defender['recovery'] ?? 0),
            'only_healer' => $onlyHealer,
            'standing' => $standing,
        ];
        $s['story']['defeats'][] = $defeat;
        $s['story']['last_kill'] = $defeat;
    }

    public static function noteBurnKill(array &$s, array $defender, ?int $sourceOwnerId = null): void
    {
        self::noteKill($s, ['owner_id' => $sourceOwnerId, 'character_id' => ''], $defender, null, null);
        $last = array_key_last($s['story']['defeats']);
        $s['story']['defeats'][$last]['cause'] = 'burn';
        $s['story']['defeats'][$last]['attacker_character_id'] = '';
        $s['story']['last_kill'] = $s['story']['defeats'][$last];
    }

    /**
     * @return array{rule: string, turn?: int, damage?: int, consequence?: string, flank?: string, player_id?: int|null, attacker_owner_id?: int, attacker_character_id?: string, defender_owner_id?: int, defender_character_id?: string}
     */
    private static function choose(array $s): array
    {
        $winnerId = $s['winner_id'] ?? null;
        $defeat = self::decisiveDefeat($s, $winnerId);
        if ($defeat) {
            return [
                'rule' => 'decisive_defeat',
                'turn' => (int) $defeat['turn'],
                'cause' => ($defeat['cause'] ?? null) === 'burn' ? 'burn' : null,
                'attacker_owner_id' => (int) ($defeat['attacker_owner_id'] ?? 0),
                'attacker_character_id' => (string) ($defeat['attacker_character_id'] ?? ''),
                'defender_owner_id' => (int) $defeat['defender_owner_id'],
                'defender_character_id' => (string) $defeat['defender_character_id'],
                'consequence' => ! empty($defeat['only_healer']) ? 'without_healing' : null,
            ];
        }
        $hit = self::biggestHit($s);
        if ($hit && self::isFlanking($hit)) {
            return self::hitFacts('flanking_hit', $hit);
        }
        if ($hit) {
            return self::hitFacts('biggest_hit', $hit);
        }

        $reason = $s['finish_reason'] ?? null;
        if ($reason === 'resign') {
            return ['rule' => 'resign', 'player_id' => self::loserId($s)];
        }
        if ($reason === 'timeout') {
            if ($winnerId === null) {
                return ['rule' => 'draw'];
            }

            return ['rule' => 'timeout', 'player_id' => $s['expired_player_ids'][0] ?? self::loserId($s)];
        }
        if ($winnerId === null) {
            return ['rule' => 'draw'];
        }

        return ['rule' => 'worthy'];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{rule: string, text: string, turn: int|null, names: list<string>}
     */
    private static function render(array $s, array $facts, ?int $viewerId, bool $spectator): array
    {
        $rule = (string) ($facts['rule'] ?? 'worthy');
        $names = [];
        $values = [];
        $turn = isset($facts['turn']) ? (int) $facts['turn'] : null;
        if ($rule === 'decisive_defeat' && ($facts['cause'] ?? null) === 'burn') {
            $defender = self::championName(
                $s,
                (int) $facts['defender_owner_id'],
                (string) $facts['defender_character_id'],
                $viewerId,
                $spectator,
            );

            return [
                'rule' => $rule,
                'text' => Chronicle::fill(LessonCatalog::DECIDING['decisive_defeat_burn'], [
                    'n' => $turn,
                    'defender' => $defender,
                ]),
                'turn' => $turn,
                'names' => [$defender],
            ];
        }
        if (isset($facts['attacker_owner_id'], $facts['attacker_character_id']) && $facts['attacker_character_id'] !== '') {
            $attacker = self::championName($s, (int) $facts['attacker_owner_id'], (string) $facts['attacker_character_id'], $viewerId, $spectator);
            $defender = self::championName($s, (int) $facts['defender_owner_id'], (string) $facts['defender_character_id'], $viewerId, $spectator);
            $names = [$attacker, $defender];
            $values = [
                'n' => $turn,
                'attacker' => $attacker,
                'defender' => $defender,
                'damage' => $facts['damage'] ?? '',
            ];
        }
        if ($rule === 'decisive_defeat' && ($facts['consequence'] ?? null)) {
            $values['consequence'] = LessonCatalog::CONSEQUENCE[$facts['consequence']] ?? '';
            $template = LessonCatalog::DECIDING['decisive_defeat_consequence'];
        } elseif ($rule === 'flanking_hit' && ($facts['flank'] ?? null) === 'backstab') {
            $template = LessonCatalog::DECIDING['flanking_backstab'];
        } elseif ($rule === 'resign' || $rule === 'timeout') {
            $values['name'] = Chronicle::playerName($s, isset($facts['player_id']) ? (int) $facts['player_id'] : null);
            $template = LessonCatalog::DECIDING[$rule];
        } else {
            $template = LessonCatalog::DECIDING[$rule] ?? LessonCatalog::DECIDING['worthy'];
        }

        return [
            'rule' => $rule,
            'text' => Chronicle::fill($template, $values),
            'turn' => $turn,
            'names' => $names,
        ];
    }

    /**
     * @return array{rule: string, text: string}|null
     */
    private static function lesson(array $s, ?int $viewerId, bool $spectator): ?array
    {
        $winnerId = $s['winner_id'] ?? null;
        if ($spectator || $viewerId === null || $winnerId === null || (int) $winnerId === (int) $viewerId) {
            return null;
        }
        $rear = 0;
        foreach ($s['story']['hits'] ?? [] as $hit) {
            if ((int) ($hit['defender_owner_id'] ?? 0) === (int) $viewerId && ($hit['side'] ?? null) === 'rear') {
                $rear++;
            }
        }
        if ($rear >= 2) {
            return ['rule' => 'rear_hits', 'text' => LessonCatalog::END_LESSON['rear_hits']];
        }
        $blocked = 0;
        foreach ($s['story']['blocks'] ?? [] as $block) {
            if ((int) ($block['attacker_owner_id'] ?? 0) === (int) $viewerId) {
                $blocked++;
            }
        }
        if ($blocked >= 2) {
            return ['rule' => 'blocked', 'text' => LessonCatalog::END_LESSON['blocked']];
        }
        foreach ($s['story']['defeats'] ?? [] as $defeat) {
            if ((int) ($defeat['defender_owner_id'] ?? 0) === (int) $viewerId && (int) ($defeat['defender_recovery'] ?? 0) > 0) {
                return ['rule' => 'resting_defeat', 'text' => LessonCatalog::END_LESSON['resting_defeat']];
            }
        }

        return ['rule' => 'fallback', 'text' => LessonCatalog::END_LESSON['fallback']];
    }

    private static function decisiveDefeat(array $s, mixed $winnerId): ?array
    {
        if ($winnerId === null) {
            return null;
        }
        $winnerId = (int) $winnerId;
        $defeats = array_values($s['story']['defeats'] ?? []);
        $chosen = null;
        foreach ($defeats as $index => $defeat) {
            if (! self::ledAfter($defeat, $winnerId)) {
                continue;
            }
            $holds = true;
            foreach (array_slice($defeats, $index) as $later) {
                if (! self::ledAfter($later, $winnerId)) {
                    $holds = false;
                    break;
                }
            }
            if ($holds) {
                $chosen = $defeat;
                break;
            }
        }

        return is_array($chosen) ? $chosen : null;
    }

    private static function ledAfter(array $defeat, int $winnerId): bool
    {
        $standing = $defeat['standing'] ?? [];
        $winner = (int) ($standing[$winnerId] ?? 0);
        $other = 0;
        foreach ($standing as $id => $count) {
            if ((int) $id !== $winnerId) {
                $other = (int) $count;
            }
        }

        return $winner > $other;
    }

    private static function biggestHit(array $s): ?array
    {
        $best = null;
        foreach ($s['story']['hits'] ?? [] as $hit) {
            if (! is_array($hit) || (int) ($hit['damage'] ?? 0) <= 0) {
                continue;
            }
            if ($best === null || (int) $hit['damage'] > (int) $best['damage']) {
                $best = $hit;
            }
        }

        return $best;
    }

    private static function isFlanking(array $hit): bool
    {
        return ($hit['side'] ?? null) === 'rear' || ($hit['skill'] ?? null) === 'Backstab';
    }

    /**
     * @return array<string, mixed>
     */
    private static function hitFacts(string $rule, array $hit): array
    {
        $flank = ($hit['side'] ?? null) === 'rear' ? 'rear' : (($hit['skill'] ?? null) === 'Backstab' ? 'backstab' : null);

        return [
            'rule' => $rule,
            'turn' => (int) ($hit['turn'] ?? 0),
            'damage' => (int) $hit['damage'],
            'flank' => $flank,
            'attacker_owner_id' => (int) $hit['attacker_owner_id'],
            'attacker_character_id' => (string) $hit['attacker_character_id'],
            'defender_owner_id' => (int) $hit['defender_owner_id'],
            'defender_character_id' => (string) $hit['defender_character_id'],
        ];
    }

    private static function championName(array $s, int $ownerId, string $characterId, ?int $viewerId, bool $spectator): string
    {
        $champion = CharacterCatalog::get($characterId)['name'];
        if ($spectator || $viewerId === null) {
            return Chronicle::possessive(Chronicle::playerName($s, $ownerId)).' '.$champion;
        }
        if ($ownerId === (int) $viewerId) {
            return 'your '.$champion;
        }

        return 'their '.$champion;
    }

    /**
     * @return array{attacker_owner_id: int, attacker_character_id: string, defender_owner_id: int, defender_character_id: string}
     */
    private static function actorFacts(array $attacker, array $defender): array
    {
        return [
            'attacker_owner_id' => (int) $attacker['owner_id'],
            'attacker_character_id' => (string) ($attacker['character_id'] ?? ''),
            'defender_owner_id' => (int) $defender['owner_id'],
            'defender_character_id' => (string) ($defender['character_id'] ?? ''),
        ];
    }

    private static function livingCount(array $s, int $ownerId): int
    {
        return count(array_filter(
            $s['units'] ?? [],
            fn ($unit) => (int) ($unit['owner_id'] ?? 0) === $ownerId && ($unit['hp'] ?? 0) > 0,
        ));
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
