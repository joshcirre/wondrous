<?php

namespace Tests\Unit;

use App\Game\StatusCatalog;
use PHPUnit\Framework\TestCase;

class StatusCatalogTest extends TestCase
{
    public function test_catalog_covers_engine_statuses_and_amounts(): void
    {
        $all = StatusCatalog::all();
        self::assertSame(['stun', 'root', 'burn', 'ward'], array_keys($all));
        self::assertSame(8, StatusCatalog::amount('burn'));
        self::assertSame(12, StatusCatalog::amount('ward'));
        self::assertSame('Stunned: skips {turns} {turnWord}', $all['stun']['label']);
        self::assertSame('Burning: {amount} damage at turn end, {turns} {turnWord}', $all['burn']['label']);
    }
}
