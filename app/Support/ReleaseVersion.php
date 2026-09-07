<?php

namespace App\Support;

final class ReleaseVersion
{
    public function current(): string
    {
        $path = public_path('build/release.json');

        return is_file($path) ? hash_file('sha256', $path) : 'development';
    }
}
