<?php

namespace App\Events;

use App\States\MatchState;
use Thunk\Verbs\Attributes\Autodiscovery\StateId;
use Thunk\Verbs\Event;

/** An accepted command with resolved outcomes. Replays never roll the dice again. */
class MatchAdvanced extends Event
{
    #[StateId(MatchState::class)]
    public string $match_id;

    public ?int $actor_id;

    public string $action;

    public array $payload;

    public array $result;

    public int $version;

    public function apply(MatchState $state): void
    {
        $state->board = $this->result;
        $state->version = $this->version;
    }
}
