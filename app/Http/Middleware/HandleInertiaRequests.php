<?php

namespace App\Http\Middleware;

use App\Game\Progression;
use App\Game\StatusCatalog;
use App\Support\ReleaseVersion;
use Illuminate\Http\Request;
use Inertia\Middleware;
use Symfony\Component\HttpFoundation\Response;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    // Updates are announced by ReleaseNotice. Background Inertia visits must never force a reload mid-turn.
    public function version(Request $request): ?string
    {
        return null;
    }

    public function onVersionChange(Request $request, Response $response): Response
    {
        return $response;
    }

    public function share(Request $request): array
    {
        return [...parent::share($request), 'release' => app(ReleaseVersion::class)->current(), 'auth' => ['user' => $request->user()?->only('id', 'name', 'username', 'email', 'avatar_character_id', 'rating', 'currency', 'wins', 'losses')], 'progression' => Progression::for($request->user()), 'flash' => ['message' => fn () => $request->session()->get('message')], 'status_catalog' => StatusCatalog::all()];
    }
}
