export type Character = {
    id: string;
    name: string;
    title: string;
    role: string;
    standard: boolean;
    color: string;
    description: string;
    hp: number;
    mana: number;
    attack: number;
    armor: number;
    move: number;
    range: number;
    accuracy: number;
    block: number;
    skill: {
        name: string;
        description: string;
        cost: number;
        cooldown: number;
        range: number;
        target: string;
    };
    passive: string;
};
export type Catalog = Record<string, Character>;
export type User = {
    username: string;
    email: string;
    avatar_character_id: string;
    id: number;
    name: string;
    rating: number;
    currency: number;
    wins: number;
    losses: number;
};
export type Unit = {
    id: string;
    character_id: string;
    owner_id: number;
    x: number;
    y: number;
    hp: number;
    max_hp: number;
    mana: number;
    max_mana: number;
    facing: string;
    recovery: number;
    cooldown: number;
    statuses: Record<string, number>;
};
export type Tile = [number, number];
export type Facing = "north" | "east" | "south" | "west";
export type AttackSide = "front" | "side" | "rear";
export type AttackOutcome = "hit" | "miss" | "block";
export type AttackRoll = {
    accuracy: number;
    hit_roll: number;
    block_chance: number;
    block_roll: number | null;
};
export type MoveEvent = {
    type: "move";
    unit_id: string;
    owner_id: number;
    from: Tile;
    to: Tile;
    path: Tile[];
};
export type FaceEvent = {
    type: "face";
    unit_id: string;
    owner_id: number;
    from: Facing;
    to: Facing;
};
export type AttackEvent = {
    type: "attack";
    unit_id: string;
    owner_id: number;
    target_id: string;
    target_owner_id: number;
    side: AttackSide;
    roll: AttackRoll;
    outcome: AttackOutcome;
    damage: number;
};
export type SkillEvent = {
    type: "skill";
    unit_id: string;
    owner_id: number;
    skill: string;
    target_ids: string[];
    amounts: Record<string, number>;
    statuses: Record<string, Record<string, number>>;
};
export type StatusTickEvent = {
    type: "status_tick";
    unit_id: string;
    owner_id: number;
    status: string;
    amount?: number;
};
export type DeathEvent = {
    type: "death";
    unit_id: string;
    owner_id: number;
    by: number;
};
export type TurnStartEvent = {
    type: "turn_start";
    player_id: number;
    turn_number: number;
};
export type GameOverEvent = {
    type: "game_over";
    winner_id: number | null;
};
export type GameEvent =
    | MoveEvent
    | FaceEvent
    | AttackEvent
    | SkillEvent
    | StatusTickEvent
    | DeathEvent
    | TurnStartEvent
    | GameOverEvent;
export type GameEventFrame = GameEvent & { version: number; index: number };
export type State = {
    phase: "lobby" | "draft" | "deployment" | "battle" | "finished";
    players: { id: number; name: string }[];
    host_id: number;
    turn_player_id: number | null;
    turn_number: number;
    draft_picks: Record<string, string[]>;
    offers: Record<string, string[]>;
    pool: Record<string, string[]>;
    units: Unit[];
    ready: number[];
    active_unit_id: string | null;
    moved: boolean;
    acted: boolean;
    winner_id: number | null;
    finish_reason?: string;
    expired_player_ids?: number[];
    log: { turn: number; text: string }[];
    events?: GameEvent[];
    reward_candidates: Record<string, string[]>;
    rewards?: Record<string, { currency: number; rating_delta: number }>;
};
export type Game = {
    id: string;
    code: string;
    name: string;
    ranked: boolean;
    mode: "multiplayer" | "practice";
    time_control: "live" | "correspondence";
    turn_due_at: string | null;
    version: number;
    state: State;
    created_at: string;
    reward_claimed?: boolean;
};
export type Shared = {
    auth: { user: User | null };
    flash?: { message?: string };
    catalog: Catalog;
    [key: string]: unknown;
};
