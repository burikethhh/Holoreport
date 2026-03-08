# 🔮 HoloReport — Gesture-Controlled 3D Holographic Presentation System

> Upload your PowerPoint → Watch it transform into a JARVIS-like holographic display → Control it with hand gestures in the air.

---

## 🎯 What It Does

HoloReport takes an ordinary `.pptx` file and transforms the presentation experience into something out of a sci-fi movie:

1. **Upload** your PowerPoint file through a futuristic HUD interface
2. **Automatic parsing** extracts all text, images, and layout from your slides
3. **3D holographic rendering** — slides are displayed in a Three.js-powered 3D environment with floating panels, ambient particles, holographic grids, and animated rings
4. **Hand gesture control** — swipe your hand in the air to navigate slides, make a fist to pause, point up for overview mode
5. **JARVIS-style HUD** — complete with boot sequence, status panels, scan lines, and multiple color themes

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
cd HoloReport
npm install

# 2. Start the server
npm start

# 3. Open in browser
# → http://localhost:3000
```

---

## 🖐 Gesture Controls

| Gesture | Action |
|---------|--------|
| 👋 Swipe Right | Next slide |
| 👋 Swipe Left | Previous slide |
| ✊ Fist | Pause |
| 🖐 Open Hand | Resume / Idle |
| 👆 Point Up | Toggle overview mode |
| 🤏 Pinch | Zoom (future) |

> Click the **📷 CAMERA** button in the bottom bar to activate gesture tracking.

---

## ⌨️ Keyboard Controls

| Key | Action |
|-----|--------|
| → / Space | Next slide |
| ← | Previous slide |
| O | Toggle overview |
| Esc | Exit overview |

---

## 🏗 Architecture

```
HoloReport/
├── server/
│   ├── index.js              # Express server — upload API, static file serving
│   └── pptx-parser.js        # PPTX unzip + XML parsing → structured JSON
├── public/
│   ├── index.html             # JARVIS HUD layout with all overlays
│   ├── styles.css             # Futuristic theme (4 color variants)
│   ├── app.js                 # Main controller — boot, upload, navigation
│   ├── gesture-engine.js      # MediaPipe Hands gesture detection
│   ├── slide-renderer.js      # Three.js 3D scene, slide frames, transitions
│   └── particles.js           # Ambient particle system + holographic grid
├── src/
│   └── holoreport-orchestrator.ts  # Multi-agent pipeline (from dev environment)
├── multi-agent-dev-environment/    # Agent definitions & orchestration framework
└── package.json
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Multer |
| PPT Parsing | JSZip, xml2js |
| 3D Rendering | Three.js (WebGL) |
| Gesture Detection | MediaPipe Hands |
| UI Framework | Vanilla JS + CSS3 (no framework overhead) |
| Fonts | Orbitron, Rajdhani, Share Tech Mono |

### Multi-Agent Roles

| Agent | Role | Responsibility |
|-------|------|---------------|
| GPT-5.4 | Strategic AI Lead | Project strategy, quality assurance, workflow orchestration |
| Claude Opus 4.6 | Full Stack Leader | End-to-end development, integration, code review |
| GPT-5.2 Codex Max | Code Architect | System architecture, gesture state machine design |
| GPT-5.3 Codex | Code Specialist | Feature implementation, 3D rendering, gesture algorithms |
| Gemini 3.1 Pro | Researcher | ML model research, WebXR feasibility, competitor analysis |
| Claude Sonnet 4.6 | Assistant | File validation, state management, user support |

---

## 🎨 Themes

Click the **🎨 THEME** button to cycle through:

1. **Cyan** (default) — Classic JARVIS blue
2. **Red** — Iron Man danger mode
3. **Green** — Matrix / tactical
4. **Purple** — Nebula / sci-fi

---

## 🚀 Future Enhancements

These are being researched by the multi-agent team:

- [ ] **WebXR / AR mode** — View holographic slides through AR headset (HoloLens 2, Quest 3)
- [ ] **Voice commands** — "Next slide", "Go to slide 5", "Zoom in"
- [ ] **AI slide enhancement** — Auto-improve layout, color palette, content suggestions
- [ ] **Real-time collaboration** — Multiple users viewing the same holographic presentation
- [ ] **Haptic feedback** — Vibration confirmation for gesture actions (via gamepad API)
- [ ] **Slide animations** — Preserve and render PowerPoint animations in 3D
- [ ] **PDF / Google Slides support** — Accept more input formats
- [ ] **Presenter notes** — Display speaker notes in a separate HUD panel
- [ ] **Recording mode** — Record the holographic presentation as a video

---

## 📋 Requirements

- **Node.js** 16+
- **Modern browser** with WebGL support (Chrome, Edge, Firefox)
- **Webcam** (for gesture control — optional, keyboard works too)
- **HTTPS or localhost** (required for camera access)

---

## 🤝 Multi-Agent Dev Environment

This project is built using the **Multi-Agent Development Environment** framework. Each AI agent has a defined role and set of capabilities that contribute to different parts of the system. The orchestrator coordinates tasks across all agents to deliver the final product.

See `multi-agent-dev-environment/` for agent definitions and `src/holoreport-orchestrator.ts` for the HoloReport-specific pipeline.

---

**Built with 🔮 by the HoloReport Multi-Agent Team**
