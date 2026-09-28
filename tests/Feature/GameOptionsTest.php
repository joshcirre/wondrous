<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameOptionsTest extends TestCase
{
    use RefreshDatabase;

    private function users(): array
    {
        return [User::factory()->create(['name' => 'Alice']), User::factory()->create(['name' => 'Bob'])];
    }

    private function createMatch(User $host): Game
    {
        $response = $this->actingAs($host)->postJson('/games', ['name' => 'Options arena', 'ranked' => false])->assertCreated();

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
        $this->act($game, $host, 'ready');

        return $this->act($game, $guest, 'ready');
    }

    public function test_visible_state_and_actions_return_only_the_turn_players_options(): void
    {
        [$host, $guest] = $this->users();
        $game = $this->createMatch($host);
        $draft = $this->actingAs($host)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertTrue($draft['options'] === null || $draft['options'] === [] || ($draft['options']['units'] ?? []) === []);

        $this->act($game, $guest, 'join');
        for ($i = 0; $i < 12; $i++) {
            $player = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $player, 'draft', ['character_id' => $game->state['offers'][$player->id][0]]);
        }
        $this->act($game, $host, 'ready');
        $this->act($game, $guest, 'ready');
        $hostView = $this->actingAs($host)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertSame($game->version, $hostView['options']['version']);
        self::assertNotEmpty($hostView['options']['units']);
        foreach (array_keys($hostView['options']['units']) as $id) {
            self::assertSame($host->id, $game->state['units'][array_search($id, array_column($game->state['units'], 'id'), true)]['owner_id']);
        }
        foreach ($game->state['units'] as $unit) {
            if ($unit['owner_id'] === $guest->id) {
                self::assertArrayNotHasKey($unit['id'], $hostView['options']['units']);
            }
        }

        $guestView = $this->actingAs($guest)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertTrue($guestView['options'] === null || $guestView['options'] === [] || ($guestView['options']['units'] ?? []) === []);

        $unit = collect($game->state['units'])->firstWhere('owner_id', $host->id);
        $move = $hostView['options']['units'][$unit['id']]['moves'][0];
        $acted = $this->actingAs($host)->postJson('/games/'.$game->code.'/actions', [
            'type' => 'move',
            'version' => $game->version,
            'unit_id' => $unit['id'],
            'x' => $move['x'],
            'y' => $move['y'],
        ])->assertOk()->json('game');
        self::assertArrayHasKey('options', $acted);
        self::assertArrayHasKey($unit['id'], $acted['options']['units']);
        foreach ($game->state['units'] as $enemy) {
            if ($enemy['owner_id'] === $guest->id) {
                self::assertArrayNotHasKey($enemy['id'], $acted['options']['units']);
            }
        }
        self::assertSame($acted['version'], $acted['options']['version']);
    }

    public function test_options_are_not_persisted_into_records_or_state(): void
    {
        [$host, $guest] = $this->users();
        $game = $this->battle($host, $guest);
        $visible = $game->visibleTo($host->id);
        self::assertArrayHasKey('options', $visible);
        self::assertArrayNotHasKey('options', $game->state);

        $last = DB::table('game_records')->where('game_id', $game->id)->orderByDesc('version')->first();
        $recorded = json_decode($last->state, true);
        self::assertArrayNotHasKey('options', $recorded);
        self::assertSame($game->state, $recorded);

        $event = DB::table('verb_events')->orderByDesc('id')->first();
        self::assertStringNotContainsString('"options"', $event->data);
    }
}
