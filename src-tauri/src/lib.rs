mod store;
mod read;
mod tray;
mod window;
mod migrations;
mod startup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 必须第一个注册，在数据库和托盘初始化之前排除重复实例。
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Err(error) = window::show_workspace(app) {
                eprintln!("唤回现有窗口失败：{error}");
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        // SQL 插件只预加载原连接池，历史迁移兼容检查在应用初始化时统一执行。
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(tray::TrayState::default())
        .setup(|app| {
            tauri::async_runtime::block_on(migrations::initialize(app.handle()))
                .map_err(std::io::Error::other)?;
            tray::setup(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read::get_library, store::mutate_library, tray::update_tray_menu, tray::copy_prompt])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| startup::fail(error))
        .run(|app, event| {
            if let tauri::RunEvent::WindowEvent {
                label, event: tauri::WindowEvent::CloseRequested { .. }, ..
            } = event {
                if label == "main" {
                    // 主窗口关闭即退出整个应用，不再隐藏窗口并驻留托盘。
                    app.exit(0);
                }
            }
        });
}
