<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class LobbyUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    public function broadcastOn(): array
    {
        return [new Channel('lobby')];
    }

    public function broadcastAs(): string
    {
        return 'lobby.updated';
    }

    public function broadcastWith(): array
    {
        return ['refresh' => true];
    }
}
