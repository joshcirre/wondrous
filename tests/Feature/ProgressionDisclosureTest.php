<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Game\MatchCredit;
use App\Game\Progression;
use App\Game\Scenarios\FirstMatch;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProgressionDisclosureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    private function practice(User $user): Game
    {
        $code = $this->actingAs($user)->postJson('/games', [
            'name' => 'Practice arena',
            'ranked' => false,
            'mode' => 'practice',
        ])->assertCreated()->json('code');

        return Game::where('code', $code)->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $unlocks
     */
    private function assertUnlocks(User $user, int $finished, bool $won, array $unlocks): void
    {
        $progress = Progression::for($user);
        self::assertSame($finished, $progress['matches_finished']);
        self::assertSame($won, $progress['has_won']);
        self::assertSame($unlocks, $progress['unlocks']);

        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page
            ->component('Lobby')
            ->where('progression.matches_finished', $finished)
            ->where('progression.has_won', $won)
            ->where('progression.unlocks', $unlocks)
            ->where('progression.hints.ranked', Progression::RANKED_HINT)
            ->where('progression.hints.loadouts', Progression::LOADOUTS_HINT));
    }

    public function test_stage_zero_shared_props_hide_every_unlock(): void
    {
        $user = User::factory()->create();
        $this->assertUnlocks($user, 0, false, [
            'formation' => false,
            'draft' => false,
            'specialists' => false,
            'loadouts' => false,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);
        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page->where('first_match_available', true));
    }

    public function test_stage_one_unlocks_only_formation(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 1);
        $this->assertUnlocks($user, 1, false, [
            'formation' => true,
            'draft' => false,
            'specialists' => false,
            'loadouts' => false,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);
        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page->where('first_match_available', false));
    }

    public function test_stage_two_unlocks_draft_specialists_and_loadouts(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 2);
        $this->assertUnlocks($user, 2, false, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);
    }

    public function test_first_win_unlocks_ranked_crowns_correspondence_and_rankings(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 1, $user->id);
        $this->assertUnlocks($user, 1, true, [
            'formation' => true,
            'draft' => false,
            'specialists' => false,
            'loadouts' => false,
            'ranked' => true,
            'crowns' => true,
            'correspondence' => true,
            'rankings' => true,
        ]);
    }

    public function test_five_finished_matches_without_a_win_unlocks_ranked_and_rankings(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 4, turnNumber: MatchCredit::MIN_TURN);
        $this->assertUnlocks($user, 4, false, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::RANKED_HINT);
        $this->actingAs($user)->get('/rankings')->assertRedirect('/');

        $this->recordFinishedMatches($user, 1, turnNumber: MatchCredit::MIN_TURN);
        $this->assertUnlocks($user, 5, false, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => true,
            'crowns' => true,
            'correspondence' => true,
            'rankings' => true,
        ]);
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])->assertCreated();
        $this->actingAs($user)->postJson('/games', ['name' => 'Letters', 'ranked' => false, 'time_control' => 'correspondence'])->assertCreated();
        $this->actingAs($user)->get('/rankings')->assertInertia(fn (Assert $page) => $page->component('Rankings'));
    }

    public function test_five_early_resigns_do_not_unlock_ranked(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 5, turnNumber: 1);
        $this->assertUnlocks($user, 5, false, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::RANKED_HINT);
        $this->actingAs($user)->get('/rankings')->assertRedirect('/');
    }

    public function test_five_matches_past_the_rewards_bar_unlock_ranked(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 5, turnNumber: MatchCredit::MIN_TURN);
        $this->assertUnlocks($user, 5, false, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => true,
            'crowns' => true,
            'correspondence' => true,
            'rankings' => true,
        ]);
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])->assertCreated();
    }

    public function test_one_short_win_unlocks_ranked(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 1, $user->id, turnNumber: 1);
        $this->assertUnlocks($user, 1, true, [
            'formation' => true,
            'draft' => false,
            'specialists' => false,
            'loadouts' => false,
            'ranked' => true,
            'crowns' => true,
            'correspondence' => true,
            'rankings' => true,
        ]);
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])->assertCreated();
    }

    public function test_stage_zero_practice_auto_drafts_and_auto_deploys_starter_squad(): void
    {
        $user = User::factory()->create();
        $game = $this->practice($user);

        self::assertSame('battle', $game->phase);
        self::assertSame($user->id, $game->state['turn_player_id']);
        self::assertSame(1, $game->state['turn_number']);
        self::assertNull($game->state['scenario'] ?? null);
        $expected = array_column(FirstMatch::playerSquad(), 'character_id');
        self::assertSame($expected, $game->state['draft_picks'][$user->id]);
        $playerUnits = array_values(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === $user->id));
        self::assertCount(6, $playerUnits);
        self::assertEqualsCanonicalizing($expected, array_column($playerUnits, 'character_id'));
        foreach ($playerUnits as $unit) {
            self::assertContains($unit['y'], [6, 7]);
        }
        self::assertEqualsCanonicalizing([$user->id, ComputerOpponent::ID], $game->state['ready']);
        $computer = array_column(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === ComputerOpponent::ID), 'character_id');
        self::assertCount(6, $computer);
        foreach ($computer as $id) {
            self::assertNotContains($id, FirstMatch::EXCLUDED);
        }
    }

    public function test_stage_one_practice_auto_drafts_and_shows_formation(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 1);
        $game = $this->practice($user);

        self::assertSame('deployment', $game->phase);
        self::assertSame(array_column(FirstMatch::playerSquad(), 'character_id'), $game->state['draft_picks'][$user->id]);
        self::assertContains(ComputerOpponent::ID, $game->state['ready']);
        self::assertNotContains($user->id, $game->state['ready']);
        $playerUnits = array_values(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === $user->id));
        self::assertCount(6, $playerUnits);
        foreach ($playerUnits as $unit) {
            self::assertContains($unit['y'], [6, 7]);
        }
        $computer = array_column(array_filter($game->state['units'], fn ($unit) => $unit['owner_id'] === ComputerOpponent::ID), 'character_id');
        foreach ($computer as $id) {
            self::assertNotContains($id, FirstMatch::EXCLUDED);
        }
    }

    public function test_stage_two_practice_uses_the_full_draft_without_exclusions(): void
    {
        $user = User::factory()->create();
        $this->recordFinishedMatches($user, 2);
        $game = $this->practice($user);

        self::assertSame('draft', $game->phase);
        self::assertCount(12, $game->state['offers'][$user->id]);
        self::assertContains('pyromancer', $game->state['pool'][$user->id]);
        self::assertContains('arcanist', $game->state['pool'][ComputerOpponent::ID]);
        foreach (FirstMatch::EXCLUDED as $id) {
            self::assertContains($id, $game->state['pool'][ComputerOpponent::ID]);
        }
        self::assertSame([], $game->state['draft_picks'][$user->id]);
    }

    public function test_ranked_correspondence_and_loadouts_are_rejected_before_unlock(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::RANKED_HINT);
        $this->actingAs($user)->postJson('/games', ['name' => 'Letters', 'ranked' => false, 'time_control' => 'correspondence'])
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::CORRESPONDENCE_HINT);
        $this->actingAs($user)->postJson('/collection/loadout', ['cards' => []])
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::LOADOUTS_HINT);
        $user->forceFill(['currency' => 200])->save();
        $this->actingAs($user)->postJson('/collection/pull')
            ->assertUnprocessable()
            ->assertJsonPath('message', Progression::LOADOUTS_HINT);
        $this->actingAs($user)->get('/rankings')->assertRedirect('/');

        $this->actingAs($user)->postJson('/games', ['name' => 'Friendly arena', 'ranked' => false])->assertCreated();
        $host = User::factory()->create();
        $this->recordFinishedMatches($host, 2, $host->id);
        $invite = $this->actingAs($host)->postJson('/games', ['name' => 'Open friendly', 'ranked' => false])->assertCreated()->json('code');
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/games/'.$invite.'/actions', [
            'type' => 'join',
            'version' => Game::where('code', $invite)->value('version'),
        ])->assertOk();
    }

    public function test_finished_first_match_counts_and_a_win_unlocks_ranked(): void
    {
        $user = User::factory()->create();
        $code = $this->actingAs($user)->postJson('/games', [
            'name' => 'First match',
            'ranked' => false,
            'mode' => 'practice',
            'scenario' => 'first_match',
        ])->assertCreated()->json('code');
        $game = Game::where('code', $code)->firstOrFail();
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => 'resign', 'version' => $game->version])->assertOk();
        $game->refresh();
        self::assertSame('finished', $game->phase);
        self::assertSame(ComputerOpponent::ID, $game->state['winner_id']);
        $this->assertUnlocks($user, 1, false, [
            'formation' => true,
            'draft' => false,
            'specialists' => false,
            'loadouts' => false,
            'ranked' => false,
            'crowns' => false,
            'correspondence' => false,
            'rankings' => false,
        ]);

        $winner = User::factory()->create();
        $this->recordFinishedMatches($winner, 1, $winner->id);
        $this->actingAs($winner)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])->assertCreated();
        $this->actingAs($winner)->postJson('/games', ['name' => 'Letters', 'ranked' => false, 'time_control' => 'correspondence'])->assertCreated();
        $this->actingAs($winner)->get('/rankings')->assertInertia(fn (Assert $page) => $page->component('Rankings'));
    }

    public function test_existing_users_with_finished_matches_see_the_full_game(): void
    {
        $user = User::factory()->create(['username' => 'rowan']);
        $this->recordFinishedMatches($user, 3, $user->id);
        $this->assertUnlocks($user, 3, true, [
            'formation' => true,
            'draft' => true,
            'specialists' => true,
            'loadouts' => true,
            'ranked' => true,
            'crowns' => true,
            'correspondence' => true,
            'rankings' => true,
        ]);

        $practice = $this->practice($user);
        self::assertSame('draft', $practice->phase);
        self::assertCount(12, $practice->state['offers'][$user->id]);
        self::assertContains('pyromancer', $practice->state['offers'][$user->id]);

        $this->actingAs($user)->postJson('/games', ['name' => 'Ranked arena', 'ranked' => true])->assertCreated();
        $this->actingAs($user)->postJson('/collection/loadout', ['cards' => []])->assertRedirect();
        $this->actingAs($user)->get('/rankings')->assertOk();
        $this->actingAs($user)->get('/collection')->assertInertia(fn (Assert $page) => $page
            ->component('Collection')
            ->where('progression.unlocks.loadouts', true));
    }

    public function test_thresholds_live_on_progression_constants(): void
    {
        self::assertSame(1, Progression::FORMATION_AFTER);
        self::assertSame(2, Progression::DRAFT_AFTER);
        self::assertSame(2, Progression::SPECIALISTS_AFTER);
        self::assertSame(2, Progression::LOADOUTS_AFTER);
        self::assertSame(5, Progression::COMPETITIVE_AFTER);
        self::assertSame(9, MatchCredit::MIN_TURN);
        self::assertSame('Win a match, or finish 5 matches that last past turn 8, to unlock Ranked.', Progression::RANKED_HINT);
        self::assertSame('Win a match, or finish 5 matches that last past turn 8, to unlock correspondence.', Progression::CORRESPONDENCE_HINT);
        self::assertSame('Win a match, or finish 5 matches that last past turn 8, to unlock Rankings.', Progression::RANKINGS_HINT);
        self::assertSame('Win a match, or finish 5 matches that last past turn 8, to unlock crowns.', Progression::CROWNS_HINT);
        self::assertSame('Loadouts unlock after your third match.', Progression::LOADOUTS_HINT);
    }
}
