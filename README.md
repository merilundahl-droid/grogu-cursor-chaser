# Break Grogu (cursor chaser)

A tiny Grogu desktop overlay that **chases your cursor** with cute animations.

## Prerequisites (Windows 10/11)

- **Node.js LTS** (includes `npm`)
- **Rust stable** + MSVC build tools
  - Install Rust via `rustup`
  - Install **Visual Studio Build Tools** with “Desktop development with C++”

## Install

```bash
npm install
```

## Run (dev)

```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Assets you must provide

Place your Grogu animation assets under:

- `src/assets/grogu/`

The code is written to support a **rigged runtime** (Spine/DragonBones-style), but it also includes a **fallback placeholder** (simple sprite) so the app can run before you import final assets.

## Notes

- The overlay window is **always-on-top** and **click-through** (it won’t block your mouse).
- “Force-move cursor” is **OFF by default** and can be enabled from the tray menu.

