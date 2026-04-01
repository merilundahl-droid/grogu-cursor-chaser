#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cursor;
mod windows_overlay;

use tauri::{
  CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
  SystemTraySubmenu,
};

#[derive(Clone, serde::Serialize)]
struct SettingsPayload {
  enabled: bool,
  size_cm: f32,
  separation_mm: f32,
}

#[derive(Default)]
struct AppSettings(std::sync::Mutex<AppSettingsInner>);

#[derive(Clone)]
struct AppSettingsInner {
  enabled: bool,
  size_cm: f32,
  separation_mm: f32,
}

impl Default for AppSettingsInner {
  fn default() -> Self {
    Self {
      enabled: true,
      size_cm: 1.4,
      separation_mm: 10.0,
    }
  }
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppSettings>) -> SettingsPayload {
  let s = state.0.lock().expect("settings mutex poisoned").clone();
  SettingsPayload {
    enabled: s.enabled,
    size_cm: s.size_cm,
    separation_mm: s.separation_mm,
  }
}

fn emit_settings(app: &tauri::AppHandle, state: &tauri::State<'_, AppSettings>) {
  let payload = get_settings(state.clone());
  let _ = app.emit_all("settings", payload);
}

fn main() {
  let size_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("size_1_0".to_string(), "1.0 cm"))
    .add_item(CustomMenuItem::new("size_1_2".to_string(), "1.2 cm"))
    .add_item(CustomMenuItem::new("size_1_4".to_string(), "1.4 cm (default)"))
    .add_item(CustomMenuItem::new("size_1_6".to_string(), "1.6 cm"))
    .add_item(CustomMenuItem::new("size_1_8".to_string(), "1.8 cm"))
    .add_item(CustomMenuItem::new("size_2_0".to_string(), "2.0 cm"));
  let size_submenu = SystemTraySubmenu::new("Size", size_menu);

  let sep_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("sep_0".to_string(), "0 mm"))
    .add_item(CustomMenuItem::new("sep_5".to_string(), "5 mm"))
    .add_item(CustomMenuItem::new("sep_10".to_string(), "10 mm (default)"))
    .add_item(CustomMenuItem::new("sep_15".to_string(), "15 mm"))
    .add_item(CustomMenuItem::new("sep_20".to_string(), "20 mm"));
  let sep_submenu = SystemTraySubmenu::new("Cursor distance", sep_menu);

  let tray_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("toggle_enabled".to_string(), "Enable / Disable"))
    .add_native_item(SystemTrayMenuItem::Separator)
    .add_submenu(size_submenu)
    .add_submenu(sep_submenu)
    .add_native_item(SystemTrayMenuItem::Separator)
    .add_item(CustomMenuItem::new("quit".to_string(), "Quit"));

  let system_tray = SystemTray::new().with_menu(tray_menu);

  tauri::Builder::default()
    .manage(AppSettings::default())
    .setup(|app| {
      let window = app.get_window("main").expect("main window missing");

      #[cfg(windows)]
      {
        windows_overlay::make_window_overlay_clickthrough(&window)?;
        windows_overlay::fit_window_to_virtual_desktop(&window)?;
      }

      // Start cursor sampler thread (emits events to frontend).
      let app_handle = app.handle();
      cursor::spawn_cursor_emitter(app_handle);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![get_settings])
    .system_tray(system_tray)
    .on_system_tray_event(|app: &tauri::AppHandle, event| {
      if let SystemTrayEvent::MenuItemClick { id, .. } = event {
        let state = app.state::<AppSettings>();
        let mut s = state.0.lock().expect("settings mutex poisoned");
        match id.as_str() {
          "toggle_enabled" => {
            s.enabled = !s.enabled;
          }
          "size_1_0" => s.size_cm = 1.0,
          "size_1_2" => s.size_cm = 1.2,
          "size_1_4" => s.size_cm = 1.4,
          "size_1_6" => s.size_cm = 1.6,
          "size_1_8" => s.size_cm = 1.8,
          "size_2_0" => s.size_cm = 2.0,
          "sep_0" => s.separation_mm = 0.0,
          "sep_5" => s.separation_mm = 5.0,
          "sep_10" => s.separation_mm = 10.0,
          "sep_15" => s.separation_mm = 15.0,
          "sep_20" => s.separation_mm = 20.0,
          "quit" => {
            std::process::exit(0);
          }
          _ => {}
        }
        drop(s);
        emit_settings(app, &state);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

