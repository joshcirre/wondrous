<?php

namespace App\States;

use Thunk\Verbs\State;

class MatchState extends State
{
    public array $board = [];

    public int $version = 0;
}
