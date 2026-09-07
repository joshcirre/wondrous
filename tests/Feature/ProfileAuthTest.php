<?php

namespace Tests\Feature;

use App\Models\User;
use App\Rules\CommanderName;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class ProfileAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    private function details(User $user): array
    {
        return ['name' => $user->name, 'username' => $user->username, 'email' => $user->email, 'avatar_character_id' => 'ranger'];
    }

    public function test_username_registration_login_and_email_cannot_be_used_as_login(): void
    {
        $this->post('/register', ['name' => 'Cassandra', 'username' => 'CASSANDRA', 'email' => 'CASS@EXAMPLE.COM', 'password' => 'secure-test-pass', 'password_confirmation' => 'secure-test-pass'])->assertRedirect('/');
        $user = User::where('username', 'cassandra')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('cass@example.com', $user->email);
        $this->post('/logout');
        $this->postJson('/login', ['email' => $user->email, 'password' => 'secure-test-pass'])->assertUnprocessable();
        $this->post('/login', ['username' => 'CASSANDRA', 'password' => 'secure-test-pass'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_duplicate_and_invalid_usernames_are_rejected(): void
    {
        User::factory()->create(['username' => 'existing']);
        foreach (['existing', 'has space', 'a', 'bad@email.test'] as $username) {
            $this->postJson('/register', ['name' => 'Valid Commander', 'username' => $username, 'email' => 'new@example.com', 'password' => 'secure-test-pass', 'password_confirmation' => 'secure-test-pass'])->assertUnprocessable()->assertJsonValidationErrors('username');
        }
    }

    public function test_name_filter_normalizes_case_leetspeak_and_separators_without_blocking_ordinary_names(): void
    {
        foreach (['F.U.C.K', 'sh1t', 'b!tch', 'f u c k', 'fück'] as $name) {
            $this->assertTrue(Validator::make(['name' => $name], ['name' => new CommanderName])->fails(), $name);
        }
        foreach (['Cassandra', 'Scunthorpe', 'Dick', 'Elara Vale', 'Rowan Ashford'] as $name) {
            $this->assertFalse(Validator::make(['name' => $name], ['name' => new CommanderName])->fails(), $name);
        }
        $this->postJson('/register', ['name' => 'F.U.C.K', 'username' => 'player', 'email' => 'new@example.com', 'password' => 'secure-test-pass', 'password_confirmation' => 'secure-test-pass'])->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_profile_requires_auth_and_saves_avatar_and_name_with_moderation(): void
    {
        $this->get('/profile')->assertRedirect('/login');
        $user = User::factory()->create();
        $this->actingAs($user)->get('/profile')->assertOk();
        $this->patch('/profile', array_replace($this->details($user), ['name' => 'Elara Rose']))->assertRedirect();
        $this->assertSame('ranger', $user->fresh()->avatar_character_id);
        $this->assertSame('Elara Rose', $user->fresh()->name);
        $this->patchJson('/profile', array_replace($this->details($user), ['name' => 'sh1t']))->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->patchJson('/profile', array_replace($this->details($user), ['avatar_character_id' => '../secrets']))->assertUnprocessable()->assertJsonValidationErrors('avatar_character_id');
    }

    public function test_email_change_requires_current_password_and_invalidates_old_reset_token(): void
    {
        $user = User::factory()->create();
        Password::createToken($user);
        $data = array_replace($this->details($user), ['email' => 'changed@example.com']);
        $this->actingAs($user)->patchJson('/profile', $data)->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->patch('/profile', $data + ['current_password' => 'password'])->assertRedirect();
        $this->assertSame('changed@example.com', $user->fresh()->email);
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_password_update_requires_current_password_and_confirmation(): void
    {
        $user = User::factory()->create();
        $data = ['password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password'];
        $this->actingAs($user)->putJson('/profile/password', $data + ['current_password' => 'incorrect'])->assertUnprocessable();
        $this->put('/profile/password', $data + ['current_password' => 'password'])->assertRedirect();
        $this->assertTrue(Hash::check('new-secure-password', $user->fresh()->password));
    }

    public function test_password_broker_sends_notification_and_reset_token_is_single_use(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $this->get('/forgot-password')->assertOk();
        $this->post('/forgot-password', ['email' => $user->email])->assertRedirect()->assertSessionHas('message');
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });
        $this->get('/reset-password/'.$token.'?email='.urlencode($user->email))->assertOk();
        $data = ['token' => $token, 'email' => $user->email, 'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password'];
        $this->post('/reset-password', $data)->assertRedirect('/');
        $this->assertTrue(Hash::check($data['password'], $user->fresh()->password));
        $this->post('/reset-password', $data)->assertSessionHasErrors('email');
        $this->post('/forgot-password', ['email' => 'unknown@example.com'])->assertSessionHas('message', 'If that email belongs to an account, a password reset link has been sent.');
    }

    public function test_expired_and_invalid_reset_tokens_cannot_change_password(): void
    {
        $user = User::factory()->create();
        $token = Password::createToken($user);
        DB::table('password_reset_tokens')->update(['created_at' => now()->subHours(2)]);
        foreach ([$token, 'invalid'] as $invalid) {
            $this->post('/reset-password', ['token' => $invalid, 'email' => $user->email, 'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password'])->assertSessionHasErrors('email');
        }
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_login_and_recovery_requests_are_rate_limited(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/login', ['username' => 'missing', 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->postJson('/login', ['username' => 'missing', 'password' => 'wrong'])->assertTooManyRequests();
        Notification::fake();
        for ($i = 0; $i < 5; $i++) {
            $this->post('/forgot-password', ['email' => 'unknown@example.com'])->assertRedirect();
        }
        $this->post('/forgot-password', ['email' => 'unknown@example.com'])->assertTooManyRequests();
    }

    public function test_migration_preserves_accounts_and_backfills_unique_usernames(): void
    {
        $migration = require database_path('migrations/2026_09_07_000003_add_user_profiles.php');
        $migration->down();
        foreach (['rowan@wondrous.test', 'elara@wondrous.test', 'same1@example.com', 'same2@example.com'] as $email) {
            DB::table('users')->insert(['name' => 'Same Name', 'email' => $email, 'password' => Hash::make('existing-password')]);
        }
        $migration->up();
        $this->assertSame('rowan', User::where('email', 'rowan@wondrous.test')->value('username'));
        $this->assertSame('elara', User::where('email', 'elara@wondrous.test')->value('username'));
        $this->assertSame(4, User::distinct()->count('username'));
        $this->assertTrue(Hash::check('existing-password', User::first()->password));
    }
}
