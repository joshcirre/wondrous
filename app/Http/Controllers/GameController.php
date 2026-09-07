<?php

namespace App\Http\Controllers;

use App\Game\CharacterCatalog;
use App\Models\Game;
use App\Services\MatchService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class GameController extends Controller
{
    public function lobby(Request $request, MatchService $matches)
    {
        if (! $request->user()) {
            return Inertia::render('Auth', ['catalog' => CharacterCatalog::all()]);
        }
        $id = $request->user()->id;
        Game::where(fn ($q) => $q->where('host_id', $id)->orWhere('guest_id', $id))->where('turn_due_at', '<=', now())->where('phase', '!=', 'finished')->get()->each(fn ($g) => $matches->expire($g));
        $games = Game::where('mode', 'multiplayer')->where('phase', 'lobby')->latest()->limit(30)->get()->map(fn ($g) => ['code' => $g->code, 'name' => $g->name, 'mode' => $g->mode, 'host' => $g->state['players'][0]['name'], 'ranked' => $g->ranked, 'time_control' => $g->time_control, 'created_at' => $g->created_at->diffForHumans()]);
        $activeGames = Game::where(fn ($q) => $q->where('host_id', $id)->orWhere('guest_id', $id))->where('phase', '!=', 'finished')->latest()->get();
        $active = $activeGames->first(fn ($g) => $g->mode === 'multiplayer' && $g->time_control === 'live');
        $activeGames = $activeGames->map(fn ($g) => ['code' => $g->code, 'name' => $g->name, 'mode' => $g->mode, 'time_control' => $g->time_control, 'phase' => $g->phase, 'turn_player_id' => $g->state['turn_player_id'], 'turn_due_at' => $g->turn_due_at?->toISOString(), 'ready' => $g->state['ready'], 'host_id' => $g->host_id, 'players' => $g->state['players']]);
        $recent = Game::where(fn ($q) => $q->where('host_id', $id)->orWhere('guest_id', $id))->where('phase', 'finished')->latest('updated_at')->limit(5)->get()->map(fn ($g) => ['code' => $g->code, 'name' => $g->name, 'mode' => $g->mode, 'won' => $g->state['winner_id'] === $id, 'ranked' => $g->ranked, 'draw' => $g->state['winner_id'] === null, 'time_control' => $g->time_control]);

        return Inertia::render('Lobby', ['catalog' => CharacterCatalog::all(), 'games' => $games, 'active' => $active?->code, 'active_games' => $activeGames, 'recent' => $recent]);
    }

    public function create(Request $r, MatchService $matches)
    {
        $v = $r->validate(['name' => 'required|string|max:60', 'ranked' => 'required|boolean', 'time_control' => 'sometimes|required|in:live,correspondence', 'mode' => 'sometimes|required|in:multiplayer,practice']);
        $g = $matches->create($r->user(), $v['name'], $v['ranked'], $v['time_control'] ?? 'live', $v['mode'] ?? 'multiplayer');

        return response()->json(['code' => $g->code], 201);
    }

    public function show(Request $r, string $code)
    {
        $g = $this->find($r, $code);

        return Inertia::render('Game', ['game' => $g->visibleTo($r->user()->id), 'catalog' => CharacterCatalog::all()]);
    }

    public function state(Request $r, string $code)
    {
        $g = $this->find($r, $code);

        return response()->json(['game' => $g->visibleTo($r->user()->id), 'catalog' => CharacterCatalog::all(), 'viewer_id' => $r->user()->id]);
    }

    public function action(Request $r, string $code, MatchService $matches)
    {
        $v = $r->validate(['type' => 'required|string|in:join,draft,deploy,ready,move,attack,skill,face,end_turn,resign', 'version' => 'required|integer|min:0']);
        $g = Game::where('code', strtoupper($code))->firstOrFail();
        $g = $matches->act($g, $r->user(), $v['type'], $r->only('character_id', 'unit_id', 'target_id', 'x', 'y', 'facing'), $v['version']);

        return response()->json(['game' => $g->visibleTo($r->user()->id)]);
    }

    private function find(Request $r, string $code): Game
    {
        $g = Game::where('code', strtoupper($code))->firstOrFail();
        abort_unless($g->hasPlayer($r->user()->id) || ($g->phase === 'lobby' && $g->mode !== 'practice'), 403);

        return app(MatchService::class)->expire($g);
    }

    public function replayArchive(Request $r)
    {
        $validated = $r->validate(['result' => 'sometimes|nullable|in:all,won,lost,draw']);
        $result = $validated['result'] ?? 'all';
        $viewer = $r->user()->id;
        $query = Game::where(fn ($q) => $q->where('host_id', $viewer)->orWhere('guest_id', $viewer))->where('phase', 'finished');
        if ($result === 'won') {
            $query->where('state->winner_id', $viewer);
        } elseif ($result === 'lost') {
            $query->whereNotNull('state->winner_id')->where('state->winner_id', '!=', $viewer);
        } elseif ($result === 'draw') {
            $query->whereNull('state->winner_id');
        }
        $matches = $query->orderByDesc('updated_at')->orderByDesc('id')->paginate(12)->withQueryString()->through(fn ($game) => [
            'code' => $game->code, 'name' => $game->name, 'ranked' => $game->ranked, 'mode' => $game->mode,
            'time_control' => $game->time_control, 'players' => $game->state['players'],
            'winner_id' => $game->state['winner_id'], 'finished_at' => ($game->settled_at ?? $game->updated_at)->toISOString(),
            'updated_at' => $game->updated_at->toISOString(),
        ]);

        return Inertia::render('ReplayArchive', ['matches' => $matches, 'result' => $result]);
    }

    public function replayData(Request $r, string $code)
    {
        return response()->json($this->replayProps($r, $code));
    }

    public function replay(Request $r, string $code)
    {
        return Inertia::render('Replay', $this->replayProps($r, $code));
    }

    private function replayProps(Request $r, string $code): array
    {
        $g = Game::where('code', strtoupper($code))->firstOrFail();
        abort_unless($g->hasPlayer($r->user()->id), 403);
        $g = app(MatchService::class)->expire($g);
        abort_unless($g->phase === 'finished', 422, 'Replays are available after the match finishes.');
        $frames = DB::table('game_records')->where('game_id', $g->id)->orderBy('version')->get()
            ->map(fn ($record) => ['version' => $record->version, 'actor_id' => $record->actor_id, 'action' => $record->action, 'created_at' => Carbon::parse($record->created_at)->toISOString(), 'state' => Game::replayState(json_decode($record->state, true))]);
        $game = $g->visibleTo($r->user()->id);
        $game['state'] = Game::replayState($g->state);

        return ['game' => $game, 'catalog' => CharacterCatalog::all(), 'viewer_id' => $r->user()->id, 'frames' => $frames];
    }
}
