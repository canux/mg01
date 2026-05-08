using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Mg01.Editor
{
    /// <summary>
    /// 一行命令出 WebGL 包：
    ///   Unity -batchmode -nographics -projectPath ./unity \
    ///         -executeMethod Mg01.Editor.BuildScript.BuildWebGL -quit -logFile -
    /// 输出在 unity/Builds/WebGL/
    /// </summary>
    public static class BuildScript
    {
        const string SceneDir  = "Assets/Mg01/Scenes";
        const string ScenePath = "Assets/Mg01/Scenes/Main.unity";
        const string BuildDir  = "Builds/WebGL";

        [MenuItem("mg01/Build WebGL")]
        public static void BuildWebGL()
        {
            EnsureScene();
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

            // 移动友好的 WebGL 设置
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;       // 部署到任意静态 host 都能跑
            PlayerSettings.WebGL.template          = "APPLICATION:Default";
            PlayerSettings.WebGL.exceptionSupport  = WebGLExceptionSupport.None;            // 包小一点
            PlayerSettings.WebGL.memorySize        = 256;
            PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.WebGL, ManagedStrippingLevel.Low);

            var fullOut = Path.GetFullPath(BuildDir);
            Directory.CreateDirectory(fullOut);

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes           = new[] { ScenePath },
                locationPathName = fullOut,
                target           = BuildTarget.WebGL,
                options          = BuildOptions.None,
            });
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"[mg01] WebGL build FAILED: {report.summary.result}");
                EditorApplication.Exit(1);
            }
            Debug.Log($"[mg01] WebGL build OK → {fullOut}  ({report.summary.totalSize / 1024 / 1024} MB)");
        }

        [MenuItem("mg01/Setup Scene")]
        public static void EnsureSceneMenu() => EnsureScene();

        /// <summary>有 Main.unity 直接用，否则程序化构建一个最小场景并保存。</summary>
        public static void EnsureScene()
        {
            if (File.Exists(ScenePath))
            {
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                return;
            }
            Directory.CreateDirectory(SceneDir);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 摄像机：正交 + 9:16 设计宽 540
            var camGo = new GameObject("MainCamera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 1024;       // y 半范围 ≈ laneLength/2
            cam.backgroundColor = new Color(0.05f, 0.07f, 0.13f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.transform.position = new Vector3(0, 0, -10);

            // EventSystem
            var es = new GameObject("EventSystem");
            es.AddComponent<UnityEngine.EventSystems.EventSystem>();
            es.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();

            // 根：挂 GameRoot；GameRoot 在 Awake 内自建子对象
            new GameObject("Mg01Root").AddComponent<Mg01.Runtime.Boot.GameRoot>();

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log($"[mg01] Scene created at {ScenePath}");
        }
    }
}
