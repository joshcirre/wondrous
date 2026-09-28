<?php

namespace App\Game;

/** Local-only scripted 1–100 combat rolls. Draft and other ranges stay random. */
final class ScriptedCombatRandom
{
    /** @param list<int> $rolls */
    public function __construct(private array $rolls, private $fallback = null) {}

    public function __invoke(int $min, int $max): int
    {
        if ($min === 1 && $max === 100) {
            $fromFile = $this->takeFromFile();
            if ($fromFile !== null) {
                return $fromFile;
            }
            $next = $this->take();
            if ($next !== null) {
                return max(1, min(100, $next));
            }
        }
        $fallback = $this->fallback ?? random_int(...);

        return $fallback($min, $max);
    }

    public static function fromLocalFiles(): ?self
    {
        if (! app()->environment('local')) {
            return null;
        }
        $rolls = self::readTokens(env('WONDROUS_ROLLS'));

        return new self($rolls);
    }

    /** @return list<int> */
    public static function readTokens(?string $raw): array
    {
        if ($raw === null || trim($raw) === '') {
            return [];
        }
        $rolls = [];
        foreach (explode(',', $raw) as $token) {
            $token = strtolower(trim($token));
            if ($token === '') {
                continue;
            }
            if ($token === 'miss') {
                $rolls[] = 100;
            } elseif ($token === 'hit') {
                $rolls[] = 1;
                $rolls[] = 100;
            } elseif ($token === 'block') {
                $rolls[] = 1;
                $rolls[] = 1;
            } elseif (is_numeric($token)) {
                $rolls[] = (int) $token;
            }
        }

        return $rolls;
    }

    private function take(): ?int
    {
        if (! $this->rolls) {
            return null;
        }

        return array_shift($this->rolls);
    }

    private function takeFromFile(): ?int
    {
        if (! app()->environment('local')) {
            return null;
        }
        $path = storage_path('app/wondrous-rolls');
        if (! is_file($path)) {
            return null;
        }
        $rolls = self::readTokens((string) file_get_contents($path));
        if (! $rolls) {
            return null;
        }
        $next = array_shift($rolls);
        file_put_contents($path, implode(',', $rolls));

        return max(1, min(100, $next));
    }
}
