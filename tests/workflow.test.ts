import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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

test('每次 push 触发 Windows 构建，只有检查成功才上传单个直接运行的 EXE', () => {
  assert.match(workflow, /^on:\n {2}push:/m);
  assert.match(workflow, /runs-on: windows-latest/);
  const uploadIndex = steps.findIndex(step => step.includes('name: Upload EXE files'));
  const singleInstanceIndex = steps.findIndex(step => step.includes('name: Verify native single instance'));
  assert.ok(singleInstanceIndex >= 0 && uploadIndex > singleInstanceIndex);
  const upload = steps[uploadIndex];
  // 必须只上传指定文件，禁止目录或通配符把安装器、DLL、调试文件混入产物。
  const paths = [...upload.matchAll(/^\s+path: ([^\n]+)$/gm)].map(match => match[1]);
  assert.deepEqual(paths, ['src-tauri/target/release/Prompt Note.exe']);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(upload, /\bif:|\bcontinue-on-error:/);
  assert.doesNotMatch(workflow, /--bundles\b|\bnsis\b|\bmsi\b|setup\.exe|installer/i);
  const verify = steps.find(step => step.includes('name: Verify EXE output'));
  assert.ok(verify);
  assert.match(verify, /Test-Path -LiteralPath 'src-tauri\/target\/release\/Prompt Note\.exe'/);
});
