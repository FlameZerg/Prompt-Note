pub fn fail(error: tauri::Error) -> ! {
    // 发布版没有控制台，初始化错误必须可见，不能仅以隐藏的 panic 结束。
    let message = format!(
        "Prompt Note 启动失败。\n\n{error}\n\n请记录此错误以便排查，不要删除或重建原有数据库。"
    );
    eprintln!("{message}");
    #[cfg(windows)]
    {
        // CI 无人值守时直接报告失败，不能被等待点击的对话框阻塞。
        let ci = std::env::var("CI").is_ok_and(|value| value == "1" || value.eq_ignore_ascii_case("true"));
        if !ci {
            show_error_dialog(&message);
        }
    }
    std::process::exit(1);
}

#[cfg(windows)]
fn show_error_dialog(message: &str) {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBoxW(
            window: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            flags: u32,
        ) -> i32;
    }
    const MB_ICONERROR: u32 = 0x0000_0010;
    const MB_SETFOREGROUND: u32 = 0x0001_0000;
    let text: Vec<u16> = message.replace('\0', " ").encode_utf16().chain(Some(0)).collect();
    let caption: Vec<u16> = "Prompt Note 启动失败".encode_utf16().chain(Some(0)).collect();
    // 两个缓冲区以零结尾，且在同步调用返回前有效；空句柄允许在主窗口创建失败时提示。
    let result = unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), MB_ICONERROR | MB_SETFOREGROUND)
    };
    if result == 0 {
        eprintln!("显示启动错误提示失败：{}", std::io::Error::last_os_error());
    }
}
