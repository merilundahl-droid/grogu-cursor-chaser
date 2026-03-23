#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cursor;
mod force;
mod windows_overlay;

use tauri::{
  CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
  SystemTraySubmenu,
};

#[derive(Clone, serde::Serialize)]
struct SettingsPayload {
  enabled: bool,
  force_enabled: bool,
  size_cm: f32,
  separation_mm: f32,
}

#[derive(Default)]
struct AppSettings(std::sync::Mutex<AppSettingsInner>);

#[derive(Clone)]
struct AppSettingsInner {
  enabled: bool,
  force_enabled: bool,
  size_cm: f32,
  separation_mm: f32,
}

impl Default for AppSettingsInner {
  fn default() -> Self {
    Self {
      enabled: true,
      force_enabled: false,
      size_cm: 1.4,
      separation_mm: 5.0,
    }
  }
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppSettings>) -> SettingsPayload {
  let s = state.0.lock().expect("settings mutex poisoned").clone();
  SettingsPayload {
    enabled: s.enabled,
    force_enabled: s.force_enabled,
    size_cm: s.size_cm,
    separation_mm: s.separation_mm,
  }
}

#[tauri::command]
fn force_nudge_cursor(
  dx: i32,
  dy: i32,
  state: tauri::State<'_, AppSettings>,
) -> Result<(), String> {
  let s = state.0.lock().expect("settings mutex poisoned").clone();
  if !s.enabled || !s.force_enabled {
    return Ok(());
  }

  #[cfg(windows)]
  {
    crate::force::nudge_cursor_by(dx, dy).map_err(|e| e.to_string())?;
  }

  Ok(())
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
    .add_item(CustomMenuItem::new("sep_3".to_string(), "3 mm"))
    .add_item(CustomMenuItem::new("sep_4".to_string(), "4 mm"))
    .add_item(CustomMenuItem::new("sep_5".to_string(), "5 mm (default)"))
    .add_item(CustomMenuItem::new("sep_6".to_string(), "6 mm"))
    .add_item(CustomMenuItem::new("sep_7".to_string(), "7 mm"));
  let sep_submenu = SystemTraySubmenu::new("Cursor distance", sep_menu);

  let tray_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("toggle_enabled".to_string(), "Enable / Disable"))
    .add_item(CustomMenuItem::new(
      "toggle_force".to_string(),
      "Force-move cursor (toggle)",
    ))
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
      let state = app.state::<AppSettings>();
      cursor::spawn_cursor_emitter(app_handle, state);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![get_settings, force_nudge_cursor])
    .system_tray(system_tray)
    .on_system_tray_event(|app, event| {
      if let SystemTrayEvent::MenuItemClick { id, .. } = event {
        let state = app.state::<AppSettings>();
        let mut s = state.0.lock().expect("settings mutex poisoned");
        match id.as_str() {
          "toggle_enabled" => {
            s.enabled = !s.enabled;
          }
          "toggle_force" => {
            s.force_enabled = !s.force_enabled;
          }
          "size_1_0" => s.size_cm = 1.0,
          "size_1_2" => s.size_cm = 1.2,
          "size_1_4" => s.size_cm = 1.4,
          "size_1_6" => s.size_cm = 1.6,
          "size_1_8" => s.size_cm = 1.8,
          "size_2_0" => s.size_cm = 2.0,
          "sep_3" => s.separation_mm = 3.0,
          "sep_4" => s.separation_mm = 4.0,
          "sep_5" => s.separation_mm = 5.0,
          "sep_6" => s.separation_mm = 6.0,
          "sep_7" => s.separation_mm = 7.0,
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

