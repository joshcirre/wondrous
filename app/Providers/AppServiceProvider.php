<?php

namespace App\Providers;

use App\Game\GameEngine;
use App\Game\ScriptedCombatRandom;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(GameEngine::class, function () {
            return new GameEngine(ScriptedCombatRandom::fromLocalFiles());
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
