use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::AppSettings;

#[derive(Clone, serde::Serialize)]
pub struct CursorSample {
  pub t_ms: u128,
  pub x: i32,
  pub y: i32,
  pub vs_x: i32,
  pub vs_y: i32,
  pub dpi: u32,
  pub px_per_mm: f32,
}

fn now_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
}

#[cfg(windows)]
fn get_cursor_pos_and_dpi() -> Option<(i32, i32, i32, i32, u32)> {
  use windows::Win32::{
    Foundation::POINT,
    Graphics::Gdi::MonitorFromPoint,
    UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
    UI::WindowsAndMessaging::{
      GetCursorPos, GetSystemMetrics, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    },
  };

  unsafe {
    let vs_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
    let vs_y = GetSystemMetrics(SM_YVIRTUALSCREEN);

    let mut pt = POINT { x: 0, y: 0 };
    if !GetCursorPos(&mut pt).as_bool() {
      return None;
    }

    let hmon = MonitorFromPoint(pt, windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONEAREST);
    let mut dpi_x: u32 = 96;
    let mut dpi_y: u32 = 96;
    let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
    Some((pt.x, pt.y, vs_x, vs_y, dpi_x.max(48).min(768)))
  }
}

#[cfg(not(windows))]
fn get_cursor_pos_and_dpi() -> Option<(i32, i32, i32, i32, u32)> {
  None
}

pub fn spawn_cursor_emitter(app: AppHandle) {
  std::thread::spawn(move || loop {
    let settings = app.state::<AppSettings>();
    let s = settings.0.lock().expect("settings mutex poisoned").clone();
    if !s.enabled {
      std::thread::sleep(Duration::from_millis(100));
      continue;
    }

    if let Some((x, y, vs_x, vs_y, dpi)) = get_cursor_pos_and_dpi() {
      let px_per_mm = (dpi as f32) / 25.4;
      let sample = CursorSample {
        t_ms: now_ms(),
        x,
        y,
        vs_x,
        vs_y,
        dpi,
        px_per_mm,
      };
      let _ = app.emit_all("cursor_sample", sample);
    }

    std::thread::sleep(Duration::from_millis(16));
  });
}

