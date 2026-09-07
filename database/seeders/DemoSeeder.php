<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Demo accounts are only available in local/testing environments.');
        }
        foreach (['rowan' => 'Rowan Ashford', 'elara' => 'Elara Vale'] as $key => $name) {
            User::firstOrCreate(['email' => $key.'@wondrous.test'], ['name' => $name, 'username' => $key, 'password' => 'wondrous-demo']);
        }
    }
}
