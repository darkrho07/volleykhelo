'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BALL_RADIUS,
  HitType,
  NET_HEIGHT_MENS,
  OUTFIT_PALETTES,
  PLAYER_REACH_RADIUS,
  PlayerState,
  QUICK_EMOTES,
} from '../../shared';
import { soundManager } from '../../lib/audio';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';
import { EffectsManager } from './EffectsManager';
import { buildBeachArena } from './models/ArenaBuilder';
import { createVolleyballRig } from './models/BallModel';
import { createVolleyballNetRig } from './models/NetModel';
import {
  ArticulatedPlayerRig,
  createPlayerRig,
  updateEmoteSpriteTexture,
  updatePlayerRigAnimation,
} from './models/PlayerModel';

// Pre-allocated scratch vectors outside render loop (zero GC)
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.5, 0);

// Exported ref for charge & third-person reach state UI readout without causing React re-renders
export const activeChargeState = {
  isCharging: false,
  chargeValue: 0,
  ballInReach: false,
  aimLateral: 0,
};

export default function VolleyCanvas() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard (from Three.js skill directive)
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      54,
      window.innerWidth / window.innerHeight,
      0.1,
      220
    );
    camera.position.set(-9.5, 3.2, 0);
    camera.lookAt(0, 1.8, 0);

    // 2. Studio Environment Map via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Balanced 3-Point Outdoor Beach Lighting Rig + Fog
    const hemiLight = new THREE.HemisphereLight(0xffedd5, 0x0284c7, 0.85);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(18, 32, 22);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = isSoftwareGl ? 512 : 2048;
    sunLight.shadow.mapSize.height = isSoftwareGl ? 512 : 2048;
    const d = 22;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 85;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-18, 12, -16);
    scene.add(rimLight);

    const fogColor = new THREE.Color(0xfdba74);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(0xfdba74, 0.0095);

    const applyThemeAndQuality = () => {
      const { theme, quality } = useGameStore.getState();
      if (theme === 'day') {
        scene.background = new THREE.Color(0x38bdf8);
        scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0085);
        sunLight.color.setHex(0xfffbeb);
        sunLight.intensity = 2.3;
        hemiLight.color.setHex(0xe0f2fe);
        hemiLight.groundColor.setHex(0xd97706);
        hemiLight.intensity = 0.9;
      } else if (theme === 'sunset') {
        scene.background = new THREE.Color(0xfb923c);
        scene.fog = new THREE.FogExp2(0xfdba74, 0.0095);
        sunLight.color.setHex(0xfef08a);
        sunLight.intensity = 2.15;
        hemiLight.color.setHex(0xffedd5);
        hemiLight.groundColor.setHex(0x0369a1);
        hemiLight.intensity = 0.85;
      } else {
        // Night Stadium floodlights
        scene.background = new THREE.Color(0x090d16);
        scene.fog = new THREE.FogExp2(0x090d16, 0.011);
        sunLight.color.setHex(0xe2e8f0);
        sunLight.intensity = 2.4;
        hemiLight.color.setHex(0x38bdf8);
        hemiLight.groundColor.setHex(0x1e293b);
        hemiLight.intensity = 0.7;
      }

      if (!isSoftwareGl) {
        const pr =
          quality === 'low' ? 1 : quality === 'medium' ? 1.35 : Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(pr);
        renderer.shadowMap.enabled = quality !== 'low';
      }
    };
    applyThemeAndQuality();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // 4. Build Arena, Net, Volleyball, Effects, and 3rd-Person Aim & Reach Indicators
    const arena = buildBeachArena(maxAnisotropy);
    scene.add(arena.group);

    const netRig = createVolleyballNetRig();
    scene.add(netRig.group);

    const ballRig = createVolleyballRig(maxAnisotropy);
    scene.add(ballRig.group);

    const effects = new EffectsManager();
    scene.add(effects.group);

    // 3rd-Person Aim Arrow & Target Reticle on Opponent Court
    const aimIndicatorGroup = new THREE.Group();
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.55);
    arrowShape.lineTo(0.28, 0.05);
    arrowShape.lineTo(0.1, 0.05);
    arrowShape.lineTo(0.1, -0.45);
    arrowShape.lineTo(-0.1, -0.45);
    arrowShape.lineTo(-0.1, 0.05);
    arrowShape.lineTo(-0.28, 0.05);
    arrowShape.closePath();

    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    arrowGeo.rotateX(-Math.PI / 2);
    arrowGeo.rotateY(-Math.PI / 2); // Point along +X in local space
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const aimArrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    aimArrowMesh.position.y = 0.035;
    aimIndicatorGroup.add(aimArrowMesh);
    aimIndicatorGroup.visible = false;
    scene.add(aimIndicatorGroup);

    // 3rd-Person Reach Halo Ring around Local Athlete (glows emerald when ball is in strike range!)
    const reachHaloGeo = new THREE.RingGeometry(PLAYER_REACH_RADIUS - 0.12, PLAYER_REACH_RADIUS, 40);
    reachHaloGeo.rotateX(-Math.PI / 2);
    const reachHaloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const reachHaloMesh = new THREE.Mesh(reachHaloGeo, reachHaloMat);
    reachHaloMesh.position.y = 0.04;
    reachHaloMesh.visible = false;
    scene.add(reachHaloMesh);

    // Map of active player rigs in the scene (keyed by player.id)
    const playerRigs = new Map<string, ArticulatedPlayerRig>();

    // Demo exhibition bots shown during the Title Screen background pan
    const demoPlayers: PlayerState[] = [
      {
        id: 'demo-a1',
        guestId: 'demo-a1',
        name: 'Kiran',
        team: 'A',
        slotIndex: 0,
        outfitColor: OUTFIT_PALETTES[0].outfit,
        visorColor: OUTFIT_PALETTES[0].visor,
        jerseyNumber: 7,
        isBot: true,
        isReady: true,
        isHost: false,
        connected: true,
        ping: 0,
        pos: { x: -4.2, y: 0, z: 1.5 },
        vel: { x: 0, y: 0, z: 0 },
        facingAngle: 0,
        isGrounded: true,
        stamina: 100,
        isDiving: false,
        diveTimer: 0,
        hitCooldown: 0,
        animState: 'idle',
        animTimer: 0,
        lastProcessedInputSeq: 0,
        stats: { points: 0, aces: 0, spikes: 0, blocks: 0, touches: 0 },
      },
      {
        id: 'demo-b1',
        guestId: 'demo-b1',
        name: 'Riya',
        team: 'B',
        slotIndex: 0,
        outfitColor: OUTFIT_PALETTES[1].outfit,
        visorColor: OUTFIT_PALETTES[1].visor,
        jerseyNumber: 11,
        isBot: true,
        isReady: true,
        isHost: false,
        connected: true,
        ping: 0,
        pos: { x: 4.2, y: 0, z: -1.5 },
        vel: { x: 0, y: 0, z: 0 },
        facingAngle: Math.PI,
        isGrounded: true,
        stamina: 100,
        isDiving: false,
        diveTimer: 0,
        hitCooldown: 0,
        animState: 'idle',
        animTimer: 0,
        lastProcessedInputSeq: 0,
        stats: { points: 0, aces: 0, spikes: 0, blocks: 0, touches: 0 },
      },
    ];

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 5. Camera shake & cheer state
    let cameraShakeIntensity = 0;
    let crowdCheerTimer = 0;
    let lastScoreSig = '';

    // Subscribe to Socket visual events
    const unsubEvents = socketClient.onVisualEvent((ev) => {
      if (ev.type === 'hit' && ev.position) {
        const isSpike = ev.hitType === 'spike';
        effects.spawnHitFlash(ev.position.x, ev.position.y, ev.position.z, isSpike);
        if (isSpike) {
          cameraShakeIntensity = Math.max(cameraShakeIntensity, (ev.power || 0.7) * 0.45);
        }
      } else if (ev.type === 'net_hit' && ev.position) {
        netRig.triggerSway(ev.position, ev.power || 6);
      } else if (ev.type === 'point') {
        crowdCheerTimer = 2.5;
        if (ev.position) {
          effects.spawnSandBurst(ev.position.x, 0.05, ev.position.z, 22);
        }
      } else if (ev.type === 'match_end') {
        crowdCheerTimer = 5.0;
        effects.spawnVictoryConfetti();
      }
    });

    // 6. Keyboard & Mouse Input Listeners (with 3rd-Person Mouse Look & Aiming)
    const heldKeys = new Set<string>();
    let justPressedJump = false;
    let justPressedAction: HitType | null = null;
    let justReleasedCharge = 0;
    let isMouseDown = false;
    let mouseDownStart = 0;
    let mouseAimNDC = { x: 0, y: 0 };
    let lookYawOffset = 0;   // -0.65 to +0.65 rad horizontal look offset in 3rd-person
    let lookPitchOffset = 0; // -0.35 to +0.35 vertical look offset

    const isTypingInInput = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInInput()) return;
      const code = e.code;
      heldKeys.add(code);

      if (code === 'Space') {
        e.preventDefault();
        justPressedJump = true;
      } else if (code === 'KeyE') {
        justPressedAction = 'set';
      } else if (code === 'KeyC') {
        // Quick toggle camera mode with C key
        const cur = useGameStore.getState().cameraMode;
        const next = cur === 'follow' ? 'broadcast' : cur === 'broadcast' ? 'side' : 'follow';
        useGameStore.getState().setCameraMode(next);
      } else if (code === 'KeyH') {
        useGameStore.getState().toggleDock();
      } else if (code.startsWith('Digit')) {
        const digit = parseInt(code.replace('Digit', ''), 10);
        if (digit >= 1 && digit <= QUICK_EMOTES.length) {
          socketClient.sendChat(QUICK_EMOTES[digit - 1], true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };

    const onWindowBlur = () => {
      heldKeys.clear();
      isMouseDown = false;
      activeChargeState.isCharging = false;
      activeChargeState.chargeValue = 0;
    };

    const onMouseMove = (e: MouseEvent) => {
      const sens = useGameStore.getState().mouseSensitivity || 1.0;
      mouseAimNDC.x = ((e.clientX / window.innerWidth) * 2 - 1) * sens;
      mouseAimNDC.y = (-(e.clientY / window.innerHeight) * 2 + 1) * sens;

      // Smoothly map mouse X/Y to 3rd-person over-the-shoulder look yaw & pitch
      lookYawOffset = clampAim(mouseAimNDC.x) * 0.58;
      lookPitchOffset = clampAim(mouseAimNDC.y) * 0.32;
      activeChargeState.aimLateral = clampAim(mouseAimNDC.x);
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target !== renderer.domElement) return;

      if (e.button === 0) {
        // Instant hit / spike / serve on Left Click press — no release delay!
        justPressedAction = 'bump';
        justReleasedCharge = 0.88;
      } else if (e.button === 2) {
        // Optional Right Click for quick Set
        e.preventDefault();
        justPressedAction = 'set';
        justReleasedCharge = 0.6;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target === renderer.domElement) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('contextmenu', onContextMenu);

    const unsubStore = useGameStore.subscribe((state, prevState) => {
      if (state.theme !== prevState.theme || state.quality !== prevState.quality) {
        applyThemeAndQuality();
      }
    });

    // 7. Resize Handler
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 8. Main 60fps Animation Loop (with software-WebGL fence pacing)
    let frameId = 0;
    let lastTime = performance.now();
    let elapsedTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function syncPlayerModels(
      activePlayers: PlayerState[],
      myId: string | null,
      servingId: string | null,
      dt: number
    ) {
      const activeIds = new Set(activePlayers.map((p) => p.id));

      for (const [id, rig] of playerRigs.entries()) {
        if (!activeIds.has(id)) {
          scene.remove(rig.root);
          playerRigs.delete(id);
        }
      }

      for (const p of activePlayers) {
        let rig = playerRigs.get(p.id);
        const isLocal = p.id === myId;
        if (!rig) {
          rig = createPlayerRig(p, isLocal);
          rig.root.position.set(p.pos.x, p.pos.y, p.pos.z);
          scene.add(rig.root);
          playerRigs.set(p.id, rig);
        }

        const targetPos =
          isLocal && socketClient.predictedLocalPos ? socketClient.predictedLocalPos : p.pos;

        const prevY = rig.root.position.y;
        const lerpAlpha = 1 - Math.exp(-(isLocal ? 26 : 16) * dt);
        rig.root.position.x = THREE.MathUtils.lerp(rig.root.position.x, targetPos.x, lerpAlpha);
        rig.root.position.y = THREE.MathUtils.lerp(rig.root.position.y, targetPos.y, lerpAlpha);
        rig.root.position.z = THREE.MathUtils.lerp(rig.root.position.z, targetPos.z, lerpAlpha);

        if (prevY > 0.18 && rig.root.position.y <= 0.08) {
          effects.spawnSandBurst(rig.root.position.x, 0.03, rig.root.position.z, 10);
          soundManager.playSandStep();
        }

        // In 3rd-person mode, subtly orient the local athlete toward their aim angle when idle/jumping
        let desiredFacing = p.facingAngle;
        if (isLocal && useGameStore.getState().cameraMode === 'follow' && Math.hypot(p.vel.x, p.vel.z) < 0.25) {
          const baseDir = p.team === 'A' ? 0 : Math.PI;
          const sign = p.team === 'A' ? 1 : -1;
          desiredFacing = baseDir + lookYawOffset * sign * 0.65;
        }

        const targetRotY = -desiredFacing;
        let diff = targetRotY - rig.bodyPivot.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        rig.bodyPivot.rotation.y += diff * Math.min(1, dt * 14);

        const speedXZ = Math.hypot(p.vel.x, p.vel.z);
        if (speedXZ > 1.5 && p.isGrounded) {
          rig.stepAudioCooldown -= dt;
          if (rig.stepAudioCooldown <= 0) {
            rig.stepAudioCooldown = 0.28;
            if (isLocal) soundManager.playSandStep();
            effects.spawnSandBurst(rig.root.position.x, 0.02, rig.root.position.z, 2);
          }
        }

        if (p.activeEmote && p.activeEmote.expiresAt > Date.now()) {
          if (rig.currentEmoteText !== p.activeEmote.text) {
            rig.currentEmoteText = p.activeEmote.text;
            updateEmoteSpriteTexture(rig.emoteSprite, p.activeEmote.text);
          }
          rig.emoteSprite.visible = true;
        } else {
          rig.emoteSprite.visible = false;
        }

        updatePlayerRigAnimation(
          rig,
          p.animState,
          elapsedTime,
          speedXZ,
          rig.root.position.y,
          p.id === servingId
        );
      }
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      elapsedTime += dt;

      const store = useGameStore.getState();
      const snap = store.latestSnapshot;
      const room = store.roomState;
      const myId = store.mySocketId;

      if (isMouseDown) {
        activeChargeState.chargeValue = Math.min(1, (now - mouseDownStart) / 550);
      }

      if (crowdCheerTimer > 0) {
        crowdCheerTimer = Math.max(0, crowdCheerTimer - dt);
      }

      // A. Read Local Player Controls & Dispatch Input to Authoritative Server
      if (snap && (snap.phase === 'playing' || snap.phase === 'serve_wait')) {
        const me = snap.players.find((p) => p.id === myId);
        const isTeamB = me?.team === 'B';

        let rawW =
          (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0) -
          (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0);
        let rawD =
          (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) -
          (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);

        // Merge mobile touch joystick if active
        if (Math.hypot(store.mobileMove.x, store.mobileMove.z) > 0.05) {
          rawD = store.mobileMove.x;
          rawW = -store.mobileMove.z;
        }

        let moveX = 0;
        let moveZ = 0;

        if (store.cameraMode === 'follow' && me) {
          // True Third-Person Controls:
          // W = Forward toward net, S = Backpedal, A = Strafe Left, D = Strafe Right
          const forwardSign = isTeamB ? -1 : 1;
          moveX = rawW * forwardSign;
          moveZ = rawD * forwardSign;
        } else {
          // Broadcast / Side camera: D moves +X (right on screen), W moves -Z (into screen)
          moveX = rawD;
          moveZ = -rawW;
        }

        const mobAct = store.consumeMobileAction();
        const jump = justPressedJump || mobAct.jump;
        const action = justPressedAction || mobAct.action;
        const sprint = heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight') || mobAct.sprint;
        const charge = justReleasedCharge > 0 ? justReleasedCharge : mobAct.charge;

        const forwardSign = isTeamB ? -1 : 1;
        // In 3rd person, mouse X steers shot aim left/right relative to the player's view of the net,
        // and mouse Y controls deep (+1) vs short drop-shot (-0.3) placement!
        const aimX = forwardSign * (0.65 + clampAim(mouseAimNDC.y) * 0.35);
        const aimZ =
          store.cameraMode === 'follow'
            ? clampAim(mouseAimNDC.x * forwardSign * 0.95 + moveZ * 0.35)
            : clampAim(mouseAimNDC.x * 1.15 + moveZ * 0.45);

        socketClient.sendInput({
          moveX,
          moveZ,
          aimX,
          aimZ,
          jump,
          sprint,
          action,
          charge,
        });

        justPressedJump = false;
        justPressedAction = null;
        justReleasedCharge = 0;
      }

      // B. Update 3D Entities (Live Match vs Lobby vs Title Screen Exhibition)
      if (snap && room && room.phase !== 'lobby') {
        syncPlayerModels(snap.players, myId, snap.servingPlayerId, dt);

        // Interpolate Volleyball position & spin
        const ballLerp = 1 - Math.exp(-22 * dt);
        ballRig.ballMesh.position.x = THREE.MathUtils.lerp(
          ballRig.ballMesh.position.x,
          snap.ball.pos.x,
          ballLerp
        );
        ballRig.ballMesh.position.y = THREE.MathUtils.lerp(
          ballRig.ballMesh.position.y,
          snap.ball.pos.y,
          ballLerp
        );
        ballRig.ballMesh.position.z = THREE.MathUtils.lerp(
          ballRig.ballMesh.position.z,
          snap.ball.pos.z,
          ballLerp
        );

        ballRig.ballMesh.rotation.x += snap.ball.spin.x * dt + snap.ball.vel.z * dt * 0.8;
        ballRig.ballMesh.rotation.y += snap.ball.spin.y * dt;
        ballRig.ballMesh.rotation.z += snap.ball.spin.z * dt - snap.ball.vel.x * dt * 0.8;

        // Update ball ground shadow
        ballRig.shadowMesh.position.x = ballRig.ballMesh.position.x;
        ballRig.shadowMesh.position.z = ballRig.ballMesh.position.z;
        const shadowScale = Math.max(0.35, 1.3 - ballRig.ballMesh.position.y * 0.14);
        ballRig.shadowMesh.scale.setScalar(shadowScale);

        // Update predicted landing reticle on sand
        if (snap.ball.predictedLanding && snap.phase === 'playing') {
          ballRig.landingReticle.visible = true;
          ballRig.landingReticle.position.x = snap.ball.predictedLanding.x;
          ballRig.landingReticle.position.z = snap.ball.predictedLanding.z;
          const pulse = 0.9 + Math.sin(elapsedTime * 12) * 0.12;
          ballRig.landingReticle.scale.setScalar(pulse);
        } else {
          ballRig.landingReticle.visible = false;
        }

        // Update ribbon trail behind ball
        ballRig.trailPoints.pop();
        ballRig.trailPoints.unshift(ballRig.ballMesh.position.clone());
        ballRig.trailLine.geometry.setFromPoints(ballRig.trailPoints);

        // Update 3D Scoreboard when score changes
        const sig = `${snap.score.teamA}-${snap.score.teamB}-${snap.setsWon.teamA}-${snap.setsWon.teamB}-${snap.servingTeam}-${room.settings.mode}`;
        if (sig !== lastScoreSig) {
          lastScoreSig = sig;
          arena.updateScoreboard(
            snap.score.teamA,
            snap.score.teamB,
            snap.setsWon.teamA,
            snap.setsWon.teamB,
            snap.servingTeam,
            room.settings.mode
          );
        }

        const me = snap.players.find((p) => p.id === myId) || snap.players[0];

        if (me) {
          const myRig = playerRigs.get(me.id);
          const px = myRig ? myRig.root.position.x : me.pos.x;
          const py = myRig ? myRig.root.position.y : me.pos.y;
          const pz = myRig ? myRig.root.position.z : me.pos.z;
          const forwardSign = me.team === 'A' ? 1 : -1;

          // Update 3rd-Person Aim Arrow & Reach Halo Ring around local player
          const distToBall = Math.hypot(
            ballRig.ballMesh.position.x - px,
            ballRig.ballMesh.position.y - (py + 1.08),
            ballRig.ballMesh.position.z - pz
          );
          const inReach = distToBall <= PLAYER_REACH_RADIUS + 0.18;
          activeChargeState.ballInReach = inReach;

          reachHaloMesh.visible = true;
          reachHaloMesh.position.set(px, 0.035, pz);
          reachHaloMat.color.setHex(inReach ? 0x4ade80 : 0x38bdf8);
          reachHaloMat.opacity = inReach ? 0.78 : 0.25;
          const haloScale = inReach ? 1.05 + Math.sin(elapsedTime * 18) * 0.05 : 1.0;
          reachHaloMesh.scale.setScalar(haloScale);

          // Position Aim Arrow in front of player pointing toward aimed trajectory
          aimIndicatorGroup.visible = store.cameraMode === 'follow';
          aimIndicatorGroup.position.set(px + forwardSign * 1.15, 0.04, pz);
          const baseYaw = me.team === 'A' ? 0 : Math.PI;
          aimIndicatorGroup.rotation.y = baseYaw - lookYawOffset;

          // Dynamic FOV boost when sprinting, diving, or jumping to spike in 3rd-person
          const speedXZ = Math.hypot(me.vel.x, me.vel.z);
          const desiredFov =
            store.cameraMode === 'follow'
              ? 54 + (speedXZ > 8 || py > 0.4 ? 5.5 : 0) + (activeChargeState.isCharging ? 3.5 : 0)
              : 48;
          if (Math.abs(camera.fov - desiredFov) > 0.1) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov, dt * 8);
            camera.updateProjectionMatrix();
          }

          if (store.cameraMode === 'follow') {
            // TRUE THIRD-PERSON ACTION CAMERA (Behind the athlete, looking over shoulder toward net & ball)
            const camDistBehind = 5.4;
            const camHeight = 2.85 + py * 0.7;
            const lateralShift = Math.sin(lookYawOffset) * 1.65 * forwardSign;

            _camTargetPos.set(
              px - forwardSign * camDistBehind,
              camHeight,
              pz - lateralShift * 0.45
            );

            // Look target blends the court ahead of the player + the live ball height + mouse pitch/yaw
            const lookAheadX = px + forwardSign * 9.5;
            const lookAheadZ = pz * 0.55 + Math.sin(lookYawOffset) * 5.8 * forwardSign;
            const ballTrackY = Math.max(1.55, Math.min(4.8, ballRig.ballMesh.position.y * 0.55 + 1.0));

            _camLookAt.set(
              THREE.MathUtils.lerp(lookAheadX, ballRig.ballMesh.position.x, 0.38),
              ballTrackY + lookPitchOffset * 1.8,
              THREE.MathUtils.lerp(lookAheadZ, ballRig.ballMesh.position.z, 0.4)
            );
          } else if (store.cameraMode === 'side') {
            _camTargetPos.set(ballRig.ballMesh.position.x * 0.3, 10.2, 20.5);
            _camLookAt.set(ballRig.ballMesh.position.x * 0.4, 1.6, 0);
          } else {
            // Broadcast angle (elevated sideline panorama)
            _camTargetPos.set(ballRig.ballMesh.position.x * 0.25, 14.8, 23.5);
            _camLookAt.set(ballRig.ballMesh.position.x * 0.32, 1.5, 0);
          }
        }
      } else if (room && room.phase === 'lobby') {
        // Lobby preview: frame behind Team A's player in third-person perspective
        syncPlayerModels(room.players, myId, null, dt);
        ballRig.ballMesh.position.set(
          0,
          BALL_RADIUS + Math.abs(Math.sin(elapsedTime * 3)) * 0.6,
          0
        );
        ballRig.shadowMesh.position.set(0, 0.022, 0);
        ballRig.landingReticle.visible = false;
        aimIndicatorGroup.visible = false;
        reachHaloMesh.visible = false;

        const me = room.players.find((p) => p.id === myId) || room.players[0];
        if (me) {
          const sign = me.team === 'A' ? 1 : -1;
          _camTargetPos.set(me.pos.x - sign * 4.8, 2.8, me.pos.z + Math.sin(elapsedTime * 0.4) * 1.2);
          _camLookAt.set(0, 1.6, 0);
        } else {
          _camTargetPos.set(-10.5, 4.2, Math.sin(elapsedTime * 0.3) * 3.5);
          _camLookAt.set(0, 1.6, 0);
        }
      } else {
        // Title Screen Live Exhibition Rally framed in dynamic Third-Person over-the-shoulder perspective!
        aimIndicatorGroup.visible = false;
        reachHaloMesh.visible = false;

        const rallyPhase = (elapsedTime * 0.85) % 2;
        const t = rallyPhase < 1 ? rallyPhase : rallyPhase - 1;
        const fromX = rallyPhase < 1 ? -4.2 : 4.2;
        const toX = rallyPhase < 1 ? 4.2 : -4.2;
        const fromZ = rallyPhase < 1 ? 1.4 : -1.4;
        const toZ = rallyPhase < 1 ? -1.4 : 1.4;

        const bx = THREE.MathUtils.lerp(fromX, toX, t);
        const bz = THREE.MathUtils.lerp(fromZ, toZ, t);
        const by = 1.2 + Math.sin(t * Math.PI) * 3.6;

        ballRig.ballMesh.position.set(bx, by, bz);
        ballRig.ballMesh.rotation.z -= dt * 6;
        ballRig.shadowMesh.position.set(bx, 0.022, bz);
        ballRig.landingReticle.visible = true;
        ballRig.landingReticle.position.set(toX, 0.03, toZ);

        demoPlayers[0].pos.x = -4.2 + Math.sin(elapsedTime * 1.5) * 0.6;
        demoPlayers[0].animState = t < 0.15 && rallyPhase < 1 ? 'bump' : 'idle';
        demoPlayers[1].pos.x = 4.2 + Math.cos(elapsedTime * 1.5) * 0.6;
        demoPlayers[1].animState = t < 0.15 && rallyPhase >= 1 ? 'bump' : 'idle';

        syncPlayerModels(demoPlayers, null, null, dt);

        // Hero Third-Person camera behind Team A player looking over their shoulder across the net
        _camTargetPos.set(
          demoPlayers[0].pos.x - 4.4,
          2.65 + Math.sin(elapsedTime * 0.5) * 0.25,
          demoPlayers[0].pos.z + Math.cos(elapsedTime * 0.35) * 1.2
        );
        _camLookAt.set(bx * 0.5, 1.85, bz * 0.4);
      }

      // Apply decaying camera shake on spikes
      if (cameraShakeIntensity > 0.005) {
        _camTargetPos.x += (Math.random() - 0.5) * cameraShakeIntensity;
        _camTargetPos.y += (Math.random() - 0.5) * cameraShakeIntensity;
        cameraShakeIntensity *= Math.exp(-dt * 10);
      } else {
        cameraShakeIntensity = 0;
      }

      const camDamp = 1 - Math.exp(-(store.cameraMode === 'follow' ? 11.5 : 6.5) * dt);
      camera.position.lerp(_camTargetPos, camDamp);
      _currentLookAt.lerp(_camLookAt, camDamp);
      camera.lookAt(_currentLookAt);

      const targetNetHeight = room?.settings.netHeight || NET_HEIGHT_MENS;
      netRig.update(dt, targetNetHeight);
      arena.updateCrowdAndOcean(elapsedTime, crowdCheerTimer);
      effects.update(dt, camera.position);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      unsubEvents();
      unsubStore();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={canvasMountRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden z-0"
      aria-label="Volley Khelo 3D Third-Person Beach Volleyball Arena"
    />
  );
}

function clampAim(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
