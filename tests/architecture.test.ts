import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// 在内存文件系统执行真实检查脚本，验证它能拒绝错误图，不修改项目文件。
const script = readFileSync(new URL('../scripts/check-cycles.mjs', import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/gm, '');
const base = {
  'src/a.ts': "import './b';",
  'src/b.ts': 'export const value = 1;',
  'src-tauri/Cargo.toml': '[lib]\nname = "fixture_lib"\n',
  'src-tauri/src/main.rs': 'fn main() { fixture_lib::run(); }',
  'src-tauri/src/lib.rs': 'mod tray;\nmod window;\npub fn run() {}',
  'src-tauri/src/tray.rs': 'fn open() { crate::window::show(); }',
  'src-tauri/src/window.rs': 'pub fn show() {}',
};
function check(files: Record<string, string>): string[] {
  const root = resolve('tests/artifacts/in-memory-architecture');
  const key = (path: string) => relative(root, path).replaceAll('\\', '/');
  const output: string[] = [];
  runInNewContext(script, {
    basename, dirname, extname, relative,
    resolve: (...parts: string[]) => resolve(root, ...parts),
    process: { cwd: () => root },
    console: { log: (message: string) => output.push(message) },
    existsSync: (path: string) => Object.hasOwn(files, key(path)),
    readFileSync: (path: string) => {
      const value = files[key(path)];
      if (value === undefined) throw new Error(`测试文件不存在：${key(path)}`);
      return value;
    },
    readdirSync: (directory: string, options?: { withFileTypes?: boolean }) => {
      const prefix = `${key(directory)}/`;
      const names = Object.keys(files).filter(name => name.startsWith(prefix))
        .map(name => name.slice(prefix.length)).filter(name => !name.includes('/'));
      return options?.withFileTypes ? names.map(name => ({ name, isDirectory: () => false })) : names;
    },
  });
  return output;
}
test('架构检查接受无环图，并识别 TypeScript 及 Rust 模块', () => {
  assert.match(check(base)[0], /2 个前端模块及 4 个 Rust 生产模块/);
});
test('架构检查拒绝前端循环和缺失的本地导入', () => {
  assert.throws(() => check({ ...base, 'src/b.ts': "import './a';" }), /发现循环依赖/);
  assert.throws(() => check({ ...base, 'src/a.ts': "import './missing';" }), /本地导入缺失/);
});
test('架构检查拒绝 Rust 对入口反向依赖及缺失的模块', () => {
  assert.throws(() => check({ ...base, 'src-tauri/src/tray.rs': 'fn open() { crate::show(); }' }), /发现循环依赖/);
  assert.throws(() => check({ ...base, 'src-tauri/src/lib.rs': 'mod missing;' }), /Rust 模块缺失/);
});
