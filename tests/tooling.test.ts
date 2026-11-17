import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

test('lint 解析器、插件和编译器 API 链只加载同一份隔离 TypeScript 6', async () => {
  const root = createRequire(new URL('../package.json', import.meta.url));
  const lint = createRequire(new URL('../tools/lint/adapter.mjs', import.meta.url));
  // 同时核对真实 ESM adapter，避免只验证 require 分支而遗漏实际导入入口。
  const adapter = await import(new URL('../tools/lint/adapter.mjs', import.meta.url).href);
  assert.equal(adapter.default.parser, lint('typescript-eslint').parser);
  assert.equal(adapter.default.plugin, lint('typescript-eslint').plugin);
  const load = (parent: NodeJS.Require, name: string) => createRequire(parent.resolve(name));
  const umbrella = load(lint, 'typescript-eslint');
  const parser = load(umbrella, '@typescript-eslint/parser');
  const plugin = load(umbrella, '@typescript-eslint/eslint-plugin');
  const estree = load(parser, '@typescript-eslint/typescript-estree');
  const project = load(estree, '@typescript-eslint/project-service');
  const typeUtils = load(plugin, '@typescript-eslint/type-utils');
  const utils = load(plugin, '@typescript-eslint/utils');
  const apiUtils = load(estree, 'ts-api-utils');
  const compiler = realpathSync(lint.resolve('typescript'));
  assert.match(lint('typescript/package.json').version, /^6\./);
  assert.match(root('typescript/package.json').version, /^7\./);
  assert.notEqual(realpathSync(root.resolve('typescript')), compiler);
  for (const dependent of [umbrella, parser, plugin, estree, project, typeUtils, utils, apiUtils]) {
    assert.equal(realpathSync(dependent.resolve('typescript')), compiler);
    assert.equal(dependent('typescript'), lint('typescript'), '不得混用不同 compiler API 实例');
  }
  assert.equal(project('typescript/lib/tsserverlibrary'), lint('typescript'));
  assert.equal(realpathSync(utils.resolve('@typescript-eslint/typescript-estree')), realpathSync(parser.resolve('@typescript-eslint/typescript-estree')));
});

test('根配置是空 solution，应用、工具与测试由实际脚本独立 noEmit 检查', () => {
  const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.files, []);
  assert.equal(config.include, undefined);
  for (const path of ['tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.tests.json']) {
    assert.ok(config.references.some((reference: { path: string }) => reference.path === `./${path}`));
    assert.ok(pkg.scripts.typecheck.includes(`tsc --noEmit -p ${path}`));
  }
});
