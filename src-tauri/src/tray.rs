use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem, Submenu}, tray::{TrayIconBuilder, TrayIconEvent}, AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Default)]
pub struct TrayState {
    auto_insert: AtomicBool,
    // 连续选择托盘项时，同一时间只允许一组“复制＋粘贴”操作。
    copy_lock: tauri::async_runtime::Mutex<()>,
}

#[derive(Deserialize)]
pub struct TrayPrompt { id: String, label: String }
#[derive(Deserialize)]
pub struct TrayGroup { id: String, name: String, prompts: Vec<TrayPrompt> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels { show_window: String, quit: String, empty: String, more: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyResult { history_saved: bool }

// 窗口卡片与托盘共用复制锁；窗口入口永不触发自动粘贴或托盘重复提示。
#[tauri::command]
pub async fn copy_prompt(app: AppHandle, id: String) -> Result<CopyResult, String> {
    copy_from_database(&app, &id, false).await
}

// 仅限制可见标签长度，不限制条目数量；复制始终根据 ID 读取完整内容。
fn menu_label(value: &str, maximum: usize) -> String {
    let clean: String = value.chars().map(|character| if character.is_control() { ' ' } else { character }).collect();
    let normalized = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = if normalized.chars().count() > maximum {
        format!("{}…", normalized.chars().take(maximum).collect::<String>())
    } else { normalized };
    text.replace('&', "&&")
}

#[tauri::command]
pub fn update_tray_menu(app: AppHandle, groups: Vec<TrayGroup>, labels: TrayLabels, auto_insert: bool) -> Result<(), String> {
    build_menu(&app, groups, labels).map_err(|e| e.to_string())?;
    app.state::<TrayState>().auto_insert.store(auto_insert, Ordering::Relaxed);
    Ok(())
}

fn build_menu(app: &AppHandle, groups: Vec<TrayGroup>, labels: TrayLabels) -> tauri::Result<()> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "show-window", &labels.show_window, true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    for group in groups {
        let submenu = Submenu::with_id(app, format!("category:{}", group.id), menu_label(&group.name, 42), true)?;
        if group.prompts.is_empty() {
            submenu.append(&MenuItem::new(app, &labels.empty, false, None::<&str>)?)?;
        }
        // 每页二十条，全部可达，不使用最近五条或静默截断。
        for (page, prompts) in group.prompts.chunks(20).enumerate() {
            let items: Vec<_> = prompts.iter().map(|prompt| {
                let text = menu_label(&prompt.label, 72);
                MenuItem::with_id(app, format!("prompt:{}", prompt.id), text, true, None::<&str>)
            }).collect::<tauri::Result<_>>()?;
            if group.prompts.len() <= 20 {
                for item in &items { submenu.append(item)?; }
            } else {
                let page_menu = Submenu::new(app, format!("{} {}–{}", labels.more, page * 20 + 1, page * 20 + prompts.len()), true)?;
                for item in &items { page_menu.append(item)?; }
                submenu.append(&page_menu)?;
            }
        }
        menu.append(&submenu)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?)?;
    app.tray_by_id("default").ok_or(tauri::Error::AssetNotFound("托盘图标不存在".into()))?.set_menu(Some(menu))
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "show-window", "Prompt Note", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "退出 / Quit", true, None::<&str>)?)?;
    TrayIconBuilder::with_id("default")
        .icon(app.default_window_icon().ok_or(tauri::Error::AssetNotFound("应用图标不存在".into()))?.clone())
        .tooltip("Prompt Note")
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "quit" => app.exit(0),
                "show-window" => { if let Err(error) = crate::window::show_workspace(app) { eprintln!("显示窗口失败：{error}"); } }
                id if id.starts_with("prompt:") => {
                    let app = app.clone();
                    let id = id.trim_start_matches("prompt:").to_string();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = copy_from_database(&app, &id, true).await {
                            eprintln!("托盘复制失败：{error}");
                            if let Err(emit_error) = app.emit("tray-feedback", "copyFailed") { eprintln!("发送错误提示失败：{emit_error}"); }
                        }
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                if let Err(error) = crate::window::show_workspace(tray.app_handle()) { eprintln!("唤回窗口失败：{error}"); }
            }
        })
        .build(app)?;
    Ok(())
}

async fn copy_from_database(app: &AppHandle, id: &str, from_tray: bool) -> Result<CopyResult, String> {
    let state = app.state::<TrayState>();
    let copy_guard = state.copy_lock.lock().await;
    let pool = crate::store::pool(app).await?;
    let content: String = sqlx::query_scalar("SELECT content FROM prompts WHERE id=?")
        .bind(id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let auto_insert = from_tray && state.auto_insert.load(Ordering::Relaxed);
    let clipboard_app = app.clone();
    // 同步的系统调用使用阻塞任务；复制与粘贴之间不插入数据库 await，避免被后一次复制覆盖。
    let paste_error = tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, String> {
        clipboard_app.clipboard().write_text(content).map_err(|e| e.to_string())?;
        Ok(if auto_insert { paste().err() } else { None })
    }).await.map_err(|e| e.to_string())??;
    if from_tray {
        if let Some(error) = paste_error {
            eprintln!("自动粘贴失败：{error}");
            feedback(app, "pasteFailed");
        } else {
            feedback(app, "copiedTray");
        }
    }
    // 记录可以在之后提交，不占用剪贴板临界区，保持连续复制响应。
    drop(copy_guard);
    // 复制已成功时，后续记录失败不得误报为剪贴板失败。
    let history_saved = match sqlx::query("UPDATE prompts SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
        .bind(id).execute(&pool).await {
        Ok(result) if result.rows_affected() > 0 => true,
        Ok(_) => { eprintln!("提示词在复制后已被删除，未保存使用记录：{id}"); false }
        Err(error) => { eprintln!("保存提示词使用记录失败：{error}"); false }
    };
    if from_tray && !history_saved { feedback(app, "copiedHistoryFailed"); }
    Ok(CopyResult { history_saved })
}

// 反馈通道失败只记录日志，不把已经完成的剪贴板操作改报为失败。
fn feedback(app: &AppHandle, status: &str) {
    if let Err(error) = app.emit("tray-feedback", status) { eprintln!("发送托盘反馈失败：{error}"); }
}

fn paste() -> Result<(), String> {
    use enigo::{Direction::{Click, Press, Release}, Enigo, Key, Keyboard, Settings};
    let mut keyboard = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let modifier = if cfg!(target_os = "macos") { Key::Meta } else { Key::Control };
    keyboard.key(modifier, Press).map_err(|e| e.to_string())?;
    let result = keyboard.key(Key::Unicode('v'), Click);
    // 无论点击是否失败，始终尝试释放修饰键，避免卡住 Ctrl。
    let release = keyboard.key(modifier, Release);
    result.and(release).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{menu_label, CopyResult};
    #[test]
    fn labels_are_unicode_safe_and_escape_native_mnemonics() {
        assert_eq!(menu_label("代码😀 & 标签\n", 30), "代码😀 && 标签");
        assert_eq!(menu_label("中文😀abc", 3), "中文😀…");
    }
    #[test]
    fn card_copy_result_matches_frontend_camel_case() {
        assert_eq!(
            serde_json::to_value(CopyResult { history_saved: false }).unwrap(),
            serde_json::json!({ "historySaved": false })
        );
    }
}
