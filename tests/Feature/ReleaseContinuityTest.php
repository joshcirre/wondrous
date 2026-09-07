<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReleaseContinuityTest extends TestCase
{
    use RefreshDatabase;

    public function test_release_endpoint_is_uncached_and_matches_the_page_release(): void
    {
        $version = $this->getJson('/release')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('version');
        $this->actingAs(User::factory()->create())->get('/')->assertInertia(fn ($page) => $page->where('release', $version));
    }

    public function test_an_old_asset_version_does_not_force_a_reload_or_lose_the_game_session(): void
    {
        $user = User::factory()->create();
        $code = $this->actingAs($user)->postJson('/games', ['name' => 'Keep this board', 'ranked' => false])->json('code');
        $this->withHeaders(['X-Inertia' => 'true', 'X-Inertia-Version' => 'previous-deployment'])->get('/games/'.$code)
            ->assertOk()->assertHeaderMissing('X-Inertia-Location')->assertJsonPath('props.game.code', $code);
        $this->assertAuthenticatedAs($user);
    }

    public function test_signing_back_in_returns_to_the_original_game(): void
    {
        $user = User::factory()->create(['password' => 'practice-password']);
        $code = $this->actingAs($user)->postJson('/games', ['name' => 'Resume', 'ranked' => false])->json('code');
        $this->post('/logout');
        $this->get('/games/'.$code)->assertRedirect('/login');
        $this->post('/login', ['username' => $user->username, 'password' => 'practice-password'])->assertRedirect('/games/'.$code);
    }
}
