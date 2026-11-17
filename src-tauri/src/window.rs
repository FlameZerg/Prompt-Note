use tauri::Manager;

// 所有唤回入口统一恢复隐藏、最小化窗口；共享操作不反向依赖应用启动模块。
pub fn show_workspace(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}
