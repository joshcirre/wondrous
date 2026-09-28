<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Game\GameEngine;
use App\Game\LessonCatalog;
use App\Game\Scenarios\FirstMatch;
use App\Game\ScriptedCombatRandom;
use App\Models\Game;
use App\Models\User;
use App\Services\MatchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FirstMatchTest extends TestCase
{
    use RefreshDatabase;

    private function firstMatch(User $user): Game
    {
        $code = $this->actingAs($user)->postJson('/games', [
            'name' => 'First match',
            'ranked' => true,
            'mode' => 'practice',
            'scenario' => 'first_match',
            'time_control' => 'correspondence',
        ])->assertCreated()->json('code');

        return Game::where('code', $code)->firstOrFail();
    }

    private function act(Game $game, User $user, string $type, array $payload = []): Game
    {
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();

        return $game->refresh();
    }

    private function unit(Game $game, int $owner, string $character): array
    {
        return collect($game->state['units'])->first(
            fn ($unit) => $unit['owner_id'] === $owner && $unit['character_id'] === $character
        );
    }

    public function test_first_match_starts_in_battle_with_scripted_positions_and_records_events(): void
    {
        $user = User::factory()->create();
        $game = $this->firstMatch($user);

        self::assertSame('practice', $game->mode);
        self::assertFalse($game->ranked);
        self::assertSame('live', $game->time_control);
        self::assertTrue($game->reduced_board);
        self::assertSame('battle', $game->phase);
        self::assertSame($user->id, $game->state['turn_player_id']);
        self::assertSame(1, $game->state['turn_number']);
        self::assertSame(FirstMatch::KEY, $game->state['scenario']);
        self::assertSame(1, $game->state['lesson_step']);
        self::assertEqualsCanonicalizing([$user->id, ComputerOpponent::ID], $game->state['ready']);
        self::assertSame(array_column(FirstMatch::playerSquad(), 'character_id'), $game->state['draft_picks'][$user->id]);
        self::assertSame(array_column(FirstMatch::computerSquad(), 'character_id'), $game->state['draft_picks'][ComputerOpponent::ID]);

        foreach (array_merge(FirstMatch::playerSquad(), FirstMatch::computerSquad()) as $placed) {
            $owner = in_array($placed, FirstMatch::playerSquad(), true) ? $user->id : ComputerOpponent::ID;
            $unit = $this->unit($game, $owner, $placed['character_id']);
            self::assertSame($placed['x'], $unit['x']);
            self::assertSame($placed['y'], $unit['y']);
            self::assertSame($placed['facing'], $unit['facing']);
        }

        $view = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertTrue($view['reduced_board']);
        self::assertFalse($view['options']['cues']['breakdown']);
        self::assertFalse($view['options']['cues']['skill_strip']);
        self::assertSame(1, $view['lesson']['step']);
        self::assertSame(LessonCatalog::copy(1)['title'], $view['lesson']['title']);

        $knight = $this->unit($game, $user->id, 'knight');
        $warden = $this->unit($game, ComputerOpponent::ID, 'warden');
        self::assertTrue(collect($view['options']['units'][$knight['id']]['moves'])->contains(fn ($move) => $move['x'] === 3 && $move['y'] === 4));
        $this->act($game, $user, 'move', ['unit_id' => $knight['id'], 'x' => 3, 'y' => 4]);
        $aimed = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        $attack = collect($aimed['options']['units'][$knight['id']]['attack'])->firstWhere('target_id', $warden['id']);
        self::assertNotNull($attack);
        self::assertSame(95, $attack['hit_chance']);
        self::assertContains($attack['block_side'], ['rear', 'side']);

        $events = $this->actingAs($user)->getJson('/games/'.$game->code.'/events?since=0')->assertOk()->json('events');
        self::assertTrue(collect($events)->contains(fn ($event) => ($event['type'] ?? '') === 'turn_start'));
        self::assertGreaterThan(0, DB::table('game_records')->where('game_id', $game->id)->count());
    }

    public function test_computer_first_three_turns_follow_the_script_through_apply(): void
    {
        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $knight = $this->unit($game, $user->id, 'knight');
        $warden = $this->unit($game, ComputerOpponent::ID, 'warden');

        $this->act($game, $user, 'move', ['unit_id' => $knight['id'], 'x' => 3, 'y' => 4]);
        $this->act($game, $user, 'attack', ['unit_id' => $knight['id'], 'target_id' => $warden['id']]);
        $this->act($game, $user, 'end_turn');

        $warden = $this->unit($game, ComputerOpponent::ID, 'warden');
        self::assertSame(['x' => 4, 'y' => 3], ['x' => $warden['x'], 'y' => $warden['y']]);
        self::assertSame($user->id, $game->state['turn_player_id']);
        self::assertSame(3, $game->state['turn_number']);
        self::assertSame(2, $game->state['lesson_step']);
        self::assertGreaterThan(0, $this->unit($game, $user->id, 'knight')['recovery']);

        $this->act($game, $user, 'end_turn');
        self::assertSame('north', $this->unit($game, ComputerOpponent::ID, 'knight')['facing']);
        self::assertSame(5, $game->state['turn_number']);
        self::assertSame(3, $game->state['lesson_step']);

        $rogue = $this->unit($game, $user->id, 'rogue');
        $enemyKnight = $this->unit($game, ComputerOpponent::ID, 'knight');
        foreach (FirstMatch::playerScript()[3] as $step) {
            $payload = ['unit_id' => $rogue['id']];
            if ($step['type'] === 'move') {
                $payload += ['x' => $step['x'], 'y' => $step['y']];
            } else {
                $payload['target_id'] = $enemyKnight['id'];
            }
            $this->act($game, $user, $step['type'], $payload);
        }
        self::assertTrue(collect($game->state['events'])->contains(fn ($event) => ($event['type'] ?? '') === 'attack'));
        self::assertFalse(collect($game->state['events'])->contains(fn ($event) => ($event['type'] ?? '') === 'skill'));
        $this->act($game, $user, 'end_turn');

        self::assertSame(['x' => 2, 'y' => 0], ['x' => $this->unit($game, ComputerOpponent::ID, 'druid')['x'], 'y' => $this->unit($game, ComputerOpponent::ID, 'druid')['y']]);
        self::assertSame(7, $game->state['turn_number']);
        self::assertSame(4, $game->state['lesson_step']);
    }

    public function test_scripted_computer_falls_back_to_search_when_the_player_blocks_the_move(): void
    {
        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $knight = $this->unit($game, $user->id, 'knight');
        $this->act($game, $user, 'move', ['unit_id' => $knight['id'], 'x' => 4, 'y' => 3]);
        $this->act($game, $user, 'end_turn');

        $warden = $this->unit($game, ComputerOpponent::ID, 'warden');
        self::assertNotSame(['x' => 4, 'y' => 3], ['x' => $warden['x'], 'y' => $warden['y']]);
        self::assertSame($user->id, $game->state['turn_player_id']);
        self::assertSame(3, $game->state['turn_number']);
    }

    public function test_lesson_step_advances_from_events_and_shows_the_miss_variant(): void
    {
        $this->app->forgetInstance(GameEngine::class);
        $this->app->forgetInstance(MatchService::class);
        $this->app->instance(GameEngine::class, new GameEngine(new ScriptedCombatRandom(ScriptedCombatRandom::readTokens('miss'))));

        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $view = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertSame(1, $view['lesson']['step']);
        self::assertNull($view['lesson']['variant']);
        self::assertSame(LessonCatalog::copy(1)['body'], $view['lesson']['body']);

        $knight = $this->unit($game, $user->id, 'knight');
        $warden = $this->unit($game, ComputerOpponent::ID, 'warden');
        $this->act($game, $user, 'move', ['unit_id' => $knight['id'], 'x' => 3, 'y' => 4]);
        $this->act($game, $user, 'attack', ['unit_id' => $knight['id'], 'target_id' => $warden['id']]);

        $attacked = $game->state;
        self::assertTrue(collect($attacked['events'])->contains(fn ($event) => ($event['type'] ?? '') === 'attack' && ($event['outcome'] ?? '') === 'miss'));
        self::assertSame(1, $attacked['lesson_step']);
        self::assertSame('miss', $attacked['lesson_variant']);
        $miss = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game.lesson');
        self::assertSame('miss', $miss['variant']);
        self::assertSame(LessonCatalog::copy(1, 'miss')['body'], $miss['body']);
        self::assertSame($warden['hp'], $this->unit($game, ComputerOpponent::ID, 'warden')['hp']);

        $this->act($game, $user, 'end_turn');
        self::assertSame(2, $game->state['lesson_step']);
        self::assertArrayNotHasKey('lesson_variant', $game->state);

        $this->act($game, $user, 'end_turn');
        self::assertSame(3, $game->state['lesson_step']);
        $this->act($game, $user, 'end_turn');
        self::assertSame(4, $game->state['lesson_step']);
        $this->act($game, $user, 'end_turn');
        self::assertNull($game->state['lesson_step']);
        $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->assertJsonPath('game.lesson', null);
    }

    public function test_turn_three_script_uses_no_skill(): void
    {
        $steps = FirstMatch::playerScript()[3] ?? [];
        self::assertNotEmpty($steps);
        foreach ($steps as $step) {
            self::assertNotSame('skill', $step['type']);
        }
        self::assertContains('attack', array_column($steps, 'type'));
    }

    public function test_lesson_three_body_points_at_the_chip_not_backstab(): void
    {
        self::assertSame(
            'Before you click, check the chip. Attacks from behind can\'t be blocked.',
            LessonCatalog::copy(3)['body'],
        );
        self::assertStringNotContainsString('Backstab', LessonCatalog::copy(3)['body']);
        self::assertStringNotContainsString('52', LessonCatalog::copy(3)['body']);
    }

    public function test_player_squad_is_the_starter_standards_with_arcanist_not_pikeman_or_revenant(): void
    {
        $ids = array_column(FirstMatch::playerSquad(), 'character_id');
        self::assertSame(
            ['arcanist', 'warden', 'knight', 'ranger', 'cleric', 'rogue'],
            $ids,
        );
        self::assertSame(['x' => 1, 'y' => 7, 'facing' => 'north'], array_intersect_key(
            FirstMatch::playerSquad()[0],
            array_flip(['x', 'y', 'facing']),
        ));
        foreach (['pikeman', 'revenant', 'druid', 'herald'] as $id) {
            self::assertNotContains($id, $ids);
        }
        foreach ($ids as $id) {
            self::assertNotContains($id, ['pikeman', 'frostweaver']);
        }

        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $host = array_column(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === $user->id), 'character_id');
        self::assertSame($ids, $host);
        $arcanist = $this->unit($game, $user->id, 'arcanist');
        self::assertSame(1, $arcanist['x']);
        self::assertSame(7, $arcanist['y']);
        self::assertSame('north', $arcanist['facing']);
    }

    public function test_computer_squad_never_contains_excluded_champions(): void
    {
        foreach (FirstMatch::computerSquad() as $placed) {
            self::assertNotContains($placed['character_id'], FirstMatch::EXCLUDED);
        }

        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $computer = array_column(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === ComputerOpponent::ID), 'character_id');
        self::assertSame(array_column(FirstMatch::computerSquad(), 'character_id'), $computer);
        foreach ($computer as $id) {
            self::assertNotContains($id, FirstMatch::EXCLUDED);
        }
    }

    public function test_unfinished_first_match_resumes_instead_of_duplicating(): void
    {
        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        self::assertSame($game->id, $this->firstMatch($user)->id);
        self::assertSame(1, Game::count());

        $again = $this->actingAs($user)->postJson('/games', [
            'name' => 'Practice arena',
            'ranked' => false,
            'mode' => 'practice',
        ])->assertCreated()->json('code');
        self::assertSame($game->code, $again);
        self::assertSame(1, Game::count());
    }

    public function test_first_match_awards_no_rewards(): void
    {
        $user = User::factory()->create();
        $before = $user->fresh()->only('rating', 'currency', 'wins', 'losses', 'collection');
        $game = $this->firstMatch($user);
        $this->act($game, $user, 'resign');
        self::assertSame('finished', $game->phase);
        self::assertSame($before, $user->fresh()->only(array_keys($before)));
        self::assertNotNull($game->settled_at);
        $this->assertDatabaseCount('reward_transactions', 0);
        $this->postJson('/games/'.$game->code.'/claim', ['character_id' => 'pyromancer'])->assertUnprocessable();
        $this->getJson('/games/'.$game->code.'/replay-data')->assertOk()->assertJsonPath('game.state.draft_picks.'.$user->id.'.0', 'arcanist');
    }

    public function test_first_match_rejects_skills_until_the_viewers_fourth_turn(): void
    {
        $user = User::factory()->create();
        $game = $this->firstMatch($user);
        $cleric = $this->unit($game, $user->id, 'cleric');
        $warden = $this->unit($game, $user->id, 'warden');
        $payload = ['unit_id' => $cleric['id'], 'target_id' => $warden['id']];

        for ($ownTurn = 1; $ownTurn <= 3; $ownTurn++) {
            $view = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
            self::assertFalse($view['options']['cues']['skill_strip']);
            self::assertSame($ownTurn, (int) ceil($game->state['turn_number'] / 2));
            $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', [
                'type' => 'skill',
                'version' => $game->version,
            ] + $payload)->assertUnprocessable()->assertJsonPath('message', 'Skills unlock on your fourth turn.');
            $this->act($game, $user, 'end_turn');
        }

        $view = $this->actingAs($user)->getJson('/games/'.$game->code.'/state')->assertOk()->json('game');
        self::assertTrue($view['options']['cues']['skill_strip']);
        self::assertSame(4, (int) ceil($game->state['turn_number'] / 2));
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', [
            'type' => 'skill',
            'version' => $game->version,
        ] + $payload)->assertOk();
        self::assertTrue(collect($game->refresh()->state['events'])->contains(fn ($event) => ($event['type'] ?? '') === 'skill'));
    }

    public function test_practice_allows_a_skill_on_turn_one(): void
    {
        $user = User::factory()->create();
        $code = $this->actingAs($user)->postJson('/games', [
            'name' => 'Practice arena',
            'ranked' => false,
            'mode' => 'practice',
        ])->assertCreated()->json('code');
        $game = Game::where('code', $code)->firstOrFail();
        self::assertNull($game->state['scenario'] ?? null);
        self::assertSame(1, $game->state['turn_number']);
        $cleric = $this->unit($game, $user->id, 'cleric');
        $warden = $this->unit($game, $user->id, 'warden');
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', [
            'type' => 'skill',
            'version' => $game->version,
            'unit_id' => $cleric['id'],
            'target_id' => $warden['id'],
        ])->assertOk();
    }

    public function test_first_match_is_practice_only_and_new_players_see_the_entry(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/games', [
            'name' => 'Ranked first match',
            'ranked' => true,
            'scenario' => 'first_match',
        ])->assertUnprocessable();

        $this->actingAs($user)->get('/')->assertInertia(fn ($page) => $page
            ->component('Lobby')
            ->where('first_match_available', true));

        $this->firstMatch($user);
        $this->actingAs($user)->get('/')->assertInertia(fn ($page) => $page->where('first_match_available', true));

        $this->act(Game::first(), $user, 'resign');
        $this->actingAs($user)->get('/')->assertInertia(fn ($page) => $page->where('first_match_available', false));
    }
}
