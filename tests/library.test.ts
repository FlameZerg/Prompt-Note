import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, filterPrompts, parseTags, reorderIds, validatePrompt } from '../src/utils/library.ts';
import type { Prompt } from '../src/types/index.ts';
import zh from '../src/locales/zh.ts';
import en from '../src/locales/en.ts';

const sample = (id: string, categoryId: string, position = 0): Prompt => ({
  id, categoryId, position, content: `Content ${id}`, tags: [{ id: 'tag', name: '代码', color: '#14786a' }],
  isFavorite: id === 'a', dateCreated: '2026-11-15T00:00:00Z', dateModified: '2026-11-15T00:00:00Z',
});
test('项目与收藏、搜索严格取交集，不泄漏其他分类', () => {
  const prompts = [sample('a', 'one'), sample('b', 'two'), sample('c', 'one')];
  assert.deepEqual(filterPrompts(prompts, 'one', '代码', true).map(item => item.id), ['a']);
  assert.deepEqual(filterPrompts(prompts, 'two', 'CONTENT', false).map(item => item.id), ['b']);
  assert.equal(filterPrompts(prompts, 'missing', '', false).length, 0);
});
test('排序返回新数组，正确处理双向移动、无效目标及原位', () => {
  const original = Object.freeze(['a', 'b', 'c']);
  assert.deepEqual(reorderIds([...original], 'a', 'c'), ['b', 'c', 'a']);
  assert.deepEqual(reorderIds([...original], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(reorderIds([...original], 'missing', 'a'), original);
  assert.deepEqual(reorderIds([...original], 'a', 'a'), original);
});
test('缩放严格限于 50–200%，处理非法存储值与浮点误差', () => {
  assert.equal(clampZoom(0), .5);
  assert.equal(clampZoom(5), 2);
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(1.200000000001), 1.2);
});
test('中英文分隔标签去空白、去重复，不丢失有效文本', () => {
  assert.deepEqual(parseTags('代码，Writing,代码\n  note ,, '), ['代码', 'Writing', 'note']);
});
test('表单验证内容、分类、标签上限与 Unicode 字符边界', () => {
  const base = { id: null, content: 'hello', categoryIds: ['one'], tags: ['tag'] };
  assert.equal(validatePrompt(base), null);
  assert.equal(validatePrompt({ ...base, content: '  ' }), 'contentRequired');
  assert.equal(validatePrompt({ ...base, content: 'a'.repeat(100001) }), 'contentRequired');
  assert.equal(validatePrompt({ ...base, categoryIds: [] }), 'categoryRequired');
  assert.equal(validatePrompt({ ...base, tags: ['a'.repeat(1000)] }), null);
  assert.equal(validatePrompt({ ...base, tags: ['  '] }), 'tagsInvalid');
  assert.equal(validatePrompt({ ...base, tags: Array(21).fill('tag') }), 'tagsInvalid');
  assert.equal(validatePrompt({ ...base, tags: ['😀'.repeat(1000)] }), null);
});
test('中英文键完全一致，界面文案没有空翻译', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  assert.equal(Object.values(zh).some(value => !value.trim()), false);
  assert.equal(Object.values(en).some(value => !value.trim()), false);
});
