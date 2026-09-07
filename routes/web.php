<?php

use App\Game\CharacterCatalog;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CollectionController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', [GameController::class, 'lobby'])->name('home');
Route::get('/login', fn () => redirect('/'))->name('login');
Route::middleware(['guest', 'throttle:10,1,auth'])->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});
Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/games', [GameController::class, 'create'])->middleware('throttle:10,1,create');
    Route::get('/games/{code}', [GameController::class, 'show']);
    Route::get('/games/{code}/state', [GameController::class, 'state']);
    Route::get('/games/{code}/replay-data', [GameController::class, 'replayData']);
    Route::get('/games/{code}/replay', [GameController::class, 'replay']);
    Route::get('/replays', [GameController::class, 'replayArchive']);
    Route::post('/games/{code}/actions', [GameController::class, 'action'])->middleware('throttle:90,1,actions');
    Route::post('/games/{code}/claim', [CollectionController::class, 'claim'])->middleware('throttle:10,1,claim');
    Route::get('/collection', [CollectionController::class, 'index']);
    Route::post('/collection/loadout', [CollectionController::class, 'loadout']);
    Route::post('/collection/pull', [CollectionController::class, 'pull'])->middleware('throttle:10,1,pull');
    Route::get('/rankings', [CollectionController::class, 'rankings']);
    Route::get('/guide', fn () => Inertia::render('Guide', ['catalog' => CharacterCatalog::all()]));
});

Route::middleware(['auth', 'throttle:20,1,profile'])->group(function () {
    Route::get('/profile', [ProfileController::class, 'show'])->name('profile');
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
});
Route::middleware('guest')->group(function () {
    Route::get('/forgot-password', [PasswordResetController::class, 'request'])->name('password.request');
    Route::post('/forgot-password', [PasswordResetController::class, 'send'])->middleware('throttle:5,1,password-reset')->name('password.email');
    Route::get('/reset-password/{token}', [PasswordResetController::class, 'form'])->name('password.reset');
    Route::post('/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:5,1,password-reset')->name('password.update');
});
