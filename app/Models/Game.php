<?php

namespace App\Models;

use App\Game\BoardCues;
use App\Game\GameEngine;
use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['state' => 'array', 'claims' => 'array', 'ranked' => 'boolean', 'reduced_board' => 'boolean', 'settled_at' => 'datetime', 'version' => 'integer', 'turn_due_at' => 'datetime'];
    }

    public function hasPlayer(int $id): bool
    {
        return $this->host_id === $id || $this->guest_id === $id;
    }

    public function visibleTo(int $id): array
    {
        $state = $this->state;
        // Offers and personal deck provenance are private, even though chosen teams are public.
        foreach (['offers', 'pool', 'reward_candidates', 'loadouts'] as $key) {
            if (isset($state[$key])) {
                $state[$key] = [$id => $state[$key][$id] ?? []];
            }
        }
        if ($state['phase'] === 'deployment') {
            $state['units'] = array_values(array_filter($state['units'], fn ($u) => $u['owner_id'] === $id));
        }
        $options = (new GameEngine)->options($this->state, $id);
        if (is_array($options)) {
            $options['version'] = $this->version;
            $options['cues'] = BoardCues::visibility((bool) $this->reduced_board, (int) ($this->state['turn_number'] ?? 0));
        }

        return ['id' => $this->id, 'code' => $this->code, 'name' => $this->name, 'ranked' => $this->ranked, 'mode' => $this->mode ?? 'multiplayer', 'time_control' => $this->time_control ?? 'live', 'reduced_board' => (bool) $this->reduced_board, 'turn_due_at' => $this->turn_due_at?->toISOString(), 'version' => $this->version, 'state' => $state, 'options' => $options, 'created_at' => $this->created_at->toISOString(), 'reward_claimed' => in_array($id, $this->claims ?? [])];
    }

    public static function replayState(array $state): array
    {
        foreach (['offers', 'pool', 'reward_candidates', 'loadouts'] as $private) {
            unset($state[$private]);
        }

        return $state;
    }
}
