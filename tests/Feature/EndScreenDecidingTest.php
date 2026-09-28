<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Game\DecidingMoment;
use App\Game\GameEngine;
use App\Game\LessonCatalog;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
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
            ->assertInertia(fn (Assert $page) => $page
                ->component('Game')
                ->where('game.state.deciding.rule', 'resign')
                ->where('game.state.deciding.text', 'Rowan resigned.')
                ->where('game.state.deciding.lesson', null));

        $this->actingAs($host)->get('/games/'.$game->code)
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Game')
                ->where('game.state.deciding.text', 'Rowan resigned.')
                ->where('game.state.deciding.lesson.rule', 'fallback')
                ->where('game.state.deciding.lesson.text', LessonCatalog::END_LESSON['fallback']));
    }

    public function test_participants_see_perspective_names_and_only_the_loser_gets_a_lesson(): void
    {
        $host = User::factory()->create(['name' => 'Rowan']);
        $guest = User::factory()->create(['name' => 'Elara']);
        $this->ensureProgressionUnlocked($host);
        $this->ensureProgressionUnlocked($guest);
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Lead line', 'ranked' => false])->json('code'))->firstOrFail();
        $this->act($game, $guest, 'join');
        $state = $game->state;
        $state['phase'] = 'finished';
        $state['winner_id'] = $host->id;
        $state['finish_reason'] = 'elimination';
        $state['turn_number'] = 3;
        $state['story'] = [
            'defeats' => [[
                'turn' => 3,
                'attacker_owner_id' => $host->id,
                'attacker_character_id' => 'warden',
                'defender_owner_id' => $guest->id,
                'defender_character_id' => 'cleric',
                'defender_recovery' => 0,
                'only_healer' => true,
                'standing' => [$host->id => 6, $guest->id => 5],
            ]],
        ];
        $state['deciding'] = DecidingMoment::resolve($state);
        $game->state = $state;
        $game->phase = 'finished';
        $game->save();

        $this->actingAs($host)->get('/games/'.$game->code)
            ->assertOk()
            ->assertDontSee('What decided it', false)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Game')
                ->where('game.state.deciding.rule', 'decisive_defeat')
                ->where('game.state.deciding.text', 'Turn 3: your Iron Warden defeated their Sun Cleric, leaving them without healing.')
                ->where('game.state.deciding.lesson', null));

        $this->actingAs($guest)->get('/games/'.$game->code)
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Game')
                ->where('game.state.deciding.text', 'Turn 3: their Iron Warden defeated your Sun Cleric, leaving them without healing.')
                ->where('game.state.deciding.lesson.rule', 'fallback'));
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
