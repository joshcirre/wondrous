<?php

namespace Tests\Unit;

use Tests\TestCase;

class InertiaPagePathsTest extends TestCase
{
    public function test_inertia_testing_looks_in_the_lowercase_pages_directory(): void
    {
        $this->assertContains(resource_path('js/pages'), config('inertia.testing.page_paths'));
        $this->assertContains('tsx', config('inertia.testing.page_extensions'));
        $this->assertFileExists(resource_path('js/pages/Lobby.tsx'));
        $this->assertNotEmpty(app('inertia.testing.view-finder')->find('Lobby'));
    }
}
