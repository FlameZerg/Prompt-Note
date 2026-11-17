# Prompt Note

本地优先的桌面提示词工作台。按项目分类整理提示词，点击卡片空白处复制，长按拖动排序。支持卡片／列表视图、中英文、收藏、标签与 50–200% 缩放。

## 开发

要求 Node.js 24+、pnpm 11.7.0、Rust stable，以及 Windows Tauri 所需的 MSVC Build Tools 与 WebView2。

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

若 `node_modules` 来自旧项目目录，请先在 `Prompt-Note` 目录重新执行上述安装命令，刷新本机依赖启动脚本中缓存的绝对路径；不需要修改依赖版本或锁文件。

用户于 2026-11-15 授权后，已实际执行 pnpm install。TypeScript 7 为主编译器；官方 ESLint 解析器暂使用独立 lint 工作区中的 TypeScript 6 API，原因见 [迁移说明](docs/DEPENDENCY-MIGRATION.md)。

## 交互

- 侧栏分类互相隔离，跨分类勾选创建独立副本。
- 普通分类可直接删除，确认后会永久删除该分类及其中全部提示词；其他分类的独立副本不受影响，默认分类不可删除。
- 提示词仅有内容与标签。点击卡片空白处复制；编辑、收藏、删除按钮不会触发复制。
- 卡片任意空白处按住并移动超过 8px，或长按 320ms，即可拖动；移动到目标卡片后松开保存排序。聚焦卡片后按 Enter／空格可复制内容。
- 卡片左上角以“内圈 2 点、外圈 3 点”的等点距弧形标记提示拖动，不限制可拖区域。
- 侧栏语言入口上方可切换浅色／暗色模式，偏好设置提供八组配色，选择均保存在本机。
- Ctrl+鼠标滚轮缩放，底部百分比点击重置为 100%。
- 原生托盘按分类列出所有提示词，仅显示标签、不添加编号；每页 20 条，多页可完整访问。单击仅复制，不自动粘贴。
- 关闭主窗口即退出程序，不驻留托盘；托盘“退出”同样完全结束。重复启动只恢复现有窗口，不生成第二个常驻应用实例。

并发中的初始化读取会合并为一次真实数据库请求，读取完成即释放；写入后刷新不会沿用写入前的在途快照。侧栏、项目概览及托盘按分类一次分组，减少反复扫描全库；托盘仍包含全部提示词。这些调整未跳过数据库迁移或事务检查，实际启动耗时需在目标 Windows 环境测量。

单实例限制针对 Prompt Note 应用主进程；WebView2 自身的渲染／辅助子进程不代表另一个应用实例，不会强行结束这些必要进程。

## 数据兼容

项目目录为 `Prompt-Note`，窗口、托盘及左上角名称为 `Prompt Note`，发布主程序为 `Prompt Note.exe`；内部 pnpm／Cargo 包名为 `prompt-note`，应用标识符为 `promptnote`。

Windows 提示词数据库保存于 `%APPDATA%\promptnote\promptnote.db`，不在 EXE 或源码目录。主题、语言、布局和缩放使用 WebView 本地存储，随应用标识符切换到 `%LOCALAPPDATA%\promptnote` 下的新数据目录，不自动迁入旧偏好。

旧版数据库 `%APPDATA%\com.chriszou.promptgenie\promptgenie.db` 由用户自行迁移；程序不会自动读取、移动、重命名或删除旧数据。迁移前先正常退出新旧版本，并备份旧数据目录，再将数据库复制到新目录并改名为 `promptnote.db`。若仍存在 `promptgenie.db-wal`／`promptgenie.db-shm`，必须将它们与主库配套迁移，并对应改名为 `promptnote.db-wal`／`promptnote.db-shm`，不要丢弃日志或只复制主库。不要直接覆盖已经使用的新库；如需替换，先退出，将新目录原有的主库及 WAL／SHM 文件整组备份移出，不能将不同数据库的主库与日志混用。新位置没有数据库时，首次启动会创建独立空库，不会显示旧目录的数据。

数据库结构迁移保持不变：旧提示词、标签、收藏完整迁入默认分类，旧标题字段由第 2 版迁移删除，不改写历史迁移。

## 验证与构建

```powershell
pnpm typecheck
pnpm lint
pnpm check:cycles
pnpm test
python tests/migrations.py
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked
```

每次 push 均执行 `.github/workflows/windows.yml`，检查成功后上传 `Prompt-Note-Windows-<commit>` artifact，仅包含直接运行的 `Prompt Note.exe`。CI 使用 `--no-bundle`，不生成或上传安装包。GitHub 下载的 artifact 是压缩包，解压后运行其中的 EXE 即可，无需安装应用；系统仍需已安装 WebView2 Runtime，单个 EXE 不包含该运行时。构建不要求发布权限，不自动创建 Release。

`scripts/browser-harness.mjs` 使用项目实际 Vite 配置、React、Lucide 和 Tailwind，只对 Tauri IPC 注入测试替身。启动后可通过 `tests/browser.mjs` 执行浏览器回归；该脚本可通过 `PROMPT_NOTE_BROWSER_MODULES` 复用已有 Playwright，通过 `PROMPT_NOTE_CHROMIUM` 指定浏览器路径。测试桥接替身不能证明系统剪贴板、原生托盘、EXE 或单实例已经通过真实 Windows 测试。

`tests/single-instance.test.ts` 检查插件注册顺序、窗口恢复入口和验收脚本的进程隔离；CI 在构建 EXE 后通过 `scripts/verify-single-instance.ps1` 实际启动两次验证进程互斥。脚本遇到目标路径的应用已经运行时会拒绝启动验收，避免关闭现有工作窗口。本地前端依赖已齐备，原生工具链安装与单实例实测进展见 [任务进度](docs/TASK-PROGRESS.md)。
