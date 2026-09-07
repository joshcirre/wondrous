<?php

use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('game.{id}', fn (User $user, string $id) => Game::find($id)?->hasPlayer($user->id) ?? false);
