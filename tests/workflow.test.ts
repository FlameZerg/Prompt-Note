import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 仓库专用配置回归，不冒充已运行 GitHub Actions 或通用 YAML 语义验证。
const workflow = readFileSync(new URL('../.github/workflows/windows.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const steps = workflow.split(/^ {6}- /m).slice(1);
const buildCommand = 'node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked';

test('Windows 验收命令各自独立，前一个失败不能被后一个成功退出码覆盖', () => {
  const required = [
    'pnpm typecheck', 'pnpm lint', 'pnpm check:cycles', 'pnpm test',
    'cargo check --locked', 'cargo test --locked --lib', buildCommand,
    './scripts/verify-single-instance.ps1',
  ];
  for (const command of required) {
    const matching = steps.filter(step => step.includes(`run: ${command}\n`));
    assert.equal(matching.length, 1, `验收命令应有独立步骤：${command}`);
    assert.equal(matching[0].includes('continue-on-error: true'), false);
    assert.equal(matching[0].includes('run: |'), false);
  }
});

test('真实 Node 调用保留 Tauri 到 Cargo 的分隔符，CLI 解析不启动原生构建', () => {
  const step = steps.find(step => step.includes('name: Build portable executable'));
  const command = step?.match(/^\s+run: ([^\n]+)$/m)?.[1];
  assert.equal(command, buildCommand);
  const [runtime, entry, ...args] = command.split(' ');
  assert.equal(runtime, 'node');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const cli = resolve(root, entry);
  const require = createRequire(import.meta.url);
  assert.equal(realpathSync(cli), realpathSync(require.resolve('@tauri-apps/cli/tauri.js')));
  const options = { cwd: root, encoding: 'utf8' as const, timeout: 15_000, windowsHide: true };
  // 在真实 CLI 入口执行前捕获 argv，不加载 Rust 工具链或执行构建钩子。
  const capture = spawnSync(process.execPath, [
    '--import', new URL('./fixtures/capture-cli-argv.mjs', import.meta.url).href, cli, ...args,
  ], options);
  assert.ifError(capture.error);
  assert.equal(capture.status, 0, capture.stderr);
  const argv: string[] = JSON.parse(capture.stdout);
  assert.equal(realpathSync(argv[0]), realpathSync(cli));
  assert.deepEqual(argv.slice(1), ['build', '--no-bundle', '--', '--locked']);
  // 再加载实际 CLI 做 help 解析，验证 Tauri 接受这组参数，但不启动 Cargo。
  const separator = args.indexOf('--');
  const help = spawnSync(process.execPath, [
    cli, ...args.slice(0, separator), '--help', ...args.slice(separator),
  ], options);
  assert.ifError(help.error);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: .* build/);
  assert.doesNotMatch(help.stderr, /unexpected argument/);
});

test('每次 push 触发 Windows 构建，只有检查和打包成功才直接上传 Prompt-Note.zip', () => {
  assert.match(workflow, /^on:\n {2}push:/m);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /^ {6}BUILD_ARTIFACT_NAME: Prompt-Note\.zip$/m);
  const uploadIndex = steps.findIndex(step => step.includes('name: Upload portable ZIP'));
  const singleInstanceIndex = steps.findIndex(step => step.includes('name: Verify native single instance'));
  const packageIndex = steps.findIndex(step => step.includes('name: Package portable ZIP'));
  const cleanupIndex = steps.findIndex(step => step.includes('name: Clean up old artifacts of this workflow'));
  assert.ok(singleInstanceIndex >= 0 && packageIndex > singleInstanceIndex);
  assert.ok(cleanupIndex > packageIndex && uploadIndex > cleanupIndex);
  // 外层包名与包内程序名分别约束，防止一起替换空格。
  assert.match(steps[packageIndex], /Get-Item -LiteralPath 'src-tauri\/target\/release\/Prompt Note\.exe'/);
  const upload = steps[uploadIndex];
  // 仅上传已校验的 ZIP，并禁用二次归档；原名 EXE 只保留在 ZIP 内。
  const paths = [...upload.matchAll(/^\s+path: ([^\n]+)$/gm)].map(match => match[1]);
  assert.deepEqual(paths, ['artifacts/${{ env.BUILD_ARTIFACT_NAME }}']);
  assert.match(upload, /^\s+archive: false$/m);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(steps[packageIndex] + upload, /\bif:|\bcontinue-on-error:/);
  assert.doesNotMatch(workflow, /--bundles\b|\bnsis\b|\bmsi\b|setup\.exe|installer/i);
  assert.doesNotMatch(workflow, /gh release|action-gh-release|contents: write/);
  const verify = steps.find(step => step.includes('name: Verify EXE output'));
  assert.ok(verify);
  assert.match(verify, /Test-Path -LiteralPath 'src-tauri\/target\/release\/Prompt Note\.exe'/);
});

test('真实 ZIP 打包保留根目录原名与二进制内容，缺失或空输入立即失败', {
  skip: process.platform !== 'win32' && '实际打包检查需要 Windows PowerShell',
}, () => {
  const step = steps.find(step => step.includes('name: Package portable ZIP'));
  const script = step?.match(/run: \|\n([\s\S]*)/)?.[1].replace(/^ {10}/gm, '');
  assert.ok(script, '必须存在可独立执行的打包脚本');
  const root = mkdtempSync(join(tmpdir(), 'prompt-note-delivery-'));
  const executable = join(root, 'src-tauri', 'target', 'release', 'Prompt Note.exe');
  const archiveName = 'Prompt-Note.zip';
  const options = {
    cwd: root, encoding: 'utf8' as const, timeout: 30_000, windowsHide: true,
    env: { ...process.env, BUILD_ARTIFACT_NAME: archiveName },
  };
  const run = (command: string) => {
    // 固定管道编码，确保中文错误在不同 Windows 控制台代码页下仍可定位。
    const utf8Command = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n${command}`;
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', utf8Command], options);
    assert.ifError(result.error);
    return result;
  };
  try {
    mkdirSync(join(root, 'src-tauri', 'target', 'release'), { recursive: true });
    const missing = run(script);
    assert.notEqual(missing.status, 0, '缺失主程序必须阻止交付');
    assert.equal(existsSync(join(root, 'artifacts', archiveName)), false);
    writeFileSync(executable, Buffer.alloc(0));
    const empty = run(script);
    assert.notEqual(empty.status, 0, '空主程序必须阻止交付');
    assert.match(empty.stderr, /主程序不是有效的非空文件/);
    // 这是压缩流程的二进制夹具，不是可运行 EXE，也不替代原生应用验收。
    writeFileSync(executable, Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 256)));
    const packaged = run(`${script}
      $sourceHash = (Get-FileHash -LiteralPath $executable.FullName -Algorithm SHA256).Hash
      $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $archivePath).Path)
      try {
        $stream = $zip.Entries[0].Open()
        try {
          if ((Get-FileHash -InputStream $stream -Algorithm SHA256).Hash -cne $sourceHash) {
            throw 'ZIP 内容哈希与源文件不一致'
          }
        } finally { $stream.Dispose() }
      } finally { $zip.Dispose() }
    `);
    assert.equal(packaged.status, 0, packaged.stderr);
    assert.ok(existsSync(join(root, 'artifacts', archiveName)));
  } finally {
    // 只移除本次 mkdtemp 创建的独立测试目录，不触碰仓库或真实应用文件。
    assert.equal(root.startsWith(join(tmpdir(), 'prompt-note-delivery-')), true);
    rmSync(root, { recursive: true, force: true });
  }
});
