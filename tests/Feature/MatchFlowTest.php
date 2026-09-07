<?php

namespace Tests\Feature;

use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use App\States\MatchState;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Thunk\Verbs\Lifecycle\StateManager;

class MatchFlowTest extends TestCase
{
    use RefreshDatabase;

    private function users(): array
    {
        return [User::factory()->create(['name' => 'Alice']), User::factory()->create(['name' => 'Bob'])];
    }

    private function createMatch(User $host): Game
    {
        $response = $this->actingAs($host)->postJson('/games', ['name' => 'Test arena', 'ranked' => true])->assertCreated();

        return Game::where('code', $response->json('code'))->firstOrFail();
    }

    private function act(Game $game, User $user, string $type, array $payload = []): Game
    {
        $game->refresh();
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();

        return $game->refresh();
    }

    private function battle(User $host, User $guest): Game
    {
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        for ($i = 0; $i < 12; $i++) {
            $player = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $player, 'draft', ['character_id' => $game->state['offers'][$player->id][0]]);
        }
        self::assertSame('deployment', $game->phase);
        $this->act($game, $host, 'ready');

        return $this->act($game, $guest, 'ready');
    }

    public function test_complete_http_match_flow_persists_events_and_guards_versions_and_privacy(): void
    {
        [$host,$guest] = $this->users();
        $outsider = User::factory()->create();
        $game = $this->createMatch($host);
        $this->actingAs($guest)->getJson('/games/'.$game->code.'/state')->assertOk();
        $stale = $game->version;
        $this->act($game, $guest, 'join');
        $this->actingAs($outsider)->getJson('/games/'.$game->code.'/state')->assertForbidden();
        $this->actingAs($outsider)->postJson('/games/'.$game->code.'/actions', ['type' => 'resign', 'version' => $game->version])->assertForbidden();
        $this->actingAs($host)->postJson('/games/'.$game->code.'/actions', ['type' => 'draft', 'version' => $stale, 'character_id' => $game->state['offers'][$host->id][0]])->assertConflict();
        $state = $this->actingAs($guest)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game.state');
        self::assertArrayNotHasKey($host->id, $state['offers']);
        for ($i = 0; $i < 12; $i++) {
            $player = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $player, 'draft', ['character_id' => $game->state['offers'][$player->id][0]]);
        }
        $state = $this->actingAs($host)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game.state');
        self::assertCount(6, $state['units']);
        $unit = $state['units'][0];
        $this->act($game, $host, 'deploy', ['unit_id' => $unit['id'], 'x' => 0, 'y' => 6]);
        $this->act($game, $host, 'ready');
        $this->act($game, $guest, 'ready');
        self::assertSame('battle', $game->phase);
        $this->act($game, $host, 'move', ['unit_id' => $unit['id'], 'x' => 0, 'y' => 5]);
        $this->actingAs($host)->postJson('/games/'.$game->code.'/actions', ['type' => 'move', 'version' => $game->version, 'unit_id' => $unit['id'], 'x' => 0, 'y' => 4])->assertUnprocessable();
        $this->act($game, $host, 'end_turn');
        self::assertSame($guest->id, $game->state['turn_player_id']);
        $this->assertDatabaseCount('game_records', $game->version);
        $this->assertDatabaseCount('verb_events', $game->version);
        $last = DB::table('game_records')->where('game_id', $game->id)->orderByDesc('version')->first();
        self::assertSame($game->state, json_decode($last->state, true));
        $event = DB::table('verb_events')->orderByDesc('id')->first();
        self::assertStringContainsString('MatchAdvanced', $event->type);
        self::assertStringContainsString('end_turn', $event->data);
    }

    public function test_finished_match_settles_rating_currency_and_claim_once(): void
    {
        $this->app->bind(GameEngine::class, fn () => new GameEngine(fn ($min, $max) => $max));
        [$host,$guest] = $this->users();
        $game = $this->battle($host, $guest);
        for ($i = 0; $i < 8; $i++) {
            $this->act($game, $game->state['turn_player_id'] === $host->id ? $host : $guest, 'end_turn');
        }
        $beforeHost = $host->fresh();
        $beforeGuest = $guest->fresh();
        $this->act($game, $guest, 'resign');
        self::assertSame('finished', $game->phase);
        self::assertSame($host->id, $game->state['winner_id']);
        self::assertSame($beforeHost->rating + 16, $host->fresh()->rating);
        self::assertSame($beforeGuest->rating - 16, $guest->fresh()->rating);
        self::assertSame($beforeHost->currency + 100, $host->fresh()->currency);
        self::assertSame($beforeGuest->currency + 30, $guest->fresh()->currency);
        $this->actingAs($guest)->postJson('/games/'.$game->code.'/actions', ['type' => 'resign', 'version' => $game->version])->assertUnprocessable();
        $this->assertDatabaseCount('reward_transactions', 2);
        $candidate = $game->state['reward_candidates'][$host->id][0];
        $this->actingAs($guest)->postJson('/games/'.$game->code.'/claim', ['character_id' => $candidate])->assertForbidden();
        $this->actingAs($host)->postJson('/games/'.$game->code.'/claim', ['character_id' => $candidate])->assertOk();
        self::assertContains($candidate, $host->fresh()->collection);
        $this->actingAs($host)->postJson('/games/'.$game->code.'/claim', ['character_id' => $candidate])->assertUnprocessable();
        $this->assertDatabaseCount('reward_transactions', 3);
    }

    public function test_short_forfeit_does_not_reward_currency_or_claim(): void
    {
        [$host,$guest] = $this->users();
        $game = $this->battle($host, $guest);
        $before = $host->fresh()->currency;
        $this->act($game, $guest, 'resign');
        self::assertSame($before, $host->fresh()->currency);
        $this->actingAs($host)->postJson('/games/'.$game->code.'/claim', ['character_id' => 'revenant'])->assertUnprocessable();
    }

    public function test_collection_duplicate_refund_and_loadout_validation(): void
    {
        [$host] = $this->users();
        $host->forceFill(['currency' => 200, 'collection' => ['pyromancer', 'frostweaver', 'druid', 'revenant']])->save();
        $response = $this->actingAs($host)->postJson('/collection/pull')->assertOk()->assertJsonPath('duplicate', true)->assertJsonPath('currency', 140);
        self::assertCount(4, $response->json('owned'));
        $this->postJson('/collection/loadout', ['cards' => ['druid', 'revenant']])->assertRedirect();
        self::assertSame(['druid', 'revenant'], $host->fresh()->loadout);
        $this->postJson('/collection/loadout', ['cards' => ['warden']])->assertUnprocessable();
        $this->postJson('/collection/loadout', ['cards' => ['druid', 'druid']])->assertUnprocessable();
        $host->forceFill(['currency' => 20])->save();
        $this->postJson('/collection/pull')->assertUnprocessable();
    }

    public function test_guest_cannot_create_game_and_registration_login_logout_work(): void
    {
        $this->postJson('/games', ['name' => 'No', 'ranked' => false])->assertUnauthorized();
        $this->post('/register', ['name' => 'New player', 'username' => 'newplayer', 'email' => 'NEW@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'])->assertRedirect('/');
        $user = User::where('email', 'new@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
        $this->postJson('/register', ['name' => 'Duplicate', 'username' => 'anotherplayer', 'email' => 'NEW@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'])->assertUnprocessable();
        $this->postJson('/login', ['username' => 'newplayer', 'password' => 'wrong'])->assertUnprocessable();
        $this->post('/login', ['username' => 'NEWPLAYER', 'password' => 'secret-pass'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_private_broadcast_auth_only_allows_match_participants(): void
    {
        [$host,$guest] = $this->users();
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        config(['broadcasting.default' => 'pusher', 'broadcasting.connections.pusher' => ['driver' => 'pusher', 'key' => 'test-key', 'secret' => 'test-secret', 'app_id' => 'test-app', 'options' => ['cluster' => 'mt1', 'useTLS' => false]]]);
        // Channel callbacks belong to a broadcaster instance: register on the test signer.
        require base_path('routes/channels.php');
        $request = ['socket_id' => '123.456', 'channel_name' => 'private-game.'.$game->id];
        $this->actingAs($host)->postJson('/broadcasting/auth', $request)->assertOk()->assertJsonStructure(['auth']);
        $this->actingAs($guest)->postJson('/broadcasting/auth', $request)->assertOk();
        $this->actingAs(User::factory()->create())->postJson('/broadcasting/auth', $request)->assertForbidden();
    }

    public function test_rejected_commands_leave_projection_and_event_history_unchanged(): void
    {
        [$host, $guest] = $this->users();
        $game = $this->createMatch($host);
        $this->act($game, $guest, 'join');
        $version = $game->version;
        $this->actingAs($host)->postJson('/games/'.$game->code.'/actions', ['type' => 'draft', 'version' => $version, 'character_id' => 'not-a-character'])->assertUnprocessable();
        self::assertSame($version, $game->fresh()->version);
        $this->assertDatabaseCount('game_records', $version);
        $this->assertDatabaseCount('verb_events', $version);
        $this->actingAs($host)->postJson('/games', ['name' => 'Another arena', 'ranked' => true])->assertUnprocessable();
        $this->assertDatabaseCount('games', 1);
    }

    public function test_verbs_rebuilds_board_without_snapshots_or_rerolling_combat(): void
    {
        $this->app->bind(GameEngine::class, fn () => new GameEngine(fn ($min, $max) => $min));
        [$host, $guest] = $this->users();
        $game = $this->battle($host, $guest);
        $this->act($game, $host, 'move', ['unit_id' => $host->id.'-ranger', 'x' => 2, 'y' => 4]);
        $this->act($game, $host, 'end_turn');
        $this->act($game, $guest, 'move', ['unit_id' => $guest->id.'-ranger', 'x' => 2, 'y' => 3]);
        $this->act($game, $guest, 'end_turn');
        $this->act($game, $host, 'attack', ['unit_id' => $host->id.'-ranger', 'target_id' => $guest->id.'-ranger']);
        $expected = $game->state;
        self::assertStringContainsString('accuracy roll', implode(' ', array_column($expected['log'], 'text')));
        $eventsBefore = DB::table('verb_events')->count();
        $this->app->bind(GameEngine::class, fn () => new GameEngine(function () {
            throw new \RuntimeException('Replay must never use randomness');
        }));
        app(StateManager::class)->reset(include_storage: true);
        $this->assertDatabaseCount('verb_snapshots', 0);
        $rebuilt = MatchState::loadOrFail($game->id);
        self::assertSame($expected, $rebuilt->board);
        self::assertSame($game->version, $rebuilt->version);
        $this->assertDatabaseCount('verb_events', $eventsBefore);
    }
}
