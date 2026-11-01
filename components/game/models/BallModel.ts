import * as THREE from 'three';
import { BALL_RADIUS } from '../../../shared';

export interface VolleyballRig {
  group: THREE.Group;
  ballMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  landingReticle: THREE.Group;
  trailLine: THREE.Line;
  trailPoints: THREE.Vector3[];
}

function createVolleyballTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Classic tri-color tournament beach volleyball panels (Gold, Cyan, White)
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 512, 170);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 170, 512, 172);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 342, 512, 170);

  // Panel seams
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 170);
  ctx.lineTo(512, 170);
  ctx.moveTo(0, 342);
  ctx.lineTo(512, 342);
  for (let x = 64; x < 512; x += 64) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createVolleyballRig(maxAnisotropy: number): VolleyballRig {
  const group = new THREE.Group();

  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const ballTex = createVolleyballTexture(maxAnisotropy);
  const ballMat = new THREE.MeshPhysicalMaterial({
    map: ballTex,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });

  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  group.add(ballMesh);

  // Ground shadow blob
  const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.35, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.022;
  group.add(shadowMesh);

  // Predicted Landing Reticle on the sand (helps players read 3D ball depth!)
  const landingReticle = new THREE.Group();
  const outerRingGeo = new THREE.RingGeometry(0.42, 0.56, 32);
  outerRingGeo.rotateX(-Math.PI / 2);
  const outerRingMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);

  const innerDotGeo = new THREE.CircleGeometry(0.16, 20);
  innerDotGeo.rotateX(-Math.PI / 2);
  const innerDotMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const innerDot = new THREE.Mesh(innerDotGeo, innerDotMat);

  landingReticle.add(outerRing, innerDot);
  landingReticle.position.y = 0.03;
  landingReticle.visible = false;
  group.add(landingReticle);

  // Ribbon trail for fast spikes
  const trailPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    trailPoints.push(new THREE.Vector3(0, 2, 0));
  }
  const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
  const trailMat = new THREE.LineBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.65,
  });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  group.add(trailLine);

  return {
    group,
    ballMesh,
    shadowMesh,
    landingReticle,
    trailLine,
    trailPoints,
  };
}
