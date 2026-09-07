<?php

namespace Tests\Feature;

use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ReplayArchiveTest extends TestCase
{
    use RefreshDatabase;

    private function finished(User $host, User $guest, ?int $winner, int $minutesAgo = 0): Game
    {
        $state = app(GameEngine::class)->create($host->id, $host->name);
        $state['players'][] = ['id' => $guest->id, 'name' => $guest->name];
        $state['phase'] = 'finished';
        $state['winner_id'] = $winner;

        return Game::create(['id' => (string) Str::ulid(), 'code' => strtoupper(Str::random(6)), 'name' => 'Recorded match', 'host_id' => $host->id, 'guest_id' => $guest->id, 'phase' => 'finished', 'state' => $state, 'time_control' => 'correspondence', 'ranked' => false, 'settled_at' => now()->subMinutes($minutesAgo), 'created_at' => now()->subDays(2), 'updated_at' => now()->subMinutes($minutesAgo)]);
    }

    public function test_archive_requires_authentication_and_paginates_only_owned_finished_games(): void
    {
        $this->withoutVite();
        $this->get('/replays')->assertRedirect('/login');
        $viewer = User::factory()->create();
        $opponent = User::factory()->create();
        $outsider = User::factory()->create();
        $latest = $this->finished($viewer, $opponent, $viewer->id);
        for ($i = 1; $i <= 12; $i++) {
            $this->finished($opponent, $viewer, $opponent->id, $i);
        }
        $private = $this->finished($outsider, $opponent, $outsider->id);
        $unfinished = $this->finished($viewer, $opponent, null);
        $unfinished->forceFill(['phase' => 'battle'])->save();
        $this->actingAs($viewer)->get('/replays')->assertInertia(fn (Assert $page) => $page
            ->component('ReplayArchive', false)->where('matches.total', 13)->where('matches.per_page', 12)
            ->has('matches.data', 12)->where('matches.data.0.code', $latest->code)->where('matches.last_page', 2)
            ->where('matches.data', fn ($rows) => ! in_array($private->code, array_column($rows->toArray(), 'code'), true))
        );
        $this->get('/replays?page=2')->assertInertia(fn (Assert $page) => $page->has('matches.data', 1)->where('matches.current_page', 2));
    }

    public function test_archive_filters_outcomes_and_orders_by_completion_update_not_creation(): void
    {
        $this->withoutVite();
        $viewer = User::factory()->create();
        $opponent = User::factory()->create();
        $win = $this->finished($viewer, $opponent, $viewer->id, 1);
        $loss = $this->finished($viewer, $opponent, $opponent->id, 2);
        $draw = $this->finished($viewer, $opponent, null, 3);
        $win->timestamps = false;
        $win->forceFill(['created_at' => now()->subMonths(3)])->save();
        foreach (['won' => $win, 'lost' => $loss, 'draw' => $draw] as $result => $game) {
            $this->actingAs($viewer)->get('/replays?result='.$result)->assertInertia(fn (Assert $page) => $page
                ->where('result', $result)->where('matches.total', 1)->where('matches.data.0.code', $game->code)
                ->where('matches.data.0.winner_id', $game->state['winner_id'])
                ->missing('matches.data.0.state')->missing('matches.data.0.offers')
            );
        }
        $this->get('/')->assertInertia(fn (Assert $page) => $page->where('recent.0.code', $win->code));
        $this->getJson('/replays?result=other')->assertUnprocessable();
    }
}
