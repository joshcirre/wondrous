<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('rating')->default(1000);
            $table->unsignedInteger('currency')->default(150);
            $table->unsignedInteger('wins')->default(0);
            $table->unsignedInteger('losses')->default(0);
            $table->json('collection')->nullable();
            $table->json('loadout')->nullable();
        });
        Schema::create('games', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code', 8)->unique();
            $table->string('name', 80);
            $table->foreignId('host_id')->constrained('users');
            $table->foreignId('guest_id')->nullable()->constrained('users');
            $table->string('phase')->index();
            $table->boolean('ranked')->default(true);
            $table->unsignedInteger('version')->default(0);
            $table->json('state');
            $table->json('claims')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamps();
        });
        Schema::create('game_records', function (Blueprint $table) {
            $table->id();
            $table->string('game_id');
            $table->foreign('game_id')->references('id')->on('games');
            $table->unsignedInteger('version');
            $table->foreignId('actor_id')->constrained('users');
            $table->string('action');
            $table->json('payload');
            $table->json('state');
            $table->timestamps();
            $table->unique(['game_id', 'version']);
        });
        Schema::create('reward_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained();
            $table->string('source')->unique();
            $table->string('kind');
            $table->integer('amount');
            $table->json('details')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reward_transactions');
        Schema::dropIfExists('game_records');
        Schema::dropIfExists('games');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['rating', 'currency', 'wins', 'losses', 'collection', 'loadout']));
    }
};
