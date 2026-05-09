using Mg01.Sim;

namespace Mg01.Runtime.Boot
{
    /// <summary>每局 / 每方独立 BuildOrderStrategy 实例，避免 idx 共享。</summary>
    public static class StrategyFactory
    {
        public static PlayerStrategy For(string race)
        {
            switch (race)
            {
                case "human": return new BuildOrderStrategy("human-rush", new[] {
                    "human_goldmine", "human_barracks_footman", "human_barracks_footman",
                    "human_barracks_rifleman", "human_goldmine", "human_barracks_footman",
                    "human_barracks_rifleman", "human_tower", "human_barracks_rifleman",
                });
                case "orc": return new BuildOrderStrategy("orc-rush", new[] {
                    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
                    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
                    "orc_tower", "orc_workshop_catapult",
                });
                case "undead": return new BuildOrderStrategy("undead-rush", new[] {
                    "ud_haunted", "ud_crypt_ghoul", "ud_crypt_ghoul", "ud_haunted",
                    "ud_crypt_cryptfiend", "ud_tower", "ud_graveyard_meatwagon", "ud_boneyard_gargoyle",
                });
                case "nightelf": return new BuildOrderStrategy("nightelf-rush", new[] {
                    "ne_entangledmine", "ne_archershop_archer", "ne_archershop_archer",
                    "ne_entangledmine", "ne_ancient_huntress", "ne_tower", "ne_ancientofwind_glaive",
                });
                default: return new DoNothingStrategy();
            }
        }
    }
}
