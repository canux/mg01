# CI 一次性配置（之后全自动）

最小化你的操作：把这 3 个 Secret 配好，之后每次 push 都自动出 H5 包。

## Step 1：生成 Unity 激活请求文件 `.alf`（GitHub 上跑一次）

1. 进入仓库 → **Actions** 标签
2. 左侧选 **"Request Unity License (.alf)"**
3. 右上角 **Run workflow** → 选当前分支 → 跑
4. 跑完点进 run 详情 → **Artifacts** 区下载唯一那个 `.alf` 文件（文件名形如 `Unity_v2022.x.alf`）

## Step 2：用 `.alf` 换 `.ulf`（浏览器里 5 分钟）

1. 打开 [https://license.unity3d.com/manual](https://license.unity3d.com/manual)
2. 用你的 Unity ID 登录（没账号免费注册即可，**Personal 免费版**够用）
3. 上传 Step 1 下的 `.alf` 文件
4. 选 **"Unity Personal Edition"** → 点选用途 → **Download license file** 拿到 `Unity_v2022.x.ulf`

## Step 3：把 3 个值粘进 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**：

| Secret 名 | 值 |
|---|---|
| `UNITY_LICENSE` | `Unity_v2022.x.ulf` 文件**整个内容**（XML 文本） |
| `UNITY_EMAIL`   | 你 Unity ID 的注册邮箱 |
| `UNITY_PASSWORD`| 你 Unity ID 的密码 |

## 完事

之后任何对 `unity/**` 的 push 都会触发 **"Build WebGL (Unity)"** 工作流：

- 5-15 分钟后产出 artifact `mg01-webgl-<sha>` —— 下载解压即得 H5 包
- main 分支推送会**额外自动发布到 GitHub Pages**：仓库 → Settings → Pages 把 Source 设为 "GitHub Actions"，下次 main push 后页面会出现你的游戏 URL

## 进一步偷懒（可选）

- **关掉本地 Unity 安装**：你彻底不用装 Unity；CI 全代劳
- **增量 cache**：第一次 5-15 分钟，之后 1-3 分钟（已配好 `Library/` cache）
- **PR 预览**：把 `pull_request:` 也加进 trigger，PR 合入前就能看到 build 是否绿

## 调试 Tips

- 若 build 红了：进 run → **build** job 日志 → 搜 `error CS` 找 C# 编译错误，把行号贴给我
- 若 license 失效（90 天 Personal 续期）：重跑 Step 1，重新换一遍 `.ulf`
- 若想本地也跑：见 `unity/README.md`，命令行单条 `Unity -batchmode ...` 一样能跑
