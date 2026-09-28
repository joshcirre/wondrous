<?php

namespace App\Game;

/** Owner-qualified, plain-language chronicle copy. Brief can change the templates here. */
final class Chronicle
{
    public const HIT = '{name}: Hit, {chance}% chance.';

    public const MISS = '{name}: Miss, {chance}% chance.';

    public const BLOCKED = '{name}: Blocked, {chance}% chance.';

    public const DAMAGE = '{attacker} dealt {damage} damage to {defender}.';

    public const DEFEATED = '{name} was defeated.';

    public const MOVED = '{name} moved.';

    public const SKILL = '{name} used {skill}.';

    public const BURN = '{name} suffered {amount} burn damage.';

    public const DRAFTED = '{name} drafted {champion}.';

    public const RESIGNED = '{name} resigned.';

    public const ELIMINATION = '{name} wins by elimination.';

    public const TIMEOUT_WIN = '{name} ran out of time.';

    public const TIMEOUT_DRAW = 'Both sides ran out of time.';

    public const HERALD = 'The fallen banner grants the opposing team 12 mana.';

    public static function playerName(array $s, ?int $id): string
    {
        if ($id === null) {
            return 'The arena';
        }
        foreach ($s['players'] ?? [] as $player) {
            if ((int) $player['id'] === (int) $id) {
                return $player['name'];
            }
        }

        return $id === ComputerOpponent::ID ? 'Practice opponent' : 'Commander';
    }

    public static function possessive(string $name): string
    {
        return $name.(str_ends_with(mb_strtolower($name), 's') ? "'" : "'s");
    }

    public static function unitName(array $s, array $unit): string
    {
        $owner = self::playerName($s, (int) $unit['owner_id']);
        $champion = CharacterCatalog::get($unit['character_id'])['name'];

        return self::possessive($owner).' '.$champion;
    }

    public static function fill(string $template, array $values): string
    {
        $replacements = [];
        foreach ($values as $key => $value) {
            $replacements['{'.$key.'}'] = (string) $value;
        }

        return strtr($template, $replacements);
    }
}
