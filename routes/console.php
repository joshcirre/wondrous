<?php

use App\Services\MatchService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('games:expire', function (MatchService $matches) {
    $this->info('Expired '.$matches->expireDue().' correspondence matches.');
})->purpose('Resolve overdue correspondence turns and deployment deadlines');

Schedule::command('games:expire')->everyMinute()->withoutOverlapping();
