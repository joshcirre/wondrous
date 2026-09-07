<?php

namespace App\Http\Controllers;

use App\Game\CharacterCatalog;
use App\Models\Game;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class CollectionController extends Controller
{
    public function index(Request $r)
    {
        return Inertia::render('Collection', ['catalog' => CharacterCatalog::all(), 'owned' => $r->user()->collection ?? [], 'loadout' => $r->user()->loadout ?? []]);
    }

    public function loadout(Request $r)
    {
        $v = $r->validate(['cards' => 'present|array|list|max:4', 'cards.*' => ['string', 'distinct', Rule::in($r->user()->collection ?? [])]]);
        $r->user()->forceFill(['loadout' => $v['cards']])->save();

        return back()->with('message', 'Your draft preferences are saved.');
    }

    public function pull(Request $r)
    {
        $result = Cache::lock('collection:'.$r->user()->id, 15)->block(5, fn () => DB::transaction(function () use ($r) {
            $user = User::whereKey($r->user()->id)->lockForUpdate()->firstOrFail();
            abort_if($user->currency < 100, 422, 'You need 100 crowns to open a summon.');
            $specialists = array_keys(array_filter(CharacterCatalog::all(), fn ($c) => ! $c['standard']));
            $id = $specialists[random_int(0, count($specialists) - 1)];
            $owned = $user->collection ?? [];
            $duplicate = in_array($id, $owned);
            if (! $duplicate) {
                $owned[] = $id;
            }
            $cost = $duplicate ? 60 : 100;
            $user->currency -= $cost;
            $user->collection = $owned;
            $user->save();
            DB::table('reward_transactions')->insert(['user_id' => $user->id, 'source' => 'summon:'.Str::uuid(), 'kind' => 'summon', 'amount' => -$cost, 'details' => json_encode(['character_id' => $id, 'duplicate' => $duplicate]), 'created_at' => now(), 'updated_at' => now()]);

            return ['character_id' => $id, 'duplicate' => $duplicate, 'currency' => $user->currency, 'owned' => $owned];
        }));

        return response()->json($result);
    }

    public function claim(Request $r, string $code)
    {
        $v = $r->validate(['character_id' => 'required|string']);

        return Cache::lock('claim:'.$code, 15)->block(5, fn () => DB::transaction(function () use ($r, $code, $v) {
            $g = Game::where('code', strtoupper($code))->lockForUpdate()->firstOrFail();
            $id = $r->user()->id;
            abort_if($g->mode === 'practice', 422, 'Practice games do not award cards or currency.');
            abort_unless($g->state['phase'] === 'finished' && $g->state['winner_id'] === $id, 403);
            abort_unless($g->settled_at && ($g->state['turn_number'] ?? 0) >= 9, 422, 'Complete at least eight battle turns to earn a character.');
            abort_if(in_array($id, $g->claims ?? []), 422, 'Your reward has already been claimed.');
            abort_unless(in_array($v['character_id'], $g->state['reward_candidates'][$id] ?? []), 422, 'Choose a loan character you drafted in this match.');
            $user = User::whereKey($id)->lockForUpdate()->firstOrFail();
            $owned = $user->collection ?? [];
            $duplicate = in_array($v['character_id'], $owned);
            if (! $duplicate) {
                $owned[] = $v['character_id'];
            }
            $user->collection = $owned;
            if ($duplicate) {
                $user->currency += 40;
            } $user->save();
            $g->claims = [...($g->claims ?? []), $id];
            $g->save();
            DB::table('reward_transactions')->insert(['user_id' => $id, 'source' => 'claim:'.$g->id.':'.$id, 'kind' => 'claim', 'amount' => $duplicate ? 40 : 0, 'details' => json_encode($v + ['duplicate' => $duplicate]), 'created_at' => now(), 'updated_at' => now()]);

            return response()->json(['game' => $g->visibleTo($id), 'duplicate' => $duplicate]);
        }));
    }

    public function rankings()
    {
        return Inertia::render('Rankings', ['catalog' => CharacterCatalog::all(), 'players' => User::select('id', 'name', 'avatar_character_id', 'rating', 'wins', 'losses')->orderByDesc('rating')->orderByDesc('wins')->limit(100)->get()]);
    }
}
