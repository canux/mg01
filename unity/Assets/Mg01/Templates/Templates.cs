// 与 engine/src/Templates.ts 一一对应。这里用纯 [Serializable] DTO，便于 JsonUtility / Newtonsoft 反序列化。
// 升级路径：每个 def 加 [CreateAssetMenu] 改成 ScriptableObject，让 Unity Editor 可视化编辑

using System;
using System.Collections.Generic;

namespace Mg01.Templates
{
    [Serializable]
    public class AnimEvent { public float time; public string name; }

    [Serializable]
    public class AnimClip
    {
        public string clip;
        public float duration;
        public bool loop;
        public List<AnimEvent> events;
    }

    [Serializable]
    public class AnimSet
    {
        public AnimClip stand;
        public AnimClip walk;
        public AnimClip attack;
        public AnimClip spell;
        public AnimClip morph;
        public AnimClip death;
    }

    [Serializable]
    public class AttackDef
    {
        public float damage;
        public string damageType;     // "normal"/"pierce"/"magic"/"siege"/"chaos"/"hero"
        public float range;
        public float speed;
        public float attackPoint;
        public float attackBackswing;
        public float aoeRadius;
        public BounceDef bounce;
    }

    [Serializable]
    public class BounceDef { public int count; public float falloff; }

    [Serializable]
    public class DefenseDef
    {
        public float armor;
        public string armorType;      // "unarmored"/"light"/.../"divine"
    }

    [Serializable]
    public class MoveDef
    {
        public float speed;
        public float turnRate;
        public float collisionRadius;
        public bool fly;
    }

    [Serializable]
    public class VisionDef { public float day; public float night; }

    [Serializable]
    public class UnitTemplate
    {
        public string id;
        public string race;
        public string nameCn;
        public string nameEn;
        public string role;           // "step"/"range"/.../"legendary"
        public int cost;
        public float hp;
        public float manaMax;
        public float manaRegen;
        public AttackDef attack;
        public DefenseDef defense;
        public MoveDef movement;
        public VisionDef vision;
        public List<string> abilities;
        public AnimSet animation;
        public string assetKey;
    }

    [Serializable]
    public class BuildingTemplate
    {
        public string id;
        public string race;
        public string nameCn;
        public string kind;           // "castle"/"tower"/"barracks"/"special"/"legendary"/"economy"
        public float hp;
        public float armor;
        public string armorType;
        public int cost;
        public float buildTimeSec;
        public int incomeBonusPer10s;
        public string spawns;         // UnitTemplate.id
        public float spawnIntervalSec;
        public string assetKey;
    }

    [Serializable]
    public class SpellEffect
    {
        // SpellEngine 按 sp.id 走分支 + (sp.effect as { ... }) 取额外字段；
        // 这里把 4 个 MVP 法术用到的字段全声明为可空，不需要也不浪费
        public string type;
        public float amount;
        public float durationSec;
        public float armor;
        public float armorFlat;
        public float damagePct;
        public float attackSpeedPct;
        public float moveSpeedPct;
        public float dmgMagic;
        public float slowPct;
        public float slowSec;
        public float radius;
    }

    [Serializable]
    public class SpellTemplate
    {
        public string id;
        public string nameCn;
        public int manaCost;
        public float cooldownSec;
        public float castPoint;
        public string target;         // "ally"/"enemy"/"area"/"corpse"/"self"
        public float range;
        public SpellEffect effect;
    }

    [Serializable]
    public class RaceDef
    {
        public string id;
        public string nameCn;
        public string nameEn;
        public string color;
        public string themeMusic;
        public string castleAsset;
        public string description;
    }

    [Serializable]
    public class CastleDef
    {
        public float hp;
        public float armor;
        public string armorType;
        public float attackDamage;
        public string attackType;
        public float attackRange;
        public float attackSpeed;
        public float attackPoint;
        public float attackBackswing;
        public float sight;
        public int incomeBonus;
    }

    [Serializable]
    public class TowerDef
    {
        public float hp;
        public float armor;
        public string armorType;
        public float attackDamage;
        public string attackType;
        public float attackRange;
        public float attackSpeed;
        public float attackPoint;
        public float attackBackswing;
        public float buildTimeSec;
        public int cost;
    }

    [Serializable]
    public class BuildingDefaults
    {
        public float barracksHp;
        public float barracksArmor;
        public string barracksArmorType;
        public float buildTimeSec;
        public int incomeBonusPer;
    }

    [Serializable]
    public class RulesDef
    {
        public string winCondition;
        public float maxBattleSec;
        public float corpseDecaySec;
        public float deathDissipateSec;
    }

    [Serializable]
    public class BalanceDef
    {
        public float tickRate;
        public float laneLength;
        public float laneWidth;
        public float incomeIntervalSec;
        public int startGold;
        public int baseIncome;
        public CastleDef castle;
        public TowerDef tower;
        public BuildingDefaults buildingDefaults;
        public RulesDef rules;
    }
}
