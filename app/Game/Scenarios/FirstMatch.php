<?php

namespace App\Game\Scenarios;

/** Fixed first-match squads, tiles and facings. Brief can edit this file alone. */
final class FirstMatch
{
    public const KEY = 'first_match';

    /** Champions the computer must never field in this scenario. */
    public const EXCLUDED = ['herald', 'pyromancer', 'frostweaver', 'arcanist', 'pikeman'];

    /**
     * Host squad: the starter six standard champions (matches 1 and 2).
     * Violet Arcanist stands where the Pikeman did, so nobody here can root.
     * Knight starts in range of the rear-facing computer Warden.
     *
     * @return list<array{character_id: string, x: int, y: int, facing: string}>
     */
    public static function playerSquad(): array
    {
        return [
            ['character_id' => 'arcanist', 'x' => 1, 'y' => 7, 'facing' => 'north'],
            ['character_id' => 'warden', 'x' => 2, 'y' => 7, 'facing' => 'north'],
            ['character_id' => 'knight', 'x' => 3, 'y' => 5, 'facing' => 'north'],
            ['character_id' => 'ranger', 'x' => 4, 'y' => 7, 'facing' => 'north'],
            ['character_id' => 'cleric', 'x' => 5, 'y' => 7, 'facing' => 'north'],
            ['character_id' => 'rogue', 'x' => 6, 'y' => 6, 'facing' => 'north'],
        ];
    }

    /**
     * Computer squad: no aura, burn, root or Arcane Lance.
     *
     * @return list<array{character_id: string, x: int, y: int, facing: string}>
     */
    public static function computerSquad(): array
    {
        return [
            ['character_id' => 'ranger', 'x' => 1, 'y' => 1, 'facing' => 'south'],
            ['character_id' => 'druid', 'x' => 2, 'y' => 1, 'facing' => 'south'],
            ['character_id' => 'warden', 'x' => 3, 'y' => 3, 'facing' => 'north'],
            ['character_id' => 'cleric', 'x' => 4, 'y' => 1, 'facing' => 'south'],
            ['character_id' => 'rogue', 'x' => 5, 'y' => 1, 'facing' => 'south'],
            ['character_id' => 'knight', 'x' => 6, 'y' => 3, 'facing' => 'south'],
        ];
    }

    /**
     * Player's intended opening. Turn 3 is a basic rear attack, not Backstab,
     * so Shield Bash on turn 4 is the first skill they see.
     *
     * @return array<int, list<array{type: string, character_id: string, x?: int, y?: int}>>
     */
    public static function playerScript(): array
    {
        return [
            3 => [
                ['type' => 'move', 'character_id' => 'rogue', 'x' => 6, 'y' => 4],
                ['type' => 'attack', 'character_id' => 'rogue'],
            ],
        ];
    }

    /**
     * Scripted computer commands for its first three turns, still applied through the engine.
     * Turn 1 retreats the wounded Warden (does not punish the resting attacker).
     * Turn 2 turns the Knight's back toward the player's Rogue.
     * Turn 3 steps the Druid home.
     *
     * @return array<int, list<array{type: string, character_id: string, x?: int, y?: int, facing?: string}>>
     */
    public static function computerScript(): array
    {
        return [
            1 => [
                ['type' => 'move', 'character_id' => 'warden', 'x' => 4, 'y' => 3],
            ],
            2 => [
                ['type' => 'face', 'character_id' => 'knight', 'facing' => 'north'],
            ],
            3 => [
                ['type' => 'move', 'character_id' => 'druid', 'x' => 2, 'y' => 0],
            ],
        ];
    }
}
