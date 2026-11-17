// 仅供参数传递回归预加载，在 CLI 执行前退出，不冒充原生构建结果。
process.stdout.write(JSON.stringify(process.argv.slice(1)));
process.exit(0);
