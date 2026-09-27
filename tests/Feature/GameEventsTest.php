<?php

namespace Tests\Feature;

use App\Game\ComputerOpponent;
use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameEventsTest extends TestCase
{
    use RefreshDatabase;

    private function users(): array
    {
        return [User::factory()->create(['name' => 'Alice']), User::factory()->create(['name' => 'Bob'])];
    }

    private function act(Game $game, User $user, string $type, array $payload = []): Game
    {
        $game->refresh();
        $this->actingAs($user)->postJson('/games/'.$game->code.'/actions', ['type' => $type, 'version' => $game->version] + $payload)->assertOk();

        return $game->refresh();
    }

    private function practice(User $user): Game
    {
        $code = $this->actingAs($user)->postJson('/games', ['name' => 'Practice events', 'ranked' => false, 'mode' => 'practice'])->assertCreated()->json('code');

        return Game::where('code', $code)->firstOrFail();
    }

    private function events(User $user, Game $game, int $since = 0): array
    {
        return $this->actingAs($user)->getJson('/games/'.$game->code.'/events?since='.$since)->assertOk()->json();
    }

    public function test_events_after_practice_end_turn_include_computer_steps_as_separate_versions(): void
    {
        $user = User::factory()->create();
        $game = $this->practice($user);
        foreach (['ranger', 'arcanist', 'cleric', 'rogue', 'pyromancer', 'druid'] as $id) {
            $this->act($game, $user, 'draft', ['character_id' => $id]);
        }
        $this->act($game, $user, 'ready');
        $since = $game->version;
        $this->act($game, $user, 'end_turn');
        self::assertGreaterThan($since + 1, $game->version);

        $payload = $this->events($user, $game, $since);
        $steps = $payload['events'];
        self::assertNotEmpty($steps);
        $versions = array_values(array_unique(array_column($steps, 'version')));
        self::assertGreaterThan(1, count($versions));
        self::assertContains($since + 1, $versions);
        self::assertTrue(collect($steps)->contains(fn ($e) => $e['version'] > $since + 1));
        foreach ($steps as $i => $step) {
            self::assertArrayHasKey('type', $step);
            self::assertSame($i === 0 ? $steps[0]['index'] : $step['index'], $step['index']);
            self::assertGreaterThan($since, $step['version']);
        }
        $computerOwned = array_values(array_filter($steps, fn ($e) => ($e['owner_id'] ?? null) === ComputerOpponent::ID));
        self::assertNotEmpty($computerOwned);
        $byVersion = collect($steps)->groupBy('version');
        foreach ($byVersion as $versionSteps) {
            $indexes = $versionSteps->pluck('index')->all();
            self::assertSame(range(0, count($indexes) - 1), $indexes);
        }
    }

    public function test_events_endpoint_forbids_non_participants(): void
    {
        [$host, $guest] = $this->users();
        $outsider = User::factory()->create();
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Private board', 'ranked' => false])->json('code'))->firstOrFail();
        $this->act($game, $guest, 'join');
        $this->actingAs($outsider)->getJson('/games/'.$game->code.'/events?since=0')->assertForbidden();
        $this->actingAs($host)->getJson('/games/'.$game->code.'/events?since=0')->assertOk();
    }

    public function test_events_endpoint_hides_opponent_formation_during_deployment(): void
    {
        [$host, $guest] = $this->users();
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Fog of war', 'ranked' => false])->json('code'))->firstOrFail();
        $this->act($game, $guest, 'join');
        for ($i = 0; $i < 12; $i++) {
            $player = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $player, 'draft', ['character_id' => $game->state['offers'][$player->id][0]]);
        }
        $guestUnit = collect($game->state['units'])->firstWhere('owner_id', $guest->id);
        $this->act($game, $guest, 'deploy', ['unit_id' => $guestUnit['id'], 'x' => 0, 'y' => 1]);
        $record = DB::table('game_records')->where('game_id', $game->id)->orderByDesc('version')->first();
        $state = json_decode($record->state, true);
        $state['events'] = [[
            'type' => 'move',
            'unit_id' => $guestUnit['id'],
            'owner_id' => $guest->id,
            'from' => [$guestUnit['x'], $guestUnit['y']],
            'to' => [0, 1],
            'path' => [[$guestUnit['x'], $guestUnit['y']], [0, 1]],
        ]];
        DB::table('game_records')->where('game_id', $game->id)->where('version', $record->version)->update(['state' => json_encode($state)]);

        $hostEvents = $this->events($host, $game->fresh(), 0)['events'];
        self::assertFalse(collect($hostEvents)->contains(fn ($e) => ($e['unit_id'] ?? null) === $guestUnit['id'] || ($e['owner_id'] ?? null) === $guest->id));
        foreach ($hostEvents as $event) {
            self::assertArrayNotHasKey('offers', $event);
            self::assertArrayNotHasKey('pool', $event);
            self::assertArrayNotHasKey('loadouts', $event);
        }
        $guestEvents = $this->events($guest, $game->fresh(), 0)['events'];
        self::assertTrue(collect($guestEvents)->contains(fn ($e) => ($e['unit_id'] ?? null) === $guestUnit['id'] && $e['type'] === 'move'));
    }

    public function test_old_records_without_events_still_replay(): void
    {
        $this->app->bind(GameEngine::class, fn () => new GameEngine(fn ($min, $max) => $min));
        [$host, $guest] = $this->users();
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Legacy replay', 'ranked' => false])->json('code'))->firstOrFail();
        $this->act($game, $guest, 'join');
        for ($i = 0; $i < 12; $i++) {
            $player = $game->state['turn_player_id'] === $host->id ? $host : $guest;
            $this->act($game, $player, 'draft', ['character_id' => $game->state['offers'][$player->id][0]]);
        }
        $this->act($game, $host, 'ready');
        $this->act($game, $guest, 'ready');
        $this->act($game, $host, 'move', ['unit_id' => $host->id.'-ranger', 'x' => 2, 'y' => 6]);
        $this->act($game, $host, 'end_turn');
        $this->act($game, $guest, 'resign');

        $records = DB::table('game_records')->where('game_id', $game->id)->get();
        foreach ($records as $record) {
            $state = json_decode($record->state, true);
            unset($state['events']);
            DB::table('game_records')->where('game_id', $game->id)->where('version', $record->version)->update(['state' => json_encode($state)]);
        }
        $current = $game->fresh()->state;
        unset($current['events']);
        $game->state = $current;
        $game->save();

        $replay = $this->actingAs($host)->getJson('/games/'.$game->code.'/replay-data')->assertOk()->json();
        self::assertNotEmpty($replay['frames']);
        self::assertSame('finished', $replay['game']['state']['phase']);
        foreach ($replay['frames'] as $frame) {
            self::assertArrayNotHasKey('offers', $frame['state']);
            self::assertArrayNotHasKey('payload', $frame);
        }
        $events = $this->events($host, $game->fresh(), 0)['events'];
        self::assertSame([], $events);
    }

    public function test_events_without_since_returns_every_event_from_version_one(): void
    {
        $host = User::factory()->create();
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Default since', 'ranked' => false])->json('code'))->firstOrFail();
        $this->seedEventRecords($game, [1, 2, 1]);
        $all = $this->actingAs($host)->getJson('/games/'.$game->code.'/events')->assertOk()->json('events');
        $fromZero = $this->events($host, $game, 0)['events'];
        self::assertSame($fromZero, $all);
        self::assertNotEmpty($all);
        self::assertSame(1, $all[0]['version']);
        self::assertSame(range(1, 3), array_values(array_unique(array_column($all, 'version'))));
        self::assertCount(4, $all);
    }

    public function test_events_page_stops_at_record_boundary_and_resumes_without_skipping(): void
    {
        $host = User::factory()->create();
        $game = Game::where('code', $this->actingAs($host)->postJson('/games', ['name' => 'Page boundary', 'ranked' => false])->json('code'))->firstOrFail();
        $counts = array_fill(0, 99, 1);
        $counts[] = 3;
        $counts[] = 2;
        $this->seedEventRecords($game, $counts);
        $expected = [];
        foreach ($counts as $version => $count) {
            for ($index = 0; $index < $count; $index++) {
                $expected[] = ['version' => $version + 1, 'index' => $index, 'type' => 'turn_start', 'player_id' => $host->id, 'turn_number' => ($version + 1) * 10 + $index];
            }
        }
        $seen = [];
        $since = 0;
        $pages = 0;
        do {
            $page = $this->events($host, $game, $since)['events'];
            self::assertNotEmpty($page);
            $last = $page[array_key_last($page)];
            $versions = array_column($page, 'version');
            self::assertSame($last['version'], max($versions));
            self::assertSame(array_values(array_filter($expected, fn ($e) => $e['version'] > $since && $e['version'] <= $last['version'])), $page);
            $seen = array_merge($seen, $page);
            $since = $last['version'];
            $pages++;
        } while ($since < $game->version && $pages < 5);
        self::assertSame($expected, $seen);
        self::assertCount(104, $seen);
        self::assertGreaterThan(100, count(array_filter($seen, fn ($e) => $e['version'] <= 100)));
        self::assertCount(3, array_filter($seen, fn ($e) => $e['version'] === 100));
        self::assertGreaterThan(1, $pages);
    }

    /** @param list<int> $perVersionCounts */
    private function seedEventRecords(Game $game, array $perVersionCounts): void
    {
        DB::table('game_records')->where('game_id', $game->id)->delete();
        $state = $game->state;
        $state['phase'] = 'battle';
        $rows = [];
        foreach ($perVersionCounts as $i => $count) {
            $version = $i + 1;
            $events = [];
            for ($index = 0; $index < $count; $index++) {
                $events[] = ['type' => 'turn_start', 'player_id' => $game->host_id, 'turn_number' => $version * 10 + $index];
            }
            $state['events'] = $events;
            $rows[] = [
                'game_id' => $game->id,
                'version' => $version,
                'actor_id' => $game->host_id,
                'action' => 'end_turn',
                'payload' => json_encode([]),
                'state' => json_encode($state),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('game_records')->insert($rows);
        $game->version = count($perVersionCounts);
        $game->state = $state;
        $game->save();
    }
}
