using System.Collections.Generic;
using UnityEngine;
using Mg01.Sim;
using Mg01.Runtime.Boot;

namespace Mg01.Runtime.Audio
{
    /// <summary>
    /// 监听 sim.events，对白名单 kind 播 Resources/sfx/{kind} 音频。
    /// 文件命名约定：build/hero/death/building_down/castle_down/phase/end_win/end_lose/end_draw/income/tap
    /// </summary>
    public class AudioBridge : MonoBehaviour
    {
        public bool muted;
        GameRoot _root;
        AudioSource _src;
        int _evCursor;
        readonly Dictionary<string, AudioClip> _clips = new();

        static readonly HashSet<string> KEY = new() {
            "build", "hero", "death", "building_down", "castle_down", "phase", "end"
        };

        void Start()
        {
            _root = GetComponentInParent<GameRoot>();
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;

            string[] names = {"build","hero","death","building_down","castle_down","phase",
                              "end_win","end_lose","end_draw","income","tap"};
            foreach (var n in names)
            {
                var c = Resources.Load<AudioClip>($"sfx/{n}");
                if (c != null) _clips[n] = c;
            }
        }

        void Update()
        {
            if (_root == null || _root.sim == null || muted) return;
            var ev = _root.sim.events;
            while (_evCursor < ev.Count)
            {
                var e = ev[_evCursor++];
                var kind = e.kind.ToString().ToLowerInvariant();
                if (kind == "buildingdown")  kind = "building_down";
                if (kind == "castledown")    kind = "castle_down";
                if (!KEY.Contains(kind)) continue;
                string clipName = kind == "end" ? PickEndClip() : kind;
                if (_clips.TryGetValue(clipName, out var c)) _src.PlayOneShot(c);
            }
        }

        string PickEndClip()
        {
            var w = _root.sim.winner;
            if (w == null) return "end_draw";
            // 把 player 视角的"我方=Left"假设保持一致
            return w == Mg01.Core.Side.Left ? "end_win" : "end_lose";
        }
    }
}
