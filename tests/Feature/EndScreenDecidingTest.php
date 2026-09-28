<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EndScreenDecidingTest extends TestCase
{
    use RefreshDatabase;

    private function act(Game $game, User $user, string $type, array $payload = []): Game
    {
        $game->refresh();
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();

        return $game->refresh();
    }

    public function test_resign_puts_a_deciding_line_on_the_end_screen(): void
    {
        $this->app->bind(GameEngine::class, fn () => new GameEngine(fn ($min, $max) => $min));
        $host = User::factory()->create(['name' => 'Rowan']);
        $guest = User::factory()->create(['name' => 'Elara']);
        $this->ensureProgressionUnlocked($host);
        $this->ensureProgressionUnlocked($guest);
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Resign line', 'ranked' => false])->json('code'))->firstOrFail();
        $this->act($game, $guest, 'join');
        $this->act($game, $host, 'resign');

        self::assertSame('resign', $game->state['deciding']['rule']);
        self::assertSame('Rowan resigned.', $game->state['deciding']['text']);
        self::assertSame('Rowan resigned.', $game->state['log'][array_key_last($game->state['log'])]['text']);

        $this->actingAs($guest)->get('/games/'.$game->code)
            ->assertOk()
            ->assertSee('What decided it', false)
            ->assertSee('Rowan resigned.', false);
    }

    public function test_practice_replay_names_the_computer_on_null_actor_frames(): void
    {
        $user = User::factory()->create(['name' => 'Rowan']);
        $this->ensureProgressionUnlocked($user);
        $code = $this->actingAs($user)->postJson('/games', ['name' => 'Practice chronicle', 'ranked' => false, 'mode' => 'practice'])->assertCreated()->json('code');
        $game = Game::where('code', $code)->firstOrFail();
        $this->act($game, $user, 'resign');

        $replay = $this->actingAs($user)->getJson('/games/'.$game->code.'/replay-data')->assertOk()->json();
        $join = collect($replay['frames'])->first(fn ($frame) => $frame['action'] === 'join');
        self::assertNotNull($join);
        self::assertNull($join['actor_id']);
        self::assertSame(ComputerOpponent::ID, $join['state']['players'][1]['id'] ?? null);
        self::assertSame('Practice opponent', $join['state']['players'][1]['name'] ?? null);

        $this->actingAs($user)->get('/games/'.$game->code.'/replay')
            ->assertOk()
            ->assertSee('Practice opponent', false);
    }
}
