<?php

namespace App\Game;

final class BoardCues
{
    /**
     * @return array{breakdown: bool, skill_strip: bool}
     */
    public static function visibility(bool $reducedBoard, int $turnNumber): array
    {
        if (! $reducedBoard) {
            return ['breakdown' => true, 'skill_strip' => true];
        }

        return [
            'breakdown' => $turnNumber > 2,
            'skill_strip' => $turnNumber > 3,
        ];
    }
}
