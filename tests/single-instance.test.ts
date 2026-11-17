import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 配置回归仅防止实现退化；真正的进程互斥仍由 Windows EXE 验收。
test('单实例插件唯一且最先注册，先于数据库、托盘和应用 setup', () => {
  const entry = source('../src-tauri/src/lib.rs');
  const plugins = [...entry.matchAll(/\.plugin\(\s*([a-z_]+)::/g)].map(match => match[1]);
  assert.equal(plugins[0], 'tauri_plugin_single_instance');
  assert.equal(plugins.filter(name => name === 'tauri_plugin_single_instance').length, 1);
  const singleton = entry.indexOf('.plugin(tauri_plugin_single_instance::');
  for (const token of ['.plugin(tauri_plugin_sql::', '.manage(tray::', '.setup(']) {
    assert.ok(entry.indexOf(token) > singleton, `${token} 必须晚于单实例保护`);
  }
  assert.match(entry, /tauri_plugin_single_instance::init\(\|app, _, _\|[\s\S]*?window::show_workspace\(app\)/);
  assert.doesNotMatch(source('../src-tauri/Cargo.toml'), /features\s*=\s*\[[^\]]*"semver"/);
});

test('重复启动恢复隐藏或最小化窗口，窗口操作失败不会被静默忽略', () => {
  const window = source('../src-tauri/src/window.rs');
  assert.match(window, /get_webview_window\("main"\)/);
  const operations = ['window.unminimize()?;', 'window.show()?;', 'window.set_focus()?;'];
  for (const operation of operations) assert.ok(window.includes(operation), operation);
  assert.ok(window.indexOf(operations[1]) < window.indexOf(operations[2]));
  assert.match(source('../src-tauri/src/lib.rs'), /if let Err\(error\) = window::show_workspace\(app\)/);
});

test('原生验收按完整路径隔离，拒绝干扰已有实例且只清理本次启动的进程', () => {
  const script = source('../scripts/verify-single-instance.ps1');
  assert.match(script, /Resolve-Path -LiteralPath \$Executable/);
  assert.match(script, /\$_\.Path -eq \$target/);
  // 缺失检查会返回 -1，必须先确认两个标记存在，才能比较先后顺序。
  const guard = script.indexOf('if (@(Get-TargetInstance).Count -ne 0)');
  const launch = script.indexOf('Start-Process');
  assert.ok(guard >= 0, '必须存在已有实例检查');
  assert.ok(launch >= 0, '必须存在进程启动命令');
  assert.ok(guard < launch, '已有实例检查必须先于启动');
  assert.match(script, /\$second\.WaitForExit\(15000\)/);
  assert.match(script, /\$instances\.Count -ne 1/);
  assert.match(script, /finally[\s\S]*foreach \(\$process in @\(\$second, \$first\)\)/);
  assert.doesNotMatch(script, /(?:Get|Stop)-Process -Name/);
});
