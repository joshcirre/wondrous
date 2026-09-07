<?php

namespace Tests\Feature;

use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use App\States\MatchState;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;
use Thunk\Verbs\Lifecycle\StateManager;

class CorrespondenceReplayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->travelTo(now()->startOfSecond());
        $this->app->bind(GameEngine::class, fn () => new GameEngine(fn ($min, $max) => $min));
    }

    private function createMatch(User $user, string $mode = 'correspondence'): Game
    {
        $response = $this->actingAs($user)->postJson('/games', ['name' => 'A patient contest', 'ranked' => true, 'time_control' => $mode])->assertCreated();

        return Game::where('code', $response->json('code'))->firstOrFail();
    }

    private function act(Game $game, User $user, string $type, array $payload = []): Game
    {
        $game->refresh();
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();

        return $game->refresh();
    }

    private function deployment(User $host, User $guest): Game
    {
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        for ($i = 0; $i < 12; $i++) {
            $actor = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $actor, 'draft', ['character_id' => $game->state['offers'][$actor->id][0]]);
        }

        return $game;
    }

    private function battle(User $host, User $guest): Game
    {
        $game = $this->deployment($host, $guest);
        $this->act($game, $host, 'ready');

        return $this->act($game, $guest, 'ready');
    }

    public function test_multiple_correspondence_games_and_one_live_game_have_separate_limits(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $one = $this->createMatch($host);
        $two = $this->createMatch($host);
        $live = $this->createMatch($host, 'live');
        self::assertNull($one->turn_due_at);
        self::assertFalse($one->ranked);
        self::assertTrue($live->ranked);
        $this->actingAs($host)->postJson('/games', ['name' => 'Extra live', 'ranked' => false])->assertUnprocessable();
        $this->act($one, $guest, 'join');
        $this->act($two, $guest, 'join');
        $this->act($live, $guest, 'join');
        self::assertNull($live->turn_due_at);
        self::assertSame(now()->addDay()->toISOString(), $one->turn_due_at->toISOString());
        $this->actingAs($host)->get('/')->assertInertia(fn (Assert $page) => $page->component('Lobby')->where('active', $live->code)->has('active_games', 3));
        $anotherHost = User::factory()->create();
        $anotherLive = $this->createMatch($anotherHost, 'live');
        $this->actingAs($guest)->postJson('/games/'.$anotherLive->code.'/actions', ['type' => 'join', 'version' => $anotherLive->version])->assertUnprocessable();
    }

    public function test_each_pick_starts_a_new_deadline_but_battle_partial_actions_do_not(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        $this->travel(3)->hours();
        $this->act($game, $host, 'draft', ['character_id' => $game->state['offers'][$host->id][0]]);
        self::assertSame(now()->addDay()->toISOString(), $game->turn_due_at->toISOString());
        for ($i = 1; $i < 12; $i++) {
            $actor = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $actor, 'draft', ['character_id' => $game->state['offers'][$actor->id][0]]);
        }
        $this->act($game, $host, 'ready');
        $this->act($game, $guest, 'ready');
        $due = $game->turn_due_at->toISOString();
        $this->travel(2)->hours();
        $this->act($game, $host, 'move', ['unit_id' => $host->id.'-ranger', 'x' => 2, 'y' => 4]);
        self::assertSame($due, $game->turn_due_at->toISOString());
        $this->act($game, $host, 'attack', ['unit_id' => $host->id.'-ranger', 'target_id' => $guest->id.'-ranger']);
        self::assertSame($due, $game->turn_due_at->toISOString());
        $this->act($game, $host, 'face', ['unit_id' => $host->id.'-ranger', 'facing' => 'east']);
        self::assertSame($due, $game->turn_due_at->toISOString());
        $this->act($game, $host, 'end_turn');
        self::assertSame(now()->addDay()->toISOString(), $game->turn_due_at->toISOString());
        self::assertNotSame($due, $game->turn_due_at->toISOString());
    }

    public function test_exact_deadline_rejects_command_and_commits_one_system_timeout(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        $version = $game->version;
        $this->travelTo($game->turn_due_at);
        $this->actingAs($host)->postJson('/games/'.$game->code.'/actions', ['type' => 'draft', 'version' => $version, 'character_id' => $game->state['offers'][$host->id][0]])->assertConflict();
        $game->refresh();
        self::assertSame('finished', $game->phase);
        self::assertSame($guest->id, $game->state['winner_id']);
        self::assertSame('timeout', $game->state['finish_reason']);
        self::assertSame($version + 1, $game->version);
        self::assertNull($game->turn_due_at);
        self::assertSame([], $game->state['draft_picks'][$host->id]);
        $record = DB::table('game_records')->where('game_id', $game->id)->orderByDesc('version')->first();
        self::assertNull($record->actor_id);
        self::assertSame('timeout', $record->action);
        $this->actingAs($guest)->getJson('/games/'.$game->code.'/state')->assertOk();
        $this->artisan('games:expire')->assertSuccessful();
        self::assertSame($version + 1, $game->fresh()->version);
        $this->assertDatabaseCount('reward_transactions', 0);
        self::assertSame(1000, $host->fresh()->rating);
    }

    public function test_both_unready_deployment_players_draw_when_scheduler_expires_them(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->deployment($host, $guest);
        $this->travelTo($game->turn_due_at);
        $this->artisan('games:expire')->expectsOutput('Expired 1 correspondence matches.')->assertSuccessful();
        $game->refresh();
        self::assertSame('finished', $game->phase);
        self::assertNull($game->state['winner_id']);
        self::assertSame([$host->id, $guest->id], $game->state['expired_player_ids']);
        self::assertNotNull($game->settled_at);
        $this->assertDatabaseCount('reward_transactions', 0);
    }

    public function test_deployment_ready_and_reposition_do_not_extend_other_players_deadline(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->deployment($host, $guest);
        $due = $game->turn_due_at->toISOString();
        $this->travel(4)->hours();
        $this->act($game, $host, 'deploy', ['unit_id' => $host->id.'-warden', 'x' => 0, 'y' => 6]);
        $this->act($game, $host, 'ready');
        self::assertSame($due, $game->turn_due_at->toISOString());
        $this->travelTo($game->turn_due_at);
        $this->actingAs($host)->getJson('/games/'.$game->code.'/state')->assertOk()->assertJsonPath('game.state.winner_id', $host->id);
        self::assertSame([$guest->id], $game->fresh()->state['expired_player_ids']);
    }

    public function test_battle_timeout_settles_once_without_rating_and_reconstitutes_from_events(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->battle($host, $guest);
        for ($i = 0; $i < 8; $i++) {
            $this->act($game, $game->state['turn_player_id'] === $host->id ? $host : $guest, 'end_turn');
        }
        $this->travelTo($game->turn_due_at);
        $this->actingAs($guest)->getJson('/games/'.$game->code.'/state')->assertOk();
        $game->refresh();
        self::assertSame($guest->id, $game->state['winner_id']);
        self::assertSame(1000, $host->fresh()->rating);
        self::assertSame(1000, $guest->fresh()->rating);
        self::assertSame(250, $guest->fresh()->currency);
        self::assertSame(180, $host->fresh()->currency);
        self::assertSame(1, $guest->fresh()->wins);
        $this->artisan('games:expire')->assertSuccessful();
        $this->actingAs($host)->getJson('/games/'.$game->code.'/state')->assertOk();
        $this->assertDatabaseCount('reward_transactions', 2);
        app(StateManager::class)->reset(include_storage: true);
        self::assertSame($game->state, MatchState::loadOrFail($game->id)->board);
    }

    public function test_finished_replay_is_participant_only_private_and_faithful_to_records(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->battle($host, $guest);
        $this->actingAs($host)->getJson('/games/'.$game->code.'/replay-data')->assertUnprocessable();
        $this->act($game, $host, 'move', ['unit_id' => $host->id.'-ranger', 'x' => 2, 'y' => 4]);
        $this->act($game, $host, 'attack', ['unit_id' => $host->id.'-ranger', 'target_id' => $guest->id.'-ranger']);
        $this->act($game, $guest, 'resign');
        $data = $this->actingAs($host)->getJson('/games/'.$game->code.'/replay-data')->assertOk()->json();
        self::assertCount($game->version, $data['frames']);
        foreach ($data['frames'] as $frame) {
            foreach (['offers', 'pool', 'loadouts', 'reward_candidates'] as $private) {
                self::assertArrayNotHasKey($private, $frame['state']);
            }
            $record = DB::table('game_records')->where('game_id', $game->id)->where('version', $frame['version'])->first();
            self::assertSame(Game::replayState(json_decode($record->state, true)), $frame['state']);
            if ($frame['state']['phase'] === 'deployment') {
                self::assertCount(12, $frame['state']['units']);
            }
        }
        self::assertSame(Game::replayState($game->state), $data['game']['state']);
        $this->actingAs($guest)->get('/games/'.$game->code.'/replay')->assertInertia(fn (Assert $page) => $page->component('Replay', false)->has('frames', $game->version));
        $this->actingAs(User::factory()->create())->getJson('/games/'.$game->code.'/replay-data')->assertForbidden();
        $this->get('/games/'.$game->code.'/replay')->assertForbidden();
    }

    public function test_lobby_read_expires_overdue_games_but_live_games_have_no_deadline(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $game = $this->createMatch($host);
        $live = $this->createMatch($host, 'live');
        $this->act($game, $guest, 'join');
        $this->act($live, $guest, 'join');
        $this->travel(2)->days();
        $this->actingAs($host)->get('/')->assertInertia(fn (Assert $page) => $page->component('Lobby')->has('active_games', 1)->where('active', $live->code));
        self::assertSame('finished', $game->fresh()->phase);
        self::assertSame('draft', $live->fresh()->phase);
        self::assertNull($live->fresh()->turn_due_at);
    }
}
