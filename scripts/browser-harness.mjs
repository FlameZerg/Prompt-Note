import { resolve } from 'node:path';
import { createServer } from 'vite';

// 使用项目真实配置、React、图标和 Tailwind；只有原生 IPC 使用测试替身。
const server = await createServer({
  configFile: resolve('vite.config.ts'), root: process.cwd(), cacheDir: resolve('tests/artifacts/vite'),
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/(core|event)$/, replacement: resolve('tests/fixtures/native-bridge.ts') },
    ],
  },
  server: { host: '127.0.0.1', port: 1429, strictPort: true, hmr: false, fs: { allow: [process.cwd()] } },
});
await server.listen();
server.printUrls();
