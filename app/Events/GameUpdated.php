<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class GameUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    public function __construct(public string $gameId, public int $version) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('game.'.$this->gameId)];
    }

    public function broadcastAs(): string
    {
        return 'game.updated';
    }

    public function broadcastWith(): array
    {
        return ['version' => $this->version];
    }
}
