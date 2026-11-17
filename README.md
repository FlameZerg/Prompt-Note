# Prompt Note

> **你的提示词，一点即达。**

本地优先的 Windows 桌面提示词工作台。把散落在备忘录、聊天记录和脑子里的提示词，收进一个轻盈、精致、随叫随到的卡片世界——没有账号，没有云端，没有追踪，你的灵感只属于你。

---

## ✨ 为什么是 Prompt Note

- **一点即复制** —— 点击卡片任意空白处，提示词即刻进入剪贴板，转身就能粘贴使用。聚焦卡片后按 `Enter` / `空格` 同样快捷复制。
- **顺手拖排序** —— 长按 320ms 或拖动超过 8px，卡片便跟随指尖流动；移到目标位置松手，顺序即刻保存。卡片左上角的弧形点位在轻声提醒你：这里可以拖。
- **托盘随手取** —— 不必切回主窗口。原生托盘按分类列出全部提示词，分页完整访问，单击即复制——不打断你的心流。
- **本地优先，数据主权** —— 所有数据只保存在你自己的电脑（`%APPDATA%\promptnote\`），无账号、无上传、无遥测。拔掉网线，它照样运转。
- **精致到像素** —— 浅色／暗色双主题 × 八组配色 × 50–200% 无级缩放（`Ctrl+滚轮`），中英双语界面，怎么舒服怎么来。
- **单文件绿色运行** —— 一个 EXE，免安装、免解包配置，下载即用（系统需具备 WebView2 运行时）。
- **干脆利落** —— 关闭窗口即完全退出，不驻留后台；再次启动只恢复现有窗口，永不出第二个实例。

## 🗂 把秩序还给灵感

- 按项目分类整理，侧栏分类相互隔离；跨分类勾选会创建**独立副本**，互不牵连。
- 卡片／列表双视图随意切换；收藏与标签让常用内容一秒浮出。
- 复制就是复制——编辑、收藏、删除按钮绝不误触复制，只有空白处才是你的"复制键"。

## 🚀 立即开始

**普通用户**：从 GitHub Actions 下载 `Prompt-Note-Windows-<commit>` 构建产物，解压后直接运行 `Prompt Note.exe`——无需安装。（产物为压缩包形式，系统需已安装 WebView2 Runtime。）

**开发者**：需要 Node.js 24+、pnpm 11.7.0、Rust stable，以及 Windows Tauri 所需的 MSVC Build Tools 与 WebView2。

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

> 若 `node_modules` 来自旧项目目录，请先在 `Prompt-Note` 目录重新执行安装命令刷新本机缓存的绝对路径；无需改依赖版本或锁文件。

## 🔒 数据在哪里，如何迁移

提示词数据库保存在 `%APPDATA%\promptnote\promptnote.db`（独立于 EXE 与源码目录）；主题、语言、布局等偏好存于 `%LOCALAPPDATA%\promptnote` 下的 WebView 本地存储。**程序不会自动读取、移动或删除任何旧数据**——你的文件，你做主。

<details>
<summary><b>从旧版 PromptGenie 迁移数据（点击展开详细步骤）</b></summary>

1. 先正常退出新旧两个版本，并**备份旧数据目录**；
2. 将旧库 `%APPDATA%\com.chriszou.promptgenie\promptgenie.db` 复制到新目录并改名为 `promptnote.db`；
3. 若存在 `promptgenie.db-wal` / `promptgenie.db-shm`，必须与主库**配套迁移**并对应改名，不可丢弃日志或只复制主库；
4. 不要直接覆盖正在使用的新库；如需替换，先退出应用，将新目录原有主库与 WAL/SHM 文件**整组**备份移出，切勿混用不同数据库的主库与日志。

旧提示词、标签、收藏会完整迁入默认分类；旧标题字段由第 2 版迁移删除，历史迁移不被改写。新位置没有数据库时，首次启动会创建独立空库。
</details>

## 🧪 质量内建，而非口头承诺

宣传可以生动，质量必须严谨。Prompt Note 把检查织进了每一次提交：

```powershell
pnpm typecheck        # 三套 TypeScript 严格检查
pnpm lint             # 零警告通过
pnpm check:cycles     # 依赖环检测
pnpm test             # 单元与回归测试
python tests/migrations.py       # 数据库迁移验证
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked
```

每次 push 自动触发 CI（`.github/workflows/windows.yml`）：检查全绿后上传 Windows EXE 产物；构建后还会**实际启动两次应用**验证单实例互斥。浏览器回归基于项目真实技术栈（Vite + React + Lucide + Tailwind），仅对 Tauri IPC 注入测试替身——替身不能替代真机验证，这一点我们也如实告知。

## 📁 命名速览

| 层面 | 名称 |
|---|---|
| 项目目录 | `Prompt-Note` |
| 窗口／托盘／程序名 | `Prompt Note` |
| 发布主程序 | `Prompt Note.exe` |
| 内部包名 | `prompt-note` |
| 应用标识符 | `promptnote` |

## 🤝 参与开发

TypeScript 7 为主编译器；官方 ESLint 解析器暂使用独立 lint 工作区中的 TypeScript 6 API，详见[迁移说明](docs/DEPENDENCY-MIGRATION.md)。原生工具链安装与单实例实测进展见[任务进度](docs/TASK-PROGRESS.md)。

---

**Prompt Note——把提示词管理，变成一种享受。**
