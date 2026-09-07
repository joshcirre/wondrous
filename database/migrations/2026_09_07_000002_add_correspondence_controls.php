<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->string('time_control')->default('live');
            $table->timestamp('turn_due_at')->nullable()->index();
        });
        Schema::table('game_records', fn (Blueprint $table) => $table->unsignedBigInteger('actor_id')->nullable()->change());
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropIndex(['turn_due_at']);
            $table->dropColumn(['time_control', 'turn_due_at']);
        });
        // System timeout records intentionally keep nullable attribution when rolling back.
    }
};
