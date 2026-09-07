<?php

namespace App\Game;

final class CharacterCatalog
{
    public static function all(): array
    {
        $rows = [
            ['warden', 'Iron Warden', 'The living bulwark', 'Tank', true, '#7396a2', 130, 45, 23, 9, 2, 1, 95, 40, 'Bastion', 'Grant an ally ward: +12 armor for two of their turns.', 15, 2, 2, 'ally', 'Nearby enemies must overcome exceptional frontal block.'],
            ['ranger', 'Ashen Ranger', 'Keeper of the long road', 'Marksman', true, '#90b872', 82, 45, 26, 2, 3, 4, 90, 12, 'Piercing Shot', 'Deal 34 damage ignoring armor.', 18, 2, 5, 'enemy', 'Long attack range rewards protected firing lanes.'],
            ['knight', 'Dawn Knight', 'Sword of the first light', 'Fighter', true, '#dbbc72', 110, 50, 29, 6, 3, 1, 95, 28, 'Shield Bash', 'Deal 22 damage and stun for the next enemy turn.', 20, 3, 1, 'enemy', 'Balanced mobility, defense, and reliable melee damage.'],
            ['arcanist', 'Violet Arcanist', 'Scholar of the veil', 'Mage', true, '#ad89d5', 78, 70, 24, 1, 2, 3, 95, 5, 'Arcane Lance', 'Deal 39 damage ignoring armor; incurs two recovery turns.', 25, 2, 4, 'enemy', 'High mana reserves support sustained spell pressure.'],
            ['cleric', 'Sun Cleric', 'Bearer of mercy', 'Healer', true, '#f0cf86', 88, 65, 18, 3, 2, 2, 95, 12, 'Mending Light', 'Restore 38 health to a living ally.', 20, 2, 3, 'ally', 'Healing keeps valuable units in the fight.'],
            ['rogue', 'Velvet Rogue', 'A blade in the dusk', 'Assassin', true, '#ba789c', 78, 50, 27, 2, 4, 1, 95, 18, 'Backstab', 'Deal 32 damage; 52 when attacking from the rear. Ignores armor.', 22, 2, 1, 'enemy', 'Rear attacks bypass directional blocking.'],
            ['pikeman', 'Thorn Pikeman', 'Hold the line', 'Fighter', true, '#a9b797', 98, 45, 25, 5, 2, 2, 95, 20, 'Pinning Thrust', 'Deal 26 damage and root for the next two enemy turns.', 18, 2, 2, 'enemy', 'Two-square melee reach controls narrow approaches.'],
            ['herald', 'Crown Herald', 'The rallying banner', 'Support', true, '#e0a563', 94, 60, 19, 3, 3, 1, 95, 16, 'Rally', 'All living allies gain 12 mana and recover 12 health.', 24, 3, 0, 'self', 'Allies within 2 squares gain +4 armor. Defeat grants the killer team 12 mana.'],
            ['pyromancer', 'Ember Witch', 'Heart of the furnace', 'Mage', false, '#ec8458', 78, 65, 24, 1, 2, 3, 92, 5, 'Wildfire', 'Deal 28 damage and burn for 8 damage on each of two enemy turns.', 22, 2, 4, 'enemy', 'Burn threatens guarded units over time.'],
            ['frostweaver', 'Frost Weaver', 'Winter remembers', 'Controller', false, '#7ccde0', 84, 65, 21, 2, 2, 3, 95, 8, 'Winter Chains', 'Deal 23 damage and root for the next two enemy turns.', 20, 2, 4, 'enemy', 'Root prevents movement but allows attacks and spells.'],
            ['druid', 'Briar Druid', 'Voice of the old wood', 'Support', false, '#7bc3a0', 92, 65, 20, 3, 3, 2, 95, 12, 'Renewal', 'Restore 25 health and remove burn, root, and stun from an ally.', 18, 2, 3, 'ally', 'Cleansing counters persistent magical control.'],
            ['revenant', 'Hollow Revenant', 'An oath unbroken', 'Fighter', false, '#9a93bd', 105, 55, 26, 4, 2, 1, 95, 20, 'Soul Tithe', 'Deal 31 damage ignoring armor and heal for damage dealt.', 22, 2, 2, 'enemy', 'Life drain rewards calculated aggression.'],
        ];
        $out = [];
        foreach ($rows as $r) {
            [$id,$name,$title,$role,$standard,$color,$hp,$mana,$attack,$armor,$move,$range,$accuracy,$block,$skill,$desc,$cost,$cooldown,$skillRange,$target,$passive] = $r;
            $out[$id] = compact('id', 'name', 'title', 'role', 'standard', 'color', 'hp', 'mana', 'attack', 'armor', 'move', 'range', 'accuracy', 'block', 'passive') + ['description' => $title.'. '.$passive, 'skill' => ['name' => $skill, 'description' => $desc, 'cost' => $cost, 'cooldown' => $cooldown, 'range' => $skillRange, 'target' => $target]];
        }

        return $out;
    }

    public static function get(string $id): array
    {
        return self::all()[$id] ?? throw new GameRuleException('Unknown character.');
    }
}
