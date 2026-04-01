#[cfg(windows)]
use tauri::Window;

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
  GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
  HWND_TOPMOST, LWA_ALPHA, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
  WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

#[cfg(windows)]
pub fn make_window_overlay_clickthrough(window: &Window) -> tauri::Result<()> {
  let hwnd = window.hwnd()?;

  unsafe {
    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let new_ex_style = ex_style | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style as isize);

    // Ensure fully opaque alpha channel; actual transparency comes from WebView background.
    // This keeps the window composited while remaining click-through.
    let _ = SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);

    let _ = SetWindowPos(
      hwnd,
      HWND_TOPMOST,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    );
  }

  Ok(())
}

#[cfg(windows)]
pub fn fit_window_to_virtual_desktop(window: &Window) -> tauri::Result<()> {
  use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SetWindowPos, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN, SWP_NOACTIVATE, SWP_NOZORDER,
  };

  let hwnd = window.hwnd()?;

  unsafe {
    let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
    let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
    let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    let _ = SetWindowPos(hwnd, None, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
  }

  Ok(())
}

#[cfg(not(windows))]
pub fn make_window_overlay_clickthrough(_: &tauri::Window) -> tauri::Result<()> {
  Ok(())
}

#[cfg(not(windows))]
pub fn fit_window_to_virtual_desktop(_: &tauri::Window) -> tauri::Result<()> {
  Ok(())
}

