using UnityEngine;
using Mg01.Core;
using Mg01.Runtime.Boot;

namespace Mg01.Runtime.Input
{
    /// <summary>
    /// 简化版：tap/click 在己方半场槽位 → 找最近 free slot → 出当前 race 第一个能买得起的兵营。
    /// 真正的"开建造面板"在后续迭代里加。
    /// </summary>
    public class SlotInput : MonoBehaviour
    {
        GameRoot _root;

        public static SlotInput CreateUnder(Transform parent, GameRoot root)
        {
            var go = new GameObject("SlotInput");
            go.transform.SetParent(parent, false);
            var s = go.AddComponent<SlotInput>();
            s._root = root;
            return s;
        }

        void Update()
        {
            if (_root == null || _root.sim == null || _root.sim.ended) return;
            if (!UnityEngine.Input.GetMouseButtonDown(0)) return;
            // 屏幕 → 世界
            var cam = Camera.main;
            if (cam == null) return;
            var world = cam.ScreenToWorldPoint(UnityEngine.Input.mousePosition);

            // 限定左玩家半场（y < 0）
            var side = world.y < 0 ? Side.Left : Side.Right;
            if (side != Side.Left) return;     // 玩家只控左

            var slots = _root.sim.SlotPositions(side);
            int nearest = -1; float best = float.MaxValue;
            for (int i = 0; i < slots.Count; i++)
            {
                if (!_root.sim.SlotIsFree(side, i)) continue;
                float d = (slots[i] - (Vector2)world).sqrMagnitude;
                if (d < best) { best = d; nearest = i; }
            }
            if (nearest < 0 || best > 200 * 200) return;        // 离最近 slot 超 200 像素就忽略

            // 选当前 race 中买得起的最便宜非主城建筑
            var p = _root.sim.players[(int)side];
            string pick = null;
            int bestCost = int.MaxValue;
            foreach (var b in _root.Buildings.Values)
            {
                if (b.race != p.race) continue;
                if (b.kind == "castle") continue;
                if (p.gold < b.cost) continue;
                if (b.cost < bestCost) { bestCost = b.cost; pick = b.id; }
            }
            if (pick == null) return;

            var (ok, _) = _root.sim.ManualBuild(side, pick, nearest);
            if (!ok) Debug.Log($"[SlotInput] place {pick}@slot{nearest} failed");
        }
    }
}
