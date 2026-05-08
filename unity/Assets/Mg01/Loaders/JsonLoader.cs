// 从 data/*.json 装载到 Templates。运行时用 Resources.Load(StreamingAssets) 或 Addressables；
// Editor 期可用 File.ReadAllText 直接读项目根 data/ 目录
//
// 与 engine/src/DataLoader.ts 对应

using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Loaders
{
    public static class JsonLoader
    {
        /// <summary>
        /// 默认 data 目录：项目根 ../data (开发期). 发布期请把 JSON 复制到 StreamingAssets 并改这里
        /// </summary>
        public static string DataDir =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "../../data"));

        // ---- 高层 API ----

        public static Dictionary<string, UnitTemplate> LoadAllUnits()
        {
            var map = new Dictionary<string, UnitTemplate>();
            foreach (var f in new[] { "units_human.json", "units_orc.json", "units_undead.json", "units_nightelf.json" })
            {
                var wrap = Read<UnitListWrap>(f);
                if (wrap?.units == null) continue;
                foreach (var u in wrap.units) map[u.id] = u;
            }
            return map;
        }

        public static Dictionary<string, BuildingTemplate> LoadAllBuildings()
        {
            var w = Read<BuildingListWrap>("buildings.json");
            var map = new Dictionary<string, BuildingTemplate>();
            if (w?.buildings != null) foreach (var b in w.buildings) map[b.id] = b;
            return map;
        }

        public static Dictionary<string, SpellTemplate> LoadAllSpells()
        {
            var w = Read<SpellListWrap>("spells.json");
            var map = new Dictionary<string, SpellTemplate>();
            if (w?.spells != null) foreach (var s in w.spells) map[s.id] = s;
            return map;
        }

        public static List<RaceDef> LoadRaces()
        {
            var w = Read<RaceListWrap>("races.json");
            return w?.races ?? new List<RaceDef>();
        }

        public static BalanceDef LoadBalance() => Read<BalanceDef>("balance.json");

        /// <summary>
        /// 装载伤害矩阵到 DamageMatrix 静态表 (覆盖默认值)
        /// </summary>
        public static void LoadDamageMatrix()
        {
            var raw = Read<DamageMatrixFile>("damage_matrix.json");
            if (raw?.matrix == null) return;
            foreach (var (atk, row) in raw.matrix)
            foreach (var (armor, mult) in row)
            {
                try
                {
                    var atkE = EnumNames.ParseDamageType(atk);
                    var armE = EnumNames.ParseArmorType(armor);
                    DamageMatrix.Override(atkE, armE, mult);
                }
                catch (ArgumentException) { /* 未知键，跳过 */ }
            }
        }

        // ---- 底层 ----

        private static T Read<T>(string fileName)
        {
            // 1) WebGL / 打包后：从 Resources/data/ 加载（无 .json 后缀）
            var key = "data/" + System.IO.Path.GetFileNameWithoutExtension(fileName);
            var ta = Resources.Load<TextAsset>(key);
            string json = ta?.text;
            // 2) Editor 期：直接读项目根 data/ 目录（WebGL 下 File 不可用，try/catch 保命）
            if (json == null)
            {
                try
                {
                    var path = Path.Combine(DataDir, fileName);
                    if (File.Exists(path)) json = File.ReadAllText(path);
                }
                catch { /* WebGL / 沙盒环境下 File API 不可用，忽略 */ }
            }
            if (string.IsNullOrEmpty(json))
            {
                Debug.LogWarning($"[JsonLoader] missing: Resources/{key} and {Path.Combine(DataDir, fileName)}");
                return default;
            }
            try
            {
                // JsonUtility 不支持顶层数组；包一层 wrapper 类即可
                return JsonUtility.FromJson<T>(json);
            }
            catch (Exception e)
            {
                Debug.LogError($"[JsonLoader] parse {fileName} failed: {e.Message}");
                return default;
            }
        }

        // JsonUtility 不支持 Dictionary，伤害矩阵用 Newtonsoft.Json 才能直接反序列化。
        // 这里提供一个最小占位，读到的 matrix 字段为 null；用户安装 com.unity.nuget.newtonsoft-json
        // 后请把上面 Read<T> 切到 JsonConvert.DeserializeObject<T>(json) 即可。
        [Serializable]
        private class DamageMatrixFile
        {
            public Dictionary<string, Dictionary<string, float>> matrix;
        }

        [Serializable] private class UnitListWrap     { public List<UnitTemplate>     units; }
        [Serializable] private class BuildingListWrap { public List<BuildingTemplate> buildings; }
        [Serializable] private class SpellListWrap    { public List<SpellTemplate>    spells; }
        [Serializable] private class RaceListWrap     { public List<RaceDef>          races; }
    }
}
