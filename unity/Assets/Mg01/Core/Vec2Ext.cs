// Vec2 工具：在 Unity 用 UnityEngine.Vector2 即可
// 这里仅提供 engine/src/Vec2.ts 中那些方法的等价静态扩展，便于翻译

using UnityEngine;

namespace Mg01.Core
{
    public static class Vec2Ext
    {
        public static Vector2 ForwardSign(Side s) =>
            s == Side.Left ? new Vector2(0f, 1f) : new Vector2(0f, -1f);

        public static float Distance(Vector2 a, Vector2 b) => Vector2.Distance(a, b);
        public static float DistanceSq(Vector2 a, Vector2 b) => (a - b).sqrMagnitude;
    }
}
