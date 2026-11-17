import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 配置回归验证 IPC 边界，不将文本检查冒充原生权限执行测试。
test('前端不可加载任意 SQL 连接或通过 select、execute 绕过 Rust 事务', () => {
  const capabilities = new URL('../src-tauri/capabilities/', import.meta.url);
  for (const file of readdirSync(capabilities).filter(name => name.endsWith('.json'))) {
    const config = JSON.parse(readFileSync(new URL(file, capabilities), 'utf8'));
    for (const permission of config.permissions) {
      const name = typeof permission === 'string' ? permission : permission.identifier;
      assert.equal(name.startsWith('sql:'), false, `不得暴露通用 SQL 权限：${name}`);
    }
  }
  const config = JSON.parse(source('../src-tauri/tauri.conf.json'));
  assert.equal(config.identifier, 'promptnote');
  assert.deepEqual(config.plugins.sql.preload, ['sqlite:promptnote.db']);
  const frontend = source('../src/services/db.ts');
  assert.doesNotMatch(frontend, /plugin-sql|Database\.load|\.select\(/);
  assert.match(frontend, /invoke<Library>\('get_library'\)/);
  const read = source('../src-tauri/src/read.rs');
  assert.match(read, /pub async fn get_library\(app: AppHandle\)/);
  const queries = [...read.matchAll(/sqlx::query\("([^"]+)"\)/g)].map(match => match[1]);
  assert.equal(queries.length, 3);
  for (const query of queries) assert.match(query, /^SELECT /);
  assert.match(source('../src-tauri/src/lib.rs'), /generate_handler!\[read::get_library,/);
  assert.match(source('../src-tauri/src/store.rs'), /guard\.get\("sqlite:promptnote\.db"\)/);
  assert.match(source('../src-tauri/src/store.rs'), /let mut tx = pool\.begin\(\)\.await/);
});
