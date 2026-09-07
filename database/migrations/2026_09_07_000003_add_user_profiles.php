<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 24)->nullable()->unique();
            $table->string('avatar_character_id', 32)->default('warden');
        });
        DB::table('users')->orderBy('id')->each(function ($user) {
            $demo = ['rowan@wondrous.test' => 'rowan', 'elara@wondrous.test' => 'elara'];
            $base = $demo[$user->email] ?? preg_replace('/[^a-z0-9_]/', '', strtolower(Str::ascii($user->name)));
            $base = strlen($base) < 3 ? 'commander' : $base;
            $username = substr($base, 0, 24);
            if (DB::table('users')->where('username', $username)->exists()) {
                $username = substr($base, 0, 24 - strlen((string) $user->id) - 1).'_'.$user->id;
            }
            $suffix = 0;
            while (DB::table('users')->where('username', $username)->exists()) {
                $username = 'user_'.$user->id.'_'.++$suffix;
            }
            DB::table('users')->where('id', $user->id)->update(['username' => $username]);
        });
        Schema::table('users', fn (Blueprint $table) => $table->string('username', 24)->nullable(false)->change());
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['username']);
            $table->dropColumn(['username', 'avatar_character_id']);
        });
    }
};
