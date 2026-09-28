<?php

namespace App\Models;

use App\Game\BoardCues;
use App\Game\DecidingMoment;
use App\Game\GameEngine;
use App\Game\LessonCatalog;
use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    public const EVENTS_PAGE = 100;

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
        if (isset($state['events'])) {
            $state['events'] = self::visibleEvents($state['events'], $id, $this->state);
        }
        if ($state['phase'] === 'deployment') {
            $state['units'] = array_values(array_filter($state['units'], fn ($u) => $u['owner_id'] === $id));
        }
        if (($state['phase'] ?? null) === 'finished' && isset($this->state['deciding'])) {
            $state['deciding'] = DecidingMoment::forViewer($this->state, $id);
        }
        $options = (new GameEngine)->options($this->state, $id);
        if (is_array($options)) {
            $options['version'] = $this->version;
            $cues = BoardCues::forViewer((bool) $this->reduced_board, $this->state, $id);
            $options['cues'] = $cues;
            if (! $cues['skill_strip']) {
                foreach ($options['units'] ?? [] as $unitId => $unit) {
                    $options['units'][$unitId]['skill'] = [
                        'usable' => false,
                        'reason' => $unit['skill']['reason'] ?? 'Skills unlock on your fourth turn.',
                        'cost' => $unit['skill']['cost'] ?? 0,
                        'targets' => [],
                    ];
                }
            }
        }

        return ['id' => $this->id, 'code' => $this->code, 'name' => $this->name, 'ranked' => $this->ranked, 'mode' => $this->mode ?? 'multiplayer', 'time_control' => $this->time_control ?? 'live', 'reduced_board' => (bool) $this->reduced_board, 'turn_due_at' => $this->turn_due_at?->toISOString(), 'version' => $this->version, 'state' => $state, 'options' => $options, 'lesson' => LessonCatalog::present($this->state), 'created_at' => $this->created_at->toISOString(), 'reward_claimed' => in_array($id, $this->claims ?? [])];
    }

    /** Drop events that would reveal hidden formation or private deck data. */
    public static function visibleEvents(array $events, int $viewerId, array $state): array
    {
        $hiddenOwners = [];
        if (($state['phase'] ?? '') === 'deployment') {
            foreach ($state['units'] ?? [] as $unit) {
                if (($unit['owner_id'] ?? null) !== $viewerId) {
                    $hiddenOwners[$unit['owner_id']] = true;
                }
            }
            foreach ($state['players'] ?? [] as $player) {
                if (($player['id'] ?? null) !== $viewerId) {
                    $hiddenOwners[$player['id']] = true;
                }
            }
        }

        return array_values(array_filter($events, function ($event) use ($hiddenOwners) {
            if (! is_array($event)) {
                return false;
            }
            foreach (['offers', 'pool', 'loadouts', 'reward_candidates'] as $private) {
                unset($event[$private]);
            }
            foreach (['owner_id', 'target_owner_id'] as $key) {
                if (isset($event[$key], $hiddenOwners[$event[$key]])) {
                    return false;
                }
            }

            return true;
        }));
    }

    public static function replayState(array $state): array
    {
        foreach (['offers', 'pool', 'reward_candidates', 'loadouts'] as $private) {
            unset($state[$private]);
        }
        if (isset($state['deciding'])) {
            $state['deciding'] = DecidingMoment::forViewer($state, null, spectator: true);
        }

        return $state;
    }
}
