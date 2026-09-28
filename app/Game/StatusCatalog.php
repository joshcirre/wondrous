<?php

namespace App\Game;

/** Server copy and amounts for board status badges. Durations come from unit state. */
final class StatusCatalog
{
    public static function all(): array
    {
        return [
            'stun' => [
                'id' => 'stun',
                'name' => 'Stunned',
                'amount' => null,
                'label' => 'Stunned: skips {turns} {turnWord}',
            ],
            'root' => [
                'id' => 'root',
                'name' => 'Rooted',
                'amount' => null,
                'label' => 'Rooted: cannot move, {turns} {turnWord}',
            ],
            'burn' => [
                'id' => 'burn',
                'name' => 'Burning',
                'amount' => 8,
                'label' => 'Burning: {amount} damage at turn end, {turns} {turnWord}',
            ],
            'ward' => [
                'id' => 'ward',
                'name' => 'Warded',
                'amount' => 12,
                'label' => 'Warded: +{amount} armor, {turns} {turnWord}',
            ],
        ];
    }

    public static function amount(string $id): int
    {
        $amount = self::all()[$id]['amount'] ?? null;
        if (! is_int($amount)) {
            throw new GameRuleException('Status has no amount.');
        }

        return $amount;
    }
}
