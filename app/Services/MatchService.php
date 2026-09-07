<?php

namespace App\Services;

use App\Events\GameUpdated;
use App\Events\LobbyUpdated;
use App\Events\MatchAdvanced;
use App\Game\ComputerOpponent;
use App\Game\GameEngine;
use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Thunk\Verbs\Facades\Verbs;

class MatchService
{
    public function __construct(private GameEngine $engine, private ComputerOpponent $computer) {}

    public function create(User $user, string $name, bool $ranked, string $timeControl = 'live', string $mode = 'multiplayer'): Game
    {
        return Cache::lock('player-activity:'.$user->id, 15)->block(5, fn () => DB::transaction(function () use ($user, $name, $ranked, $timeControl, $mode) {
            $active = Game::where('mode', 'multiplayer')->where('time_control', 'live')->where(fn ($q) => $q->where('host_id', $user->id)->orWhere('guest_id', $user->id))->where('phase', '!=', 'finished')->first();
            abort_unless(in_array($timeControl, ['live', 'correspondence'], true), 422, 'Invalid time control.');
            abort_unless(in_array($mode, ['multiplayer', 'practice'], true), 422, 'Invalid game mode.');
            if ($mode === 'practice') {
                $timeControl = 'live';
                $ranked = false;
                $existing = Game::where('host_id', $user->id)->where('mode', 'practice')->where('phase', '!=', 'finished')->first();
                if ($existing) {
                    return $existing;
                }
            }
            abort_if($mode === 'multiplayer' && $timeControl === 'live' && $active, 422, 'Finish or leave your live match before creating another live match.');
            $game = Game::create(['id' => (string) Str::ulid(), 'code' => strtoupper(Str::random(6)), 'name' => $name, 'mode' => $mode, 'ranked' => $timeControl === 'correspondence' ? false : $ranked, 'time_control' => $timeControl, 'host_id' => $user->id, 'phase' => 'lobby', 'state' => $this->engine->create($user->id, $user->name, $user->loadout ?? [])]);
            $state = $game->state;
            $state['mode'] = $mode;
            $this->record($game, $user->id, 'created', [], $state);
            if ($mode === 'practice') {
                $payload = ['id' => ComputerOpponent::ID, 'name' => 'Practice opponent', 'loadout' => []];
                $state = $this->engine->apply($game->state, ComputerOpponent::ID, 'join', $payload);
                $this->record($game, null, 'join', $payload, $state);
            }
            event(new LobbyUpdated);

            return $game;
        }));
    }

    public function act(Game $game, User $user, string $type, array $payload, int $version): Game
    {
        if ($type === 'join') {
            return Cache::lock('player-activity:'.$user->id, 20)->block(5, fn () => $this->applyLocked($game, $user, $type, $payload, $version));
        }

        return $this->applyLocked($game, $user, $type, $payload, $version);
    }

    private function applyLocked(Game $game, User $user, string $type, array $payload, int $version): Game
    {
        [$result, $expired] = Cache::lock('game:'.$game->id, 20)->block(5, fn () => DB::transaction(function () use ($game, $user, $type, $payload, $version) {
            $game = Game::whereKey($game->id)->lockForUpdate()->firstOrFail();
            if ($type !== 'join') {
                abort_unless($game->hasPlayer($user->id), 403);
            }
            // Commit the timeout before returning a conflict. Throwing inside this
            // transaction would roll back the timeout and let an overdue game linger.
            if ($this->expireLocked($game)) {
                return [$game, true];
            }
            abort_unless($game->version === $version, 409, 'The board changed. Your view has been refreshed; choose your action again.');
            if ($type === 'join') {
                abort_if($game->mode === 'practice', 403, 'Practice games are private.');
                if ($game->time_control === 'live') {
                    $active = Game::where('id', '!=', $game->id)->where('time_control', 'live')->where('mode', 'multiplayer')->where(fn ($q) => $q->where('host_id', $user->id)->orWhere('guest_id', $user->id))->where('phase', '!=', 'finished')->exists();
                    abort_if($active, 422, 'Finish or leave your live match first.');
                }
                $payload = ['id' => $user->id, 'name' => $user->name, 'loadout' => $user->loadout ?? []];
            }
            $previous = $game->state;
            $state = $this->engine->apply($previous, $user->id, $type, $payload);
            if ($state['phase'] === 'finished' && ! $game->settled_at) {
                $state = $this->settle($game, $state);
            }
            if ($type === 'join') {
                $game->guest_id = $user->id;
            }
            $this->updateDeadline($game, $previous, $state);
            $this->record($game, $user->id, $type, $payload, $state);
            $this->advanceComputer($game);
            event(new GameUpdated($game->id, $game->version));
            if (in_array($type, ['join', 'resign']) || $game->phase === 'finished') {
                event(new LobbyUpdated);
            }

            return [$game, false];
        }, 3));
        abort_if($expired, 409, 'The response deadline expired. This match has ended; refresh to see the result.');

        return $result;
    }

    /** Resolve a whole computer response atomically with the human command. No worker can get stranded on deploy. */
    private function advanceComputer(Game $game): void
    {
        if ($game->mode !== 'practice') {
            return;
        }
        // Six placements + ready, or move + attack/skill + end turn. Bound work under the match lock.
        for ($step = 0; $step < 10; $step++) {
            $command = $this->computer->choose($game->state);
            if (! $command) {
                return;
            }
            $state = $this->engine->apply($game->state, ComputerOpponent::ID, $command['type'], $command['payload']);
            if ($state['phase'] === 'finished' && ! $game->settled_at) {
                $state = $this->settle($game, $state);
            }
            $this->record($game, null, $command['type'], $command['payload'], $state);
        }
        throw new \LogicException('Computer response exceeded its action limit.');
    }

    /** Used on reads and by the scheduler; all expiration paths share the action lock. */
    public function expire(Game $game): Game
    {
        if ($game->time_control !== 'correspondence' || ! $game->turn_due_at || $game->turn_due_at->isFuture() || $game->phase === 'finished') {
            return $game;
        }

        return Cache::lock('game:'.$game->id, 20)->block(5, fn () => DB::transaction(function () use ($game) {
            $game = Game::whereKey($game->id)->lockForUpdate()->firstOrFail();
            $this->expireLocked($game);

            return $game;
        }, 3));
    }

    public function expireDue(): int
    {
        $expired = 0;
        Game::where('time_control', 'correspondence')->where('phase', '!=', 'finished')->where('turn_due_at', '<=', now())
            ->orderBy('id')->chunkById(100, function ($games) use (&$expired) {
                foreach ($games as $game) {
                    if ($this->expire($game)->phase === 'finished') {
                        $expired++;
                    }
                }
            });

        return $expired;
    }

    private function expireLocked(Game $game): bool
    {
        if ($game->time_control !== 'correspondence' || ! $game->turn_due_at || $game->turn_due_at->isFuture() || ! in_array($game->phase, ['draft', 'deployment', 'battle'], true)) {
            return false;
        }
        $state = $game->state;
        $players = array_column($state['players'], 'id');
        $overdue = $game->phase === 'deployment'
            ? array_values(array_diff($players, $state['ready']))
            : [$state['turn_player_id']];
        if (! $overdue) {
            return false;
        }
        $winner = count($overdue) === 1 ? array_values(array_diff($players, $overdue))[0] : null;
        $state['phase'] = 'finished';
        $state['winner_id'] = $winner;
        $state['finish_reason'] = 'timeout';
        $state['expired_player_ids'] = $overdue;
        $state['turn_player_id'] = null;
        $state['active_unit_id'] = null;
        $state['log'][] = ['turn' => $state['turn_number'], 'text' => $winner === null ? 'Both deployment deadlines expired. The match is a draw.' : 'The response deadline expired. Player '.$winner.' wins.'];
        $state['log'] = array_slice($state['log'], -80);
        if (! $game->settled_at) {
            $state = $this->settle($game, $state);
        }
        $game->turn_due_at = null;
        $this->record($game, null, 'timeout', ['expired_player_ids' => $overdue], $state);
        event(new GameUpdated($game->id, $game->version));
        event(new LobbyUpdated);

        return true;
    }

    private function updateDeadline(Game $game, array $previous, array $state): void
    {
        if ($game->time_control !== 'correspondence' || in_array($state['phase'], ['lobby', 'finished'], true)) {
            $game->turn_due_at = null;

            return;
        }
        if ($previous['phase'] !== $state['phase'] || $previous['turn_player_id'] !== $state['turn_player_id'] || $previous['turn_number'] !== $state['turn_number']) {
            $game->turn_due_at = now()->addDay();
        }
    }

    private function record(Game $game, ?int $actor, string $action, array $payload, array $state): void
    {
        $state['time_control'] = $game->time_control ?? 'live';
        $state['turn_due_at'] = $game->turn_due_at?->toISOString();
        $game->state = $state;
        $game->phase = $state['phase'];
        $game->version++;
        $game->save();
        MatchAdvanced::fire(match_id: $game->id, actor_id: $actor, action: $action, payload: $payload, result: $state, version: $game->version);
        // Commit inside the same transaction as the projection and rewards, before releasing the match lock.
        Verbs::commit();
        DB::table('game_records')->insert(['game_id' => $game->id, 'version' => $game->version, 'actor_id' => $actor, 'action' => $action, 'payload' => json_encode($payload), 'state' => json_encode($state), 'created_at' => now(), 'updated_at' => now()]);
    }

    private function settle(Game $game, array $state): array
    {
        $game->settled_at = now();
        if ($game->mode === 'practice') {
            $state['reward_candidates'] = [];
            $state['rewards'] = [];

            return $state;
        }
        if ($game->phase !== 'battle' || ! $state['winner_id']) {
            return $state;
        }
        $players = User::whereIn('id', array_column($state['players'], 'id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $winner = $players[$state['winner_id']];
        $loser = $players->first(fn ($p) => $p->id !== $winner->id);
        $delta = $game->ranked && $game->time_control !== 'correspondence' ? (int) round(32 * (1 - 1 / (1 + pow(10, ($loser->rating - $winner->rating) / 400)))) : 0;
        $delta = min($delta, $loser->rating);
        foreach ($players as $p) {
            $won = $p->id === $winner->id;
            $change = $won ? $delta : -$delta;
            // Short forfeits settle rating, but cannot be farmed for currency.
            $coins = $state['turn_number'] >= 9 ? ($won ? 100 : 30) : 0;
            $p->rating += $change;
            $p->currency += $coins;
            $p->{$won ? 'wins' : 'losses'}++;
            $p->save();
            DB::table('reward_transactions')->insert(['user_id' => $p->id, 'source' => 'match:'.$game->id.':'.$p->id, 'kind' => 'match', 'amount' => $coins, 'details' => json_encode(['rating_delta' => $change, 'won' => $won]), 'created_at' => now(), 'updated_at' => now()]);
            $state['rewards'][$p->id] = ['currency' => $coins, 'rating_delta' => $change];
        }

        return $state;
    }
}
