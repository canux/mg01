using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Mg01.Sim;
using Mg01.Runtime.Boot;

namespace Mg01.Runtime.UI
{
    /// <summary>
    /// 顶部金币 + 计时器 + 阶段；底部投降/静音；右上小卡片显示胜负。
    /// 全部用代码生成，无需 prefab。
    /// </summary>
    public class HudController : MonoBehaviour
    {
        GameRoot _root;
        TMP_Text _goldL, _goldR, _timer, _phase, _result;

        public static HudController CreateUnder(Transform parent, GameRoot root)
        {
            var go = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(parent, false);
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(540, 960);
            scaler.matchWidthOrHeight = 1f;

            var hud = go.AddComponent<HudController>();
            hud._root = root;
            hud.BuildUI(go.transform);
            return hud;
        }

        void BuildUI(Transform canvas)
        {
            _goldL = MakeText(canvas, "GoldL", new Vector2(20, -20), TextAlignmentOptions.TopLeft,  "● 0", 24);
            _goldR = MakeText(canvas, "GoldR", new Vector2(-20, -20), TextAlignmentOptions.TopRight, "0 ●", 24);
            _timer = MakeText(canvas, "Timer", new Vector2(0, -20), TextAlignmentOptions.Top, "0.0s", 28);
            _phase = MakeText(canvas, "Phase", new Vector2(0, -56), TextAlignmentOptions.Top, "Phase 0", 16);
            _result= MakeText(canvas, "Result", new Vector2(0, 0), TextAlignmentOptions.Center, "", 64);

            MakeButton(canvas, "Mute", "🔊", new Vector2(-20, -90), () => {
                var bridge = _root.GetComponentInChildren<Audio.AudioBridge>();
                if (bridge != null) bridge.muted = !bridge.muted;
            });
            MakeButton(canvas, "Forfeit", "投降", new Vector2(-20, -150), () => {
                if (_root.sim == null || _root.sim.ended) return;
                _root.sim.ended = true;
                _root.sim.winner = Side.Right;   // 默认假设左玩家投降
                _root.sim.Log(new BattleSim.SimEvent {
                    t = _root.sim.now, kind = BattleSim.SimEventKind.End, msg = "left surrendered"
                });
            });
        }

        void Update()
        {
            if (_root == null || _root.sim == null) return;
            var sim = _root.sim;
            var lp = sim.players.Count > 0 ? sim.players[0] : null;
            var rp = sim.players.Count > 1 ? sim.players[1] : null;
            if (lp != null) _goldL.text = $"● {(int)lp.gold}";
            if (rp != null) _goldR.text = $"{(int)rp.gold} ●";
            _timer.text = $"{sim.now:F1}s / {(_root.Balance != null ? _root.Balance.rules.maxBattleSec : 300):F0}s";
            int phaseIdx = sim.now < 120 ? 0 : sim.now < 180 ? 1 : sim.now < 240 ? 2 : 3;
            string[] names = { "准备期", "攻城 I", "攻城 II", "末日" };
            _phase.text = $"Phase {phaseIdx} · {names[phaseIdx]}";

            if (sim.ended)
            {
                _result.text = sim.winner == null ? "DRAW"
                              : sim.winner == Side.Left ? "LEFT WIN"
                              : "RIGHT WIN";
            }
            else _result.text = "";
        }

        // ---- 工具 ----
        static TMP_Text MakeText(Transform parent, string name, Vector2 anchoredPos,
                                 TextAlignmentOptions align, string text, int size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            // anchor 取决于 alignment
            Vector2 anchor = align switch {
                TextAlignmentOptions.TopLeft  => new Vector2(0, 1),
                TextAlignmentOptions.TopRight => new Vector2(1, 1),
                TextAlignmentOptions.Top      => new Vector2(0.5f, 1),
                TextAlignmentOptions.Center   => new Vector2(0.5f, 0.5f),
                _ => new Vector2(0.5f, 0.5f),
            };
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.sizeDelta = new Vector2(300, 60);
            rt.anchoredPosition = anchoredPos;
            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text; tmp.fontSize = size; tmp.alignment = align;
            tmp.color = Color.white;
            return tmp;
        }

        static void MakeButton(Transform parent, string name, string label, Vector2 anchoredPos,
                               System.Action onClick)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(1, 1);
            rt.sizeDelta = new Vector2(80, 36);
            rt.anchoredPosition = anchoredPos;
            go.GetComponent<Image>().color = new Color(1, 1, 1, 0.1f);
            go.GetComponent<Button>().onClick.AddListener(() => onClick?.Invoke());

            var lbl = MakeText(go.transform, "Label", Vector2.zero, TextAlignmentOptions.Center, label, 16);
            ((RectTransform)lbl.transform).anchorMin = Vector2.zero;
            ((RectTransform)lbl.transform).anchorMax = Vector2.one;
            ((RectTransform)lbl.transform).sizeDelta = Vector2.zero;
        }
    }
}
