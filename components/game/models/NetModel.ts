import * as THREE from 'three';
import { COURT_HALF_WIDTH, NET_BOTTOM_HEIGHT, NET_HEIGHT_MENS } from '../../../shared';

export interface VolleyballNetRig {
  group: THREE.Group;
  netMesh: THREE.Mesh;
  topTape: THREE.Mesh;
  bottomTape: THREE.Mesh;
  basePositions: Float32Array;
  swayAmplitude: number;
  swayCenterZ: number;
  swayCenterY: number;
  swayPhase: number;
  currentNetHeight: number;
  triggerSway: (hitPos: { x: number; y: number; z: number }, power: number) => void;
  update: (dt: number, targetNetHeight: number) => void;
}

function createNetGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.85)';
  ctx.lineWidth = 4;

  const step = 32;
  for (let i = 0; i <= 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createVolleyballNetRig(): VolleyballNetRig {
  const group = new THREE.Group();

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.22,
    metalness: 0.85,
  });

  const padMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.55,
    metalness: 0.05,
  });

  const tapeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.5,
    metalness: 0.05,
  });

  const antennaMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.35,
  });

  // Left & Right Net Posts (at Z = ±5.1m)
  [-5.1, 5.1].forEach((zPos) => {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.75, 16);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 1.375, zPos);
    pole.castShadow = true;
    pole.receiveShadow = true;
    group.add(pole);

    // Protective foam pad around lower post
    const padGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.85, 16);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.925, zPos);
    pad.castShadow = true;
    group.add(pad);
  });

  // Side boundary antennas at Z = ±4.5m
  [-COURT_HALF_WIDTH, COURT_HALF_WIDTH].forEach((zPos) => {
    const antGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.85, 8);
    const ant = new THREE.Mesh(antGeo, antennaMat);
    ant.position.set(0, NET_HEIGHT_MENS - 0.15, zPos);
    group.add(ant);
  });

  // Subdivided Net Plane along Z axis (width = 9.6m, height = 1.43m)
  const netSpanZ = 9.6;
  const netHeightSpan = NET_HEIGHT_MENS - NET_BOTTOM_HEIGHT;
  const netGeo = new THREE.PlaneGeometry(netSpanZ, netHeightSpan, 32, 10);
  // Rotate so plane lies in YZ plane at X = 0
  netGeo.rotateY(Math.PI / 2);

  const netTex = createNetGridTexture();
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    roughness: 0.65,
  });

  const netMesh = new THREE.Mesh(netGeo, netMat);
  netMesh.position.set(0, NET_BOTTOM_HEIGHT + netHeightSpan * 0.5, 0);
  netMesh.castShadow = true;
  group.add(netMesh);

  const basePositions = new Float32Array(
    (netGeo.attributes.position as THREE.BufferAttribute).array
  );

  // Top & Bottom Canvas Tapes
  const tapeGeo = new THREE.BoxGeometry(0.08, 0.1, netSpanZ + 0.2);
  const topTape = new THREE.Mesh(tapeGeo, tapeMat);
  topTape.position.set(0, NET_HEIGHT_MENS, 0);
  topTape.castShadow = true;
  group.add(topTape);

  const bottomTape = new THREE.Mesh(tapeGeo, padMat);
  bottomTape.position.set(0, NET_BOTTOM_HEIGHT, 0);
  group.add(bottomTape);

  const rig: VolleyballNetRig = {
    group,
    netMesh,
    topTape,
    bottomTape,
    basePositions,
    swayAmplitude: 0,
    swayCenterZ: 0,
    swayCenterY: 1.8,
    swayPhase: 0,
    currentNetHeight: NET_HEIGHT_MENS,
    triggerSway(hitPos, power) {
      this.swayAmplitude = Math.min(0.48, Math.max(0.15, power * 0.04));
      this.swayCenterZ = hitPos.z;
      this.swayCenterY = hitPos.y;
      this.swayPhase = 0;
    },
    update(dt, targetNetHeight) {
      // Adjust net height smoothly if room setting changed
      if (Math.abs(this.currentNetHeight - targetNetHeight) > 0.01) {
        this.currentNetHeight += (targetNetHeight - this.currentNetHeight) * Math.min(1, dt * 8);
        const span = this.currentNetHeight - NET_BOTTOM_HEIGHT;
        this.netMesh.scale.y = span / (NET_HEIGHT_MENS - NET_BOTTOM_HEIGHT);
        this.netMesh.position.y = NET_BOTTOM_HEIGHT + span * 0.5;
        this.topTape.position.y = this.currentNetHeight;
      }

      // Gentle ocean breeze + ball impact spring wave
      this.swayPhase += dt * 18;
      if (this.swayAmplitude > 0.002) {
        this.swayAmplitude *= Math.exp(-dt * 4.2);
      } else {
        this.swayAmplitude = 0;
      }

      const posAttr = this.netMesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = this.basePositions;

      for (let i = 0; i < posAttr.count; i++) {
        const idx = i * 3;
        const by = base[idx + 1] + this.netMesh.position.y;
        const bz = base[idx + 2];

        const distFromHit = Math.hypot(bz - this.swayCenterZ, by - this.swayCenterY);
        const falloff = Math.exp(-distFromHit * 0.65);
        // Pin left/right edges at posts
        const edgePin = Math.max(0, 1 - Math.pow(bz / 4.8, 4));
        const breeze = Math.sin(this.swayPhase * 0.15 + bz * 0.5) * 0.025 * edgePin;
        const impactWave =
          Math.sin(this.swayPhase - distFromHit * 2.2) * this.swayAmplitude * falloff * edgePin;

        arr[idx] = breeze + impactWave;
      }
      posAttr.needsUpdate = true;
    },
  };

  return rig;
}
