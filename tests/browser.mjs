import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const modules = process.env.PROMPT_NOTE_BROWSER_MODULES;
if (!modules) throw new Error('请提供已有 Playwright 的 PROMPT_NOTE_BROWSER_MODULES。');
const require = createRequire(join(resolve(modules), '__browser__.cjs'));
const { chromium, expect } = require('playwright/test');
const browser = await chromium.launch({
  executablePath: process.env.PROMPT_NOTE_CHROMIUM,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
const bridge = expression => page.evaluate(expression);
const passed = [];
async function check(name, run) { await run(); passed.push(name); console.log(`通过：${name}`); }
try {
  await page.goto('http://127.0.0.1:1429');
  await expect(page.getByRole('heading', { name: '全部分类' })).toBeVisible();
  await page.clock.install();
  await check('侧栏在 800px 断点两侧保留相同可访问名称，不修改折叠样式', async () => {
    const buttons = page.locator('.sidebar button');
    const names = await buttons.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
    assert.ok(names.every(name => typeof name === 'string' && name.length > 0));
    for (const width of [801, 799]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [index, name] of names.entries()) await expect(buttons.nth(index)).toHaveAccessibleName(name);
      const label = page.locator('.sidebar .nav-item > span').first();
      if (width < 800) await expect(label).toBeHidden();
      else await expect(label).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('分类首页与完整托盘数据', async () => {
    await expect(page.locator('.project-card')).toHaveCount(3);
    await expect.poll(() => bridge(() => window.__testBridge.tray?.groups.flatMap(group => group.prompts).length)).toBe(27);
    await expect.poll(() => bridge(() => window.__testBridge.listeners.get('tray-feedback')?.size)).toBe(1);
    assert.equal(await bridge(() => window.__testBridge.unlistenCalls), 1, 'StrictMode 首次清理只能注销一次');
    await page.screenshot({ path: join(shots, 'projects-desktop.png'), fullPage: true });
  });
  await page.locator('.project-open').first().click();
  await check('卡片自适应列数、标签与无标题字段', async () => {
    await expect(page.locator('.prompt-card')).toHaveCount(27);
    assert.equal(await page.locator('.prompt-collection').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 3);
    await page.screenshot({ path: join(shots, 'desktop.png'), fullPage: true });
  });
  await check('点击空白复制并显示 toast', async () => {
    await page.locator('.copy-surface').first().click({ position: { x: 15, y: 65 } });
    await expect(page.getByRole('status').filter({ hasText: '已复制到剪贴板' })).toBeVisible();
    assert.equal(await bridge(() => window.__testBridge.copies), 1);
  });
  await check('收藏与编辑动作不会触发复制', async () => {
    await page.locator('.prompt-card').first().getByRole('button', { name: '已收藏', exact: true }).click();
    await expect(page.locator('.prompt-card').first().getByRole('button', { name: '收藏', exact: true })).toBeVisible();
    assert.equal(await bridge(() => window.__testBridge.copies), 1);
    await page.locator('.prompt-card').first().getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByLabel('提示词内容', { exact: false })).toBeVisible();
    await expect(page.locator('dialog input[id*="title"]')).toHaveCount(0);
    await page.screenshot({ path: join(shots, 'editor.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
  });
  await check('内容和标签搜索、收藏筛选', async () => {
    await page.getByRole('searchbox').fill('Code review');
    await expect(page.locator('.prompt-card')).toHaveCount(7);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: '仅看收藏' }).click();
    await expect(page.locator('.prompt-card')).toHaveCount(8);
    await page.getByRole('button', { name: '仅看收藏' }).click();
  });
  await check('列表布局与英文切换', async () => {
    await page.getByRole('button', { name: '列表视图' }).click();
    await expect(page.locator('.prompt-collection')).toHaveClass(/list/);
    await page.clock.runFor(4000);
    await page.screenshot({ path: join(shots, 'list-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.getByRole('button', { name: 'Favorites only' })).toBeVisible();
    await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('en');
    await expect.poll(() => bridge(() => window.__testBridge.tray?.labels.showWindow)).toBe('Open workspace');
    await page.clock.runFor(4000);
    await page.screenshot({ path: join(shots, 'english-list.png'), fullPage: true });
  });
  await check('同卡短拖及卡外释放不误复制或保存排序', async () => {
    const card = await page.locator('.prompt-card').first().boundingBox();
    const before = await bridge(() => ({ copies: window.__testBridge.copies, mutations: window.__testBridge.mutations }));
    // 使用卡片实际高度，兼容单行列表与多行卡片。
    await page.mouse.move(card.x + 25, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + 65, card.y + card.height / 2);
    await page.mouse.up();
    assert.equal(await bridge(() => window.__testBridge.copies), before.copies);
    await page.mouse.move(card.x + 25, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x - 10, card.y + card.height / 2);
    await page.clock.runFor(400);
    await page.mouse.up();
    await expect(page.locator('.is-dragging')).toHaveCount(0);
    assert.equal(await bridge(() => window.__testBridge.mutations), before.mutations);
  });
  await check('窗口失焦与指针取消清除拖动，之后仍能重新拖动', async () => {
    const card = await page.locator('.prompt-card').first().boundingBox();
    for (const reason of ['blur', 'pointercancel']) {
      await page.mouse.move(card.x + 25, card.y + card.height / 2);
      await page.mouse.down();
      await page.clock.runFor(350);
      await expect(page.locator('.is-dragging')).toHaveCount(1);
      if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
      else await page.locator('.prompt-card').first().dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
      await expect(page.locator('.is-dragging')).toHaveCount(0);
      await page.mouse.up();
      await expect(page.locator('.drop-target')).toHaveCount(0);
    }
    assert.equal(await bridge(() => window.__testBridge.copies), 1);
  });
  await check('长按拖动排序，松开不误复制', async () => {
    const source = await page.locator('.prompt-card').first().boundingBox();
    const target = await page.locator('.prompt-card').nth(1).boundingBox();
    await page.mouse.move(source.x + 20, source.y + source.height / 2);
    await page.mouse.down();
    await page.clock.runFor(350);
    await expect(page.locator('.is-dragging')).toHaveCount(1);
    await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('.prompt-card').first()).toHaveAttribute('data-prompt-id', 'prompt-1');
    assert.equal(await bridge(() => window.__testBridge.copies), 1);
  });
  await check('释放时重新命中卡片或空白，不沿用最后一次移动目标', async () => {
    const ids = await page.locator('.prompt-card').evaluateAll(cards => cards.slice(0, 3).map(card => card.dataset.promptId));
    const source = page.locator(`[data-prompt-id="${ids[0]}"]`);
    const before = await bridge(() => ({ copies: window.__testBridge.copies, mutations: window.__testBridge.mutations }));
    for (const outside of [true, false]) {
      await source.scrollIntoViewIfNeeded();
      const start = await source.boundingBox();
      const previous = await page.locator(`[data-prompt-id="${ids[1]}"]`).boundingBox();
      const release = await page.locator(`[data-prompt-id="${ids[2]}"]`).boundingBox();
      await page.mouse.move(start.x + 20, start.y + start.height / 2);
      await page.mouse.down();
      await page.clock.runFor(350);
      await expect(source).toHaveClass(/is-dragging/);
      await page.mouse.move(previous.x + 20, previous.y + previous.height / 2);
      await expect(page.locator(`[data-prompt-id="${ids[1]}"]`)).toHaveClass(/drop-target/);
      // 直接提供释放坐标，确保中间没有 pointermove 更新落点。
      await source.dispatchEvent('pointerup', {
        pointerId: 1, isPrimary: true, button: 0,
        clientX: outside ? 2 : release.x + 20,
        clientY: outside ? 2 : release.y + release.height / 2,
      });
      await page.mouse.up();
      await expect(page.locator('.is-dragging, .drop-target')).toHaveCount(0);
      if (outside) assert.equal(await bridge(() => window.__testBridge.mutations), before.mutations);
      else {
        await expect.poll(() => bridge(() => window.__testBridge.mutations)).toBe(before.mutations + 1);
        const ordered = await page.locator('.prompt-card').evaluateAll(cards => cards.slice(0, 3).map(card => card.dataset.promptId));
        assert.deepEqual(ordered, [ids[1], ids[2], ids[0]]);
      }
    }
    assert.equal(await bridge(() => window.__testBridge.copies), before.copies);
  });
  await check('跨分类新建独立副本，原项目提示词不泄漏', async () => {
    await page.getByRole('button', { name: 'New prompt', exact: true }).first().click();
    await page.getByLabel('Prompt content', { exact: false }).fill('Independent copy test');
    await page.getByLabel('Tags', { exact: true }).fill('独立, Test');
    await page.locator('.category-choice').filter({ hasText: '产品设计' }).click();
    await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    const copies = await bridge(() => window.__testBridge.library.prompts.filter(prompt => prompt.content === 'Independent copy test'));
    assert.equal(copies.length, 2); assert.notEqual(copies[0].id, copies[1].id);
    await page.locator('.sidebar .nav-item').filter({ hasText: '产品设计' }).click();
    await expect(page.locator('.prompt-card')).toHaveCount(1);
    await page.locator('.prompt-card').first().getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Prompt content', { exact: false }).fill('Changed design copy only');
    await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    assert.equal(await bridge(() => window.__testBridge.library.prompts.filter(prompt => prompt.content === 'Independent copy test').length), 1);
  });
  await check('删除确认、取消及实际删除', async () => {
    await page.locator('.prompt-card').first().getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.prompt-card')).toHaveCount(1);
    await page.locator('.prompt-card').first().getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(page.locator('.prompt-card')).toHaveCount(0);
  });
  await check('Ctrl 滚轮上下缩放 50–200% 与重置', async () => {
    await page.getByRole('button', { name: 'General', exact: true }).click();
    for (let i = 0; i < 20; i++) await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true })));
    await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('200%');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().width < 200), true);
    assert.equal(await page.locator('.content-scroll').evaluate(element => element.getBoundingClientRect().height > 120), true);
    await page.clock.runFor(4000);
    await page.screenshot({ path: join(shots, 'zoom-200.png'), fullPage: true });
    for (let i = 0; i < 30; i++) await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 100, cancelable: true })));
    await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('50%');
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('100%');
  });
  await check('设置保存、语言/布局偏好刷新保留，订阅没有重复', async () => {
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('radio', { name: 'Ocean', exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ocean');
    await page.keyboard.press('Escape');
    await expect.poll(() => bridge(() => window.__testBridge.tray?.autoInsert)).toBe(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
    await expect.poll(() => bridge(() => window.__testBridge.listeners.get('tray-feedback')?.size)).toBe(1);
    assert.equal(await page.evaluate(() => localStorage.getItem('view')), 'list');
    assert.equal(await page.evaluate(() => localStorage.getItem('palette')), 'ocean');
  });
  await check('分类新建、重命名、删除空分类', async () => {
    await page.getByRole('button', { name: 'All projects', exact: false }).click();
    await page.getByRole('button', { name: 'New project', exact: true }).first().click();
    await page.getByLabel('Project name').fill('Research');
    await page.locator('dialog').getByRole('button', { name: 'New project', exact: true }).click();
    await expect(page.locator('.project-card')).toHaveCount(4);
    const project = page.locator('.project-card').filter({ hasText: 'Research' });
    await project.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Project name').fill('Research notes');
    await page.locator('dialog').getByRole('button', { name: 'Rename project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Research notes' })).toBeVisible();
    await project.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(page.locator('.project-card')).toHaveCount(3);
  });
  await check('窄屏、中文和两种布局无水平溢出', async () => {
    await page.getByRole('button', { name: '切换为中文' }).click();
    await page.locator('.project-open').first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(page.locator('.desktop-create')).toBeHidden();
    await expect(page.locator('.mobile-create')).toBeVisible();
    await page.clock.runFor(4000);
    await page.screenshot({ path: join(shots, 'mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '卡片视图' }).click();
    await page.screenshot({ path: join(shots, 'mobile-grid.png'), fullPage: true });
  });
  await check('剪贴板失败无成功提示、托盘回调 toast', async () => {
    await page.clock.runFor(4000);
    await bridge(() => { window.__testBridge.fail = 'clipboard'; });
    await page.locator('.copy-surface').first().click({ position: { x: 12, y: 50 } });
    await expect(page.getByRole('alert').filter({ hasText: '复制失败' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '已复制到剪贴板' })).toHaveCount(0);
    await bridge(() => { window.__testBridge.fail = ''; window.__testBridge.emit('tray-feedback', 'copiedTray'); });
    await expect(page.getByRole('status').filter({ hasText: '已通过托盘复制' })).toBeVisible();
  });
  await check('卡片按 ID 复制数据库最新内容，不使用过期界面内容', async () => {
    const id = await page.locator('.prompt-card').first().getAttribute('data-prompt-id');
    await page.evaluate(id => {
      const bridge = window.__testBridge;
      bridge.library = { ...bridge.library, prompts: bridge.library.prompts.map(prompt => prompt.id === id ? { ...prompt, content: 'Fresh native content' } : prompt) };
    }, id);
    await page.locator('.copy-surface').first().click({ position: { x: 12, y: 50 } });
    await expect.poll(() => bridge(() => window.__testBridge.clipboard)).toBe('Fresh native content');
  });
  await check('复制成功但使用记录失败时给出独立提示，不误报剪贴板失败', async () => {
    await page.clock.runFor(4000);
    for (const button of await page.locator('.toast-error .icon-button').all()) await button.click();
    const count = await bridge(() => window.__testBridge.copies);
    await bridge(() => { window.__testBridge.fail = 'history'; });
    await page.locator('.copy-surface').first().click({ position: { x: 12, y: 50 } });
    await expect.poll(() => bridge(() => window.__testBridge.copies)).toBe(count + 1);
    await expect(page.getByRole('alert').filter({ hasText: '已复制，但使用记录未能保存' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '复制失败' })).toHaveCount(0);
    await bridge(() => { window.__testBridge.fail = ''; });
  });
  await check('最小 640×480 窗口在 200% 缩放时，两种布局操作和编辑弹窗均可达', async () => {
    await page.clock.runFor(4000);
    for (const button of await page.locator('.toast-error .icon-button').all()) await button.click();
    await page.setViewportSize({ width: 640, height: 480 });
    for (let index = 0; index < 10; index++) await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true })));
    await expect(page.getByRole('button', { name: '重置缩放' })).toHaveText('200%');
    assert.equal(await page.locator('.workspace').evaluate(element => getComputedStyle(element).overflowY), 'auto');
    for (const [label, filename] of [['卡片视图', 'min-window-grid-200.png'], ['列表视图', 'min-window-list-200.png']]) {
      await page.getByRole('button', { name: label }).click();
      const edit = page.locator('.prompt-card').first().getByRole('button', { name: '编辑', exact: true });
      await edit.scrollIntoViewIfNeeded();
      await expect(edit).toBeInViewport({ ratio: 1 });
      await edit.click();
      await expect(page.locator('dialog')).toBeVisible();
      assert.ok((await page.locator('dialog').boundingBox()).height <= 480);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '重置缩放' })).toBeInViewport();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(shots, filename), fullPage: true });
    }
  });
  await check('拖动取消后仍可通过 Enter 和空格复制，不泄漏手势状态', async () => {
    // 本项验证键盘恢复，先退出上一项的极限窗口与缩放配置。
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '重置缩放' }).click();
    const card = page.locator('.prompt-card').first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const count = await bridge(() => window.__testBridge.copies);
    await page.mouse.move(box.x + 25, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.runFor(350);
    await expect(page.locator('.is-dragging')).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await page.mouse.up();
    assert.equal(await bridge(() => window.__testBridge.copies), count);
    await card.locator('.copy-surface').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => bridge(() => window.__testBridge.copies)).toBe(count + 1);
    await page.keyboard.press('Space');
    await expect.poll(() => bridge(() => window.__testBridge.copies)).toBe(count + 2);
  });
  await check('未知托盘事件不能通过对象原型成员生成空白反馈', async () => {
    await page.locator('.toast .icon-button').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await bridge(() => {
      for (const payload of ['toString', 'constructor', '__proto__']) window.__testBridge.emit('tray-feedback', payload);
    });
    await page.clock.runFor(50);
    await expect(page.locator('.app-shell')).toHaveCount(1);
    await expect(page.locator('.toast')).toHaveCount(0);
  });
  await check('22 条提示词跨托盘分页阈值，切换分类、搜索和收藏仍完整传给原生命令', async () => {
    const trayContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const trayPage = await trayContext.newPage();
      trayPage.on('pageerror', error => errors.push(error.message));
      await trayPage.addInitScript(() => { window.__promptCount = 22; });
      await trayPage.goto('http://127.0.0.1:1429');
      await expect(trayPage.getByRole('heading', { name: '全部分类' })).toBeVisible();
      const expected = Array.from({ length: 22 }, (_, index) => `prompt-${index}`).sort();
      const allIds = () => trayPage.evaluate(() => window.__testBridge.tray?.groups.flatMap(group => group.prompts.map(prompt => prompt.id)).sort());
      await expect.poll(allIds).toEqual(expected);
      await trayPage.getByRole('button', { name: '默认分类', exact: true }).click();
      await expect(trayPage.locator('.prompt-card')).toHaveCount(22);
      await trayPage.getByRole('searchbox').fill('Code review');
      await expect(trayPage.locator('.prompt-card')).toHaveCount(6);
      await expect.poll(allIds).toEqual(expected);
      await trayPage.getByRole('button', { name: '仅看收藏' }).click();
      await expect.poll(allIds).toEqual(expected);
      await trayPage.getByRole('button', { name: '产品设计', exact: true }).click();
      await expect(trayPage.locator('.prompt-card')).toHaveCount(0);
      await expect.poll(allIds).toEqual(expected);
      // 切换语言强制重新发送菜单，验证同步入口仍传入完整库而非空分类结果。
      await trayPage.getByRole('button', { name: 'Switch to English' }).click();
      await expect.poll(() => trayPage.evaluate(() => window.__testBridge.tray?.labels.showWindow)).toBe('Open workspace');
      await expect.poll(allIds).toEqual(expected);
    } finally { await trayContext.close(); }
  });
  await check('固定读取入口失败可见，写入成功后不会误报或引导重复提交', async () => {
    const card = page.locator('.prompt-card').first();
    const id = await card.getAttribute('data-prompt-id');
    const favorite = await page.evaluate(id => window.__testBridge.library.prompts.find(prompt => prompt.id === id).isFavorite, id);
    await bridge(() => { window.__testBridge.fail = 'get_library'; });
    await card.getByRole('button', { name: /^(收藏|已收藏)$/ }).click();
    await expect(page.locator('.content-scroll [role="alert"]')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '写入已完成，但列表刷新失败' })).toBeVisible();
    await bridge(() => { window.__testBridge.fail = ''; });
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.locator(`[data-prompt-id="${id}"]`).getByRole('button', { name: favorite ? '收藏' : '已收藏', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(id => window.__testBridge.library.prompts.find(prompt => prompt.id === id).isFavorite, id), !favorite);
  });
  for (const fail of [false, true]) await check(fail
    ? '失效的初始读取失败不能覆盖最新的成功状态'
    : '旧的初始读取晚返回不能覆盖已保存的收藏状态', async () => {
    const raceContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const racePage = await raceContext.newPage();
      racePage.on('pageerror', error => errors.push(error.message));
      await racePage.addInitScript(() => { window.__holdInitialRead = true; });
      await racePage.goto('http://127.0.0.1:1429');
      await expect(racePage.getByRole('heading', { name: '全部分类' })).toBeVisible();
      assert.equal(await racePage.evaluate(() => window.__testBridge.pendingReads.length), 1);
      await racePage.locator('.project-open').first().click();
      const card = racePage.locator('[data-prompt-id="prompt-0"]');
      await card.getByRole('button', { name: '已收藏', exact: true }).click();
      await expect(card.getByRole('button', { name: '收藏', exact: true })).toBeVisible();
      await racePage.evaluate(async fail => {
        const pending = window.__testBridge.pendingReads.splice(0);
        for (const resolve of pending) resolve(fail);
        // 排空读取、Promise.all 及 React 更新的任务队列，不使用任意长延迟。
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, fail);
      await expect(card.getByRole('button', { name: '收藏', exact: true })).toBeVisible();
      assert.equal(await racePage.evaluate(() => window.__testBridge.library.prompts.find(prompt => prompt.id === 'prompt-0').isFavorite), false);
    } finally { await raceContext.close(); }
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: passed.length, checks: passed, pageErrors: errors }, null, 2));
} catch (error) {
  console.error('浏览器错误：', errors);
  console.error((await page.locator('body').innerText()).slice(0, 6000));
  await page.screenshot({ path: join(shots, 'failure.png'), fullPage: true });
  throw error;
} finally { await browser.close(); }
