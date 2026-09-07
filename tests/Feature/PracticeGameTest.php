<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PracticeGameTest extends TestCase
{
    use RefreshDatabase;

    private function practice(User $user): Game
    {
        $code = $this->actingAs($user)->postJson('/games', ['name' => 'Practice strategy', 'ranked' => true, 'mode' => 'practice', 'time_control' => 'correspondence'])
            ->assertCreated()->json('code');

        return Game::where('code', $code)->firstOrFail();
    }

    private function act(Game $game, string $type, array $payload = []): void
    {
        $this->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();
        $game->refresh();
    }

    public function test_practice_is_private_resumable_and_independent_of_live_match(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/games', ['name' => 'Live match', 'ranked' => true])->assertCreated();
        $game = $this->practice($user);
        self::assertFalse($game->ranked);
        self::assertSame('live', $game->time_control);
        self::assertNull($game->turn_due_at);
        self::assertNull($game->guest_id);
        self::assertSame('draft', $game->phase);
        self::assertCount(12, $game->visibleTo($user->id)['state']['offers'][$user->id]);
        self::assertSame($game->id, $this->practice($user)->id);
        self::assertSame(2, Game::count());
        $this->getJson('/games/'.$game->code.'/state')->assertOk()->assertJsonPath('game.mode', 'practice');
        $outsider = User::factory()->create();
        $this->actingAs($outsider)->get('/games/'.$game->code)->assertForbidden();
        $this->getJson('/games/'.$game->code.'/state')->assertForbidden();
        $this->postJson('/games/'.$game->code.'/actions', ['type' => 'join', 'version' => $game->version])->assertForbidden();
        $this->postJson('/games/'.$game->code.'/actions', ['type' => 'end_turn', 'version' => $game->version])->assertForbidden();
    }

    public function test_computer_responds_through_draft_deployment_and_battle_and_cannot_be_controlled(): void
    {
        $user = User::factory()->create();
        $game = $this->practice($user);
        foreach (['ranger', 'arcanist', 'cleric', 'rogue', 'pyromancer', 'druid'] as $id) {
            $this->act($game, 'draft', ['character_id' => $id]);
        }
        self::assertSame('deployment', $game->phase);
        self::assertContains(ComputerOpponent::ID, $game->state['ready']);
        self::assertCount(6, $game->visibleTo($user->id)['state']['units']);
        $this->act($game, 'ready');
        $computer = collect($game->state['units'])->firstWhere('owner_id', ComputerOpponent::ID);
        $this->postJson('/games/'.$game->code.'/actions', ['type' => 'move', 'version' => $game->version, 'unit_id' => $computer['id'], 'x' => 4, 'y' => 4])->assertUnprocessable();
        $before = $game->state['units'];
        $version = $game->version;
        $this->act($game, 'end_turn');
        self::assertSame($user->id, $game->state['turn_player_id']);
        self::assertSame(3, $game->state['turn_number']);
        self::assertNotSame($before, $game->state['units']);
        self::assertGreaterThan($version + 1, $game->version);
        $this->postJson('/games/'.$game->code.'/actions', ['type' => 'end_turn', 'version' => $version])->assertConflict();
        self::assertSame($game->version, $game->fresh()->version);
        $this->getJson('/games/'.$game->code.'/state')->assertJsonPath('game.version', $game->version);
        self::assertGreaterThan(0, DB::table('game_records')->where('game_id', $game->id)->whereNull('actor_id')->count());
        self::assertSame(1, User::count());
    }

    public function test_practice_cannot_change_stats_or_award_currency_or_cards_and_has_a_replay(): void
    {
        $user = User::factory()->create();
        $before = $user->fresh()->only('rating', 'currency', 'wins', 'losses', 'collection');
        $game = $this->practice($user);
        for ($i = 0; $i < 6; $i++) {
            $this->act($game, 'draft', ['character_id' => $game->state['offers'][$user->id][0]]);
        }
        $this->act($game, 'ready');
        // Set up a guaranteed finishing strike beyond the multiplayer reward threshold.
        $state = $game->state;
        $state['turn_number'] = 11;
        foreach ($state['units'] as &$unit) {
            $unit['hp'] = 0;
        }
        unset($unit);
        $human = array_search($user->id.'-ranger', array_column($state['units'], 'id'));
        $bot = array_search(ComputerOpponent::ID, array_column($state['units'], 'owner_id'));
        $state['units'][$human] = array_replace($state['units'][$human], ['hp' => 82, 'x' => 3, 'y' => 4]);
        $state['units'][$bot] = array_replace($state['units'][$bot], ['hp' => 1, 'x' => 3, 'y' => 3]);
        $game->state = $state;
        $game->save();
        $this->act($game, 'skill', ['unit_id' => $state['units'][$human]['id'], 'target_id' => $state['units'][$bot]['id']]);
        self::assertSame('finished', $game->phase);
        self::assertSame($user->id, $game->state['winner_id']);
        self::assertSame($before, $user->fresh()->only(array_keys($before)));
        self::assertNotNull($game->settled_at);
        $this->assertDatabaseCount('reward_transactions', 0);
        $this->postJson('/games/'.$game->code.'/claim', ['character_id' => 'pyromancer'])->assertUnprocessable();
        $this->getJson('/games/'.$game->code.'/replay-data')->assertOk()->assertJsonMissingPath('frames.0.state.offers');
        self::assertNotSame($game->id, $this->practice($user)->id);
    }
}
