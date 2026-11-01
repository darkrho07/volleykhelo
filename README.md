# Volley Khelo — Real-Time 3D Multiplayer Beach Volleyball

**Volley Khelo** is a browser-based, real-time multiplayer 3D beach volleyball game built with **Next.js (App Router, TypeScript)**, **Three.js**, **Socket.IO**, **Express**, **Zustand**, and **Tailwind CSS**.

---

## Architecture Overview

1. **Shared Deterministic Core (`/shared`)**:
   - `shared/types.ts`: Shared TypeScript interfaces for `PlayerState`, `BallState`, `PlayerInput`, `RoomSettings`, `GameSnapshot`, and `GameEventPayload`.
   - `shared/constants.ts`: Official 18m × 9m court geometry, net heights (`2.43m` Men's, `2.24m` Women's, `2.10m` Arcade), physics constants, and rotational court formations for `1v1`, `2v2`, and `3v3`.
   - `shared/physics.ts`: Deterministic movement step (`stepPlayerPhysics`) and parabolic trajectory solver (`computeHitTrajectory`) shared between the 60 Hz server and client-side prediction.

2. **Server-Authoritative Game Engine (`/server`)**:
   - `server/game/GameEngine.ts`: Runs a **60 Hz physics and rules loop** (`16.67ms` tick) and broadcasts snapshots at **30 Hz**. Enforces rally scoring, win-by-2, Best-of-1/3 sets, max 3 touches per side, double-touch faults, net-touch faults, out-of-bounds detection, and clockwise side-out rotation.
   - `server/game/BotAI.ts`: Autonomous AI bots that track predicted landing coordinates, pass to the net on touch 2, and jump-spike on touch 3.
   - `server/rooms/RoomManager.ts`: Manages 6-character room codes, Quick Match, shareable `/room/[code]` links, host migration, and a **30-second disconnect grace period**.

3. **3D Studio Scene & Procedural Audio (`/components/game`, `/lib/audio.ts`)**:
   - `VolleyCanvas.tsx`: Full-bleed Three.js scene inside a stable `useRef` container with `ACESFilmicToneMapping`, `RoomEnvironment` PBR reflections, warm/cool lighting, `InstancedMesh` palm trees and cheering crowd, spring-swaying net mesh, and articulated 10-part athletes.
   - `lib/audio.ts`: 100% procedural Web Audio API sound effects (bump, spike, whistle, net hit, sand footsteps, crowd cheer, and tropical marimba loop).

---

## Setup & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the unified Next.js + Express + Socket.IO server on port 3000
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## How to Test Multiplayer with 2 Browser Tabs

1. Open **Tab 1** at `http://localhost:3000` (or the live preview URL).
2. Enter a nickname, pick a jersey color, and click **Create Room**.
3. Choose **1v1**, **2v2**, or **3v3** (uncheck *"Pre-fill empty slots with AI Bots"* if you want pure human 1v1, or keep bots to fill remaining slots) and click **Create Room & Open Lobby**.
4. Copy the **6-character Room Code** (e.g., `VK7X92`) or click **Copy Shareable Link**.
5. Open **Tab 2** (use an Incognito/Private window or a second browser so it gets a distinct `localStorage` guest ID), click **Join Room**, and enter the 6-character code (or visit `/room/VK7X92`).
6. In **Tab 2**, click **Click to Ready Up**.
7. In **Tab 1** (Host), click **Start Match Now** and play a full server-authoritative match!

---

## Assets & Credits

- **3D Models & Textures**: 100% procedural Three.js composite geometries (`THREE.Group` articulated athletes, `CanvasTexture` 18-panel volleyball, spring-displaced net mesh, and `InstancedMesh` tropical arena). Zero external 404 dependencies.
- **Audio**: 100% procedural Web Audio API synthesis (`lib/audio.ts`).
