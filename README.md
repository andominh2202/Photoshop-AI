# 🎨 Photoshop AI (PhotoshopAI)

> **Pro Non-Destructive Desktop & Web Photo Editor powered by GPU Acceleration and AI Neural Engine.**

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![Pixi.js](https://img.shields.io/badge/Pixi.js-v8-e91e63.svg)](https://pixijs.com/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F.svg)](https://www.electronjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-Rust-FFC131.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Overview

**Photoshop AI** is an advanced, high-performance photo manipulation and graphic design studio designed for modern workflows. Built with **React 19**, **Pixi.js (WebGL/WebGPU)**, and modern desktop runtimes (**Electron** & **Tauri/Rust**), it provides a familiar Photoshop-grade user experience with real-time AI tools, non-destructive layers, and GPU-accelerated rendering.

---

## 🚀 Key Features

### 🖌️ Professional Tool Palette
- **Move Tool (`V`)**: Transform, translate, and position layers with sub-pixel precision.
- **Rectangular Marquee (`M`)**: Precise rectangular area selections and cropping.
- **Magic Wand & AI Select (`W`)**: Smart edge-aware and tolerance-based selection.
- **Brush (`B`) & Eraser (`E`)**: High-fidelity painting with adjustable size, hardness, and opacity.
- **Paint Bucket (`G`)**: Smart flood fill for enclosed regions and layer backgrounds.
- **Eyedropper (`I`)**: Real-time canvas color sampling with primary/secondary palette switching.
- **Horizontal Type (`T`)**: Rich text layers with customizable fonts, weights, and colors.
- **Vector Shapes (`U`)**: Scalable geometric primitives (rectangles, rounded rectangles).
- **Hand (`H`) & Zoom (`Z`)**: Fluid canvas navigation, panning, and zoom scaling up to 3200%.

### 🤖 AI Neural Engine
- **One-Click AI Background Removal (`R`)**: Embedded deep learning model (RMBG-1.4 / BiRefNet architecture) for studio-quality subject cutouts.
- **High-Performance Rust Backend**: Native image preprocessing via SIMD-accelerated Rust pipelines (`Rayon` + `ndarray`).

### 📑 Layer Management & Non-Destructive Editing
- Multi-layer stack support with reordering, locking, and visibility toggling.
- Standard blend modes (Normal, Multiply, Screen, Overlay, etc.).
- Layer opacity and real-time adjustment filters (Brightness, Contrast, Saturation, Blur, Hue, Invert).
- Quick duplicate (`Ctrl + J`) and layer deletion.

### ⚡ Photoshop-Standard Shortcuts
| Shortcut | Action |
| --- | --- |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo |
| `Ctrl + J` | Duplicate Active Layer |
| `Ctrl + N` | New Document Modal |
| `Ctrl + Shift + E` | Export Canvas Dialog |
| `Ctrl + D` | Deselect / Clear Selection |
| `Ctrl + 0` | Fit Canvas to Screen (Reset View) |
| `Ctrl + I` | Invert Layer Colors |
| `Ctrl + [` / `Ctrl + ]` | Move Layer Down / Up |
| `X` | Swap Foreground / Background Colors |
| `Delete` / `Backspace` | Delete Selected Layer |

---

## 🛠️ Tech Stack

- **UI & State Management**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Zustand](https://zustand-demo.pmnd.rs/), [Lucide React](https://lucide.dev/)
- **Styling**: [TailwindCSS v4](https://tailwindcss.com/)
- **Canvas Rendering**: [Pixi.js v8](https://pixijs.com/) (Hardware-accelerated WebGL)
- **Desktop Runtime**:
  - [Electron](https://www.electronjs.org/) (Full desktop window and node integrations)
  - [Tauri v2 + Rust](https://tauri.app/) (Ultra-lightweight native compilation & AI inference)
- **Build Tooling**: [Vite 8](https://vitejs.dev/)

---

## 📦 Project Structure

```text
Photoshop AI/
├── electron/              # Electron main process, preload, and runner scripts
│   ├── main.cjs
│   ├── preload.cjs
│   └── run-desktop.cjs
├── src/
│   ├── canvas/            # PixiJS canvas implementation & render loops
│   ├── components/        # UI layout, panels, toolbars, and modals
│   │   ├── layout/        # TopMenuBar, Toolbar, ToolOptionsBar, StatusBar
│   │   ├── modals/        # NewDocumentModal, ExportModal
│   │   └── panels/        # LayerPanel, AdjustmentsPanel, HistoryPanel
│   ├── services/          # Desktop bridges and native communication
│   ├── store/             # Global editor Zustand state store
│   ├── App.tsx            # Root application component & hotkey handlers
│   ├── index.css          # Core design tokens and tailwind styles
│   └── main.tsx           # React entry point
├── src-tauri/             # Tauri & Rust native backend
│   ├── src/
│   │   ├── ai/            # AI Neural Engine & RMBG pipelines
│   │   └── main.rs        # Tauri commands & system entry
│   └── Cargo.toml
├── run-web.bat            # One-click web dev server launcher
├── run-windows.bat        # One-click native desktop launcher
├── package.json
└── vite.config.ts
```

---

## 💻 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (or yarn / pnpm)
- *(Optional for Tauri native builds)* [Rust toolchain](https://www.rust-lang.org/)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/andominh2202/Photoshop-AI.git
cd Photoshop-AI
npm install
```

### Running Locally

#### 1. Web Version
To launch the web studio in your default browser:
```bash
npm run dev
# Or double-click run-web.bat on Windows
```
Open [http://localhost:1420](http://localhost:1420) to view the editor.

#### 2. Desktop Version (Electron)
To launch the desktop application:
```bash
npm run start
# Or double-click run-windows.bat on Windows
```

#### 3. Tauri Desktop Version
```bash
npm run tauri:dev
```

### Production Build

```bash
# Build web bundle
npm run build

# Build Tauri native binary
npm run tauri:build
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
