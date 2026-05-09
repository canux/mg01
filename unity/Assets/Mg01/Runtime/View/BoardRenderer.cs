using System.Collections.Generic;
using UnityEngine;
using Mg01.Core;
using Mg01.Sim;
using Mg01.Runtime.Boot;

namespace Mg01.Runtime.View
{
    /// <summary>
    /// 每帧 reconcile sim 的活体集合 ↔ 视图 GameObject。
    /// 不订阅事件，纯轮询；简单但稳。
    /// </summary>
    public class BoardRenderer : MonoBehaviour
    {
        GameRoot _root;
        readonly Dictionary<int, GameObject>      _unitViews     = new();
        readonly Dictionary<Building, GameObject> _buildingViews = new();

        void Start() { _root = GetComponentInParent<GameRoot>(); }

        void Update()
        {
            if (_root == null || _root.sim == null) return;
            var sim = _root.sim;

            // ---- 单位 ----
            var alive = new HashSet<int>();
            foreach (var u in sim.units)
            {
                if (!u.alive) continue;
                alive.Add(u.id);
                if (!_unitViews.TryGetValue(u.id, out var go))
                {
                    go = MakeBox($"unit#{u.id}", u.tpl?.race, u.side, 28);
                    _unitViews[u.id] = go;
                }
                go.transform.position = new Vector3(u.Pos.x, u.Pos.y, 0);
            }
            // 清理死单位视图
            var deadIds = new List<int>();
            foreach (var kv in _unitViews) if (!alive.Contains(kv.Key)) deadIds.Add(kv.Key);
            foreach (var id in deadIds) { Destroy(_unitViews[id]); _unitViews.Remove(id); }

            // ---- 建筑 ----
            var aliveB = new HashSet<Building>();
            foreach (var b in sim.buildings)
            {
                if (!b.alive) continue;
                aliveB.Add(b);
                if (!_buildingViews.TryGetValue(b, out var go))
                {
                    int size = (b.tpl?.kind == "castle") ? 80 : 48;
                    go = MakeBox($"building#{b.tpl?.id ?? "?"}", b.tpl?.race, b.side, size);
                    _buildingViews[b] = go;
                }
                go.transform.position = new Vector3(b.Pos.x, b.Pos.y, 0.1f);
            }
            var deadB = new List<Building>();
            foreach (var kv in _buildingViews) if (!aliveB.Contains(kv.Key)) deadB.Add(kv.Key);
            foreach (var b in deadB) { Destroy(_buildingViews[b]); _buildingViews.Remove(b); }
        }

        GameObject MakeBox(string name, string race, Side side, int size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var sr = go.AddComponent<SpriteRenderer>();
            var c = ProceduralSprite.Tint(ProceduralSprite.RaceColor(race), side);
            sr.sprite = ProceduralSprite.Solid(c, size, size);
            sr.sortingOrder = 1;
            return go;
        }
    }
}
