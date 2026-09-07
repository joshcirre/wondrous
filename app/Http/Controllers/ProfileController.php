<?php

namespace App\Http\Controllers;

use App\Game\CharacterCatalog;
use App\Rules\CommanderName;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;

class ProfileController extends Controller
{
    public function show()
    {
        return Inertia::render('Profile', ['catalog' => CharacterCatalog::all()]);
    }

    public function update(Request $request)
    {
        $user = $request->user();
        $request->merge(['username' => strtolower(trim((string) $request->input('username'))), 'email' => strtolower(trim((string) $request->input('email')))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:24', new CommanderName],
            'username' => ['required', 'string', 'min:3', 'max:24', 'regex:/^[a-z0-9_]+$/', Rule::unique('users')->ignore($user->id), new CommanderName],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user->id)],
            'avatar_character_id' => ['required', Rule::in(array_keys(CharacterCatalog::all()))],
            'current_password' => [Rule::requiredIf($request->input('email') !== $user->email), 'nullable', 'current_password'],
        ]);
        unset($data['current_password']);
        if ($data['email'] !== $user->email) {
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            $user->email_verified_at = null;
        }
        $user->fill($data)->save();

        return back()->with('message', 'Your commander profile has been saved.');
    }

    public function password(Request $request)
    {
        $data = $request->validate(['current_password' => ['required', 'current_password'], 'password' => ['required', 'confirmed', Password::min(8)]]);
        $request->user()->forceFill(['password' => $data['password'], 'remember_token' => Str::random(60)])->save();
        DB::table('password_reset_tokens')->where('email', $request->user()->email)->delete();
        DB::table('sessions')->where('user_id', $request->user()->id)->where('id', '!=', $request->session()->getId())->delete();
        $request->session()->regenerate();

        return back()->with('message', 'Password updated.');
    }
}
