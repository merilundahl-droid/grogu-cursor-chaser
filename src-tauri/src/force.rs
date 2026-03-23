#[cfg(windows)]
pub fn nudge_cursor_by(dx: i32, dy: i32) -> windows::core::Result<()> {
  use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_MOVE, MOUSEINPUT,
  };

  unsafe {
    let mut input = INPUT {
      r#type: INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx,
          dy,
          mouseData: 0,
          dwFlags: MOUSEEVENTF_MOVE,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };

    let sent = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    if sent == 0 {
      return Err(windows::core::Error::from_win32());
    }
  }

  Ok(())
}

#[cfg(not(windows))]
pub fn nudge_cursor_by(_: i32, _: i32) -> Result<(), String> {
  Err("Force cursor nudge is only supported on Windows".to_string())
}

