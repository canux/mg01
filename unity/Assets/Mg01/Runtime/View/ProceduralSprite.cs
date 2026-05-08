using UnityEngine;
using Mg01.Core;

namespace Mg01.Runtime.View
{
    /// <summary>
    /// 灰盒美术：运行时生成纯色矩形 sprite，避免 SVG/PNG 资源管线。
    /// race 颜色取自 RaceDef.color；side==Right 的偏暗一点便于区分。
    /// </summary>
    public static class ProceduralSprite
    {
        public static Sprite Solid(Color c, int w = 32, int h = 32)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
            var pixels = new Color32[w * h];
            var c32 = (Color32)c;
            for (int i = 0; i < pixels.Length; i++) pixels[i] = c32;
            tex.SetPixels32(pixels);
            tex.Apply(false);
            return Sprite.Create(tex, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 32f);
        }

        public static Color RaceColor(string raceId)
        {
            // 与 data/races.json 颜色一致（粗略 hex → Color）
            switch (raceId)
            {
                case "human":    return ParseHex("#7CC2FF");
                case "orc":      return ParseHex("#E36B5C");
                case "undead":   return ParseHex("#9B6BFF");
                case "nightelf": return ParseHex("#7BD68A");
                default:         return Color.gray;
            }
        }

        public static Color Tint(Color c, Side side)
        {
            return side == Side.Right ? Color.Lerp(c, Color.black, 0.25f) : c;
        }

        static Color ParseHex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }
    }
}
