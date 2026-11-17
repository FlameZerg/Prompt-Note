import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve, relative } from 'node:path';

// 零依赖静态图包含类型导入、重导出和字面量动态导入；缺失本地模块也快速失败。
const root = resolve('src');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(resolve(directory, entry.name))
      : /\.(ts|tsx)$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
}
const graph = new Map();
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)].map(match => match[1]);
  const dependencies = specs.map(spec => {
    const base = resolve(dirname(file), spec);
    const target = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]
      .find(candidate => existsSync(candidate) && extname(candidate));
    if (!target) throw new Error(`本地导入缺失：${relative(root, file)} → ${spec}`);
    return target;
  }).filter(target => /\.(ts|tsx)$/.test(target));
  graph.set(file, dependencies);
}
const frontendCount = graph.size;

// 检查当前仓库的平铺 Rust 生产模块及 crate:: 引用；测试模块不属于生产依赖图。
// 这是架构补充检查，不替代 Cargo 对 Rust 名称解析和 cfg 的验证。
const nativeRoot = resolve('src-tauri/src');
const nativeFiles = readdirSync(nativeRoot).filter(name => name.endsWith('.rs') && !name.endsWith('_tests.rs'));
const nativeModules = new Map(nativeFiles.map(name => [basename(name, '.rs'), resolve(nativeRoot, name)]));
const nativeLib = nativeModules.get('lib');
const cargo = readFileSync(resolve('src-tauri/Cargo.toml'), 'utf8');
const libraryName = cargo.match(/\[lib\][\s\S]*?\bname\s*=\s*"([^"]+)"/)?.[1];
if (!nativeLib || !libraryName) throw new Error('Rust 库入口或名称缺失。');
for (const [name, file] of nativeModules) {
  const text = readFileSync(file, 'utf8')
    .replace(/#\[cfg\(test\)\]\s*(?:#\[[^\]]+\]\s*)*mod\s+\w+\s*;/g, '')
    .replace(/#\[cfg\(test\)\]\s*mod\s+\w+\s*\{[\s\S]*$/, '');
  const dependencies = new Set();
  for (const match of text.matchAll(/\bmod\s+(\w+)\s*;/g)) {
    const target = nativeModules.get(match[1]);
    if (!target) throw new Error(`Rust 模块缺失：${name} → ${match[1]}`);
    dependencies.add(target);
  }
  for (const match of text.matchAll(/\bcrate::(\w+)/g)) {
    const target = nativeModules.get(match[1]) ?? nativeLib;
    if (target !== file) dependencies.add(target);
  }
  if (name === 'main' && text.includes(`${libraryName}::`)) dependencies.add(nativeLib);
  graph.set(file, [...dependencies]);
}
const visited = new Set();
const path = [];
function visit(file) {
  if (path.includes(file)) throw new Error(`发现循环依赖：${[...path.slice(path.indexOf(file)), file].map(item => relative(process.cwd(), item)).join(' → ')}`);
  if (visited.has(file)) return;
  path.push(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency);
  path.pop();
  visited.add(file);
}
for (const file of graph.keys()) visit(file);
console.log(`已检查 ${frontendCount} 个前端模块及 ${nativeModules.size} 个 Rust 生产模块：无循环依赖、无缺失本地导入。`);
