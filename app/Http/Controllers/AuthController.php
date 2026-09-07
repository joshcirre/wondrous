<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Rules\CommanderName;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $request->merge(['email' => strtolower(trim((string) $request->input('email'))), 'username' => strtolower(trim((string) $request->input('username')))]);
        $data = $request->validate(['name' => ['required', 'string', 'max:24', new CommanderName], 'username' => ['required', 'string', 'min:3', 'max:24', 'regex:/^[a-z0-9_]+$/', 'unique:users', new CommanderName], 'email' => ['required', 'email', 'max:255', 'unique:users'], 'password' => ['required', 'confirmed', Password::min(8)]]);
        $data['email'] = strtolower($data['email']);
        $user = User::create($data);
        Auth::login($user);
        $request->session()->regenerate();

        return redirect('/');
    }

    public function login(Request $request)
    {
        $request->merge(['username' => strtolower(trim((string) $request->input('username')))]);
        $data = $request->validate(['username' => 'required|string|max:24', 'password' => 'required|string']);
        if (! Auth::attempt($data, $request->boolean('remember'))) {
            throw ValidationException::withMessages(['username' => 'Those credentials do not match our records.']);
        }
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
