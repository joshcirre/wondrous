<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function share(Request $request): array
    {
        return [...parent::share($request), 'auth' => ['user' => $request->user()?->only('id', 'name', 'username', 'email', 'avatar_character_id', 'rating', 'currency', 'wins', 'losses')], 'flash' => ['message' => fn () => $request->session()->get('message')]];
    }
}
