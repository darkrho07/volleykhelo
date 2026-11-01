import * as THREE from 'three';
import { COURT_HALF_LENGTH, COURT_HALF_WIDTH, COURT_LENGTH, COURT_WIDTH } from '../../../shared';

export interface ArenaSceneObjects {
  group: THREE.Group;
  scoreboardCanvas: HTMLCanvasElement;
  scoreboardTex: THREE.CanvasTexture;
  spectatorInstanced: THREE.InstancedMesh;
  spectatorBasePositions: Array<{ x: number; y: number; z: number; rotY: number; phase: number }>;
  oceanMesh: THREE.Mesh;
  updateScoreboard: (
    scoreA: number,
    scoreB: number,
    setsA: number,
    setsB: number,
    servingTeam: 'A' | 'B',
    modeLabel: string
  ) => void;
  updateCrowdAndOcean: (elapsedTime: number, cheerBoost: number) => void;
}

function createSandTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f3d59b';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(217, 179, 115, 0.35)' : 'rgba(254, 243, 199, 0.35)';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function buildBeachArena(maxAnisotropy: number): ArenaSceneObjects {
  const group = new THREE.Group();

  // 1. Expansive Beach Sand Ground Plane (150m x 150m)
  const sandTex = createSandTexture(maxAnisotropy);
  const sandGeo = new THREE.PlaneGeometry(150, 150, 32, 32);
  sandGeo.rotateX(-Math.PI / 2);
  const sandMat = new THREE.MeshStandardMaterial({
    map: sandTex,
    roughness: 0.88,
    metalness: 0.02,
  });
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.receiveShadow = true;
  group.add(sandMesh);

  // 2. Tropical Ocean Water Perimeter beyond the beach
  const oceanGeo = new THREE.PlaneGeometry(280, 110, 24, 12);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.18,
    metalness: 0.15,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.set(0, -0.18, -72);
  group.add(oceanMesh);

  // 3. Court Boundary Lines (28m x 14m) with polygonOffset to prevent coplanar Z-fighting
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const lineWidth = 0.14;
  const addLine = (w: number, d: number, x: number, z: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, lineMat);
    m.position.set(x, 0.015, z);
    m.receiveShadow = true;
    group.add(m);
  };

  // Top & Bottom sidelines (length 28m at Z = ±7.0m)
  addLine(COURT_LENGTH + lineWidth, lineWidth, 0, -COURT_HALF_WIDTH);
  addLine(COURT_LENGTH + lineWidth, lineWidth, 0, COURT_HALF_WIDTH);
  // Left & Right baselines (width 14m at X = ±14.0m)
  addLine(lineWidth, COURT_WIDTH + lineWidth, -COURT_HALF_LENGTH, 0);
  addLine(lineWidth, COURT_WIDTH + lineWidth, COURT_HALF_LENGTH, 0);
  // Center line under net (X = 0)
  addLine(lineWidth * 0.85, COURT_WIDTH, 0, 0);
  // 3-meter / Attack zone reference lines on each side (at X = ±4.5m)
  addLine(lineWidth * 0.65, COURT_WIDTH, -4.5, 0);
  addLine(lineWidth * 0.65, COURT_WIDTH, 4.5, 0);

  // Subtle team court tint decals
  const teamATintMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const teamBTintMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const halfGeo = new THREE.PlaneGeometry(COURT_HALF_LENGTH, COURT_WIDTH);
  halfGeo.rotateX(-Math.PI / 2);
  const halfA = new THREE.Mesh(halfGeo, teamATintMat);
  halfA.position.set(-COURT_HALF_LENGTH * 0.5, 0.01, 0);
  const halfB = new THREE.Mesh(halfGeo, teamBTintMat);
  halfB.position.set(COURT_HALF_LENGTH * 0.5, 0.01, 0);
  group.add(halfA, halfB);

  // 4. Tropical Palm Trees around the expanded perimeter
  const palmLocations = [
    { x: -24, z: -15, s: 1.2 },
    { x: -17, z: -17, s: 1.05 },
    { x: 17, z: -17, s: 1.15 },
    { x: 24, z: -15, s: 1.25 },
    { x: -26, z: 12, s: 1.1 },
    { x: 26, z: 12, s: 1.2 },
    { x: -29, z: -4, s: 1.3 },
    { x: 29, z: -4, s: 1.15 },
  ];

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });

  palmLocations.forEach((loc, idx) => {
    const palmGroup = new THREE.Group();
    palmGroup.position.set(loc.x, 0, loc.z);
    palmGroup.scale.setScalar(loc.s);
    palmGroup.rotation.y = idx * 1.1;

    for (let seg = 0; seg < 5; seg++) {
      const tGeo = new THREE.CylinderGeometry(0.26 - seg * 0.03, 0.3 - seg * 0.03, 1.2, 10);
      const tMesh = new THREE.Mesh(tGeo, trunkMat);
      tMesh.position.set(seg * 0.14, seg * 1.08 + 0.6, 0);
      tMesh.rotation.z = -seg * 0.06;
      tMesh.castShadow = true;
      palmGroup.add(tMesh);
    }

    const crownX = 0.58;
    const crownY = 5.6;
    for (let f = 0; f < 7; f++) {
      const angle = (f / 7) * Math.PI * 2;
      const frondGeo = new THREE.ConeGeometry(0.65, 2.8, 5);
      frondGeo.rotateX(Math.PI * 0.38);
      const frond = new THREE.Mesh(frondGeo, leafMat);
      frond.position.set(
        crownX + Math.cos(angle) * 0.9,
        crownY - 0.15,
        Math.sin(angle) * 0.9
      );
      frond.rotation.y = -angle + Math.PI / 2;
      frond.castShadow = true;
      palmGroup.add(frond);
    }

    group.add(palmGroup);
  });

  // 5. Low-Poly Bleachers & InstancedMesh Spectators outside the 14m wide court
  const bleacherMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.6,
    metalness: 0.3,
  });

  const bleacherRows = [
    { z: -13.2, y: 0.45 },
    { z: -14.2, y: 0.95 },
    { z: -15.2, y: 1.45 },
  ];

  bleacherRows.forEach((row) => {
    const benchGeo = new THREE.BoxGeometry(22, 0.4, 0.85);
    const bench = new THREE.Mesh(benchGeo, bleacherMat);
    bench.position.set(0, row.y, row.z);
    bench.receiveShadow = true;
    bench.castShadow = true;
    group.add(bench);
  });

  const spectatorCount = 60;
  const specGeo = new THREE.CapsuleGeometry(0.24, 0.45, 4, 8);
  const specMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
  const spectatorInstanced = new THREE.InstancedMesh(specGeo, specMat, spectatorCount);
  spectatorInstanced.castShadow = true;

  const spectatorBasePositions: ArenaSceneObjects['spectatorBasePositions'] = [];
  const dummy = new THREE.Object3D();
  const fanColors = [0x38bdf8, 0xf43f5e, 0xfacc15, 0xa855f7, 0x4ade80, 0xfb923c];

  for (let i = 0; i < spectatorCount; i++) {
    const rowIdx = i % 3;
    const colIdx = Math.floor(i / 3);
    const x = -9.8 + colIdx * 1.02 + (rowIdx % 2) * 0.25;
    const z = bleacherRows[rowIdx].z;
    const y = bleacherRows[rowIdx].y + 0.52;

    spectatorBasePositions.push({
      x,
      y,
      z,
      rotY: 0,
      phase: i * 0.7,
    });

    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    spectatorInstanced.setMatrixAt(i, dummy.matrix);
    spectatorInstanced.setColorAt(i, new THREE.Color(fanColors[i % fanColors.length]));
  }
  spectatorInstanced.instanceMatrix.needsUpdate = true;
  if (spectatorInstanced.instanceColor) spectatorInstanced.instanceColor.needsUpdate = true;
  spectatorInstanced.computeBoundingSphere();
  group.add(spectatorInstanced);

  // 6. 3D Stadium Scoreboard Billboard behind the bleachers (Z = -18.0)
  const boardGroup = new THREE.Group();
  boardGroup.position.set(0, 4.8, -18.0);

  [-3.8, 3.8].forEach((px) => {
    const pillarGeo = new THREE.CylinderGeometry(0.16, 0.18, 5.2, 12);
    const pillar = new THREE.Mesh(pillarGeo, bleacherMat);
    pillar.position.set(px, -2.2, 0);
    pillar.castShadow = true;
    boardGroup.add(pillar);
  });

  const frameGeo = new THREE.BoxGeometry(9.2, 3.3, 0.38);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.3,
    metalness: 0.7,
  });
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.castShadow = true;
  boardGroup.add(frameMesh);

  const scoreboardCanvas = document.createElement('canvas');
  scoreboardCanvas.width = 1024;
  scoreboardCanvas.height = 360;
  const scoreboardTex = new THREE.CanvasTexture(scoreboardCanvas);
  scoreboardTex.colorSpace = THREE.SRGBColorSpace;

  const screenGeo = new THREE.PlaneGeometry(8.8, 3.0);
  const screenMat = new THREE.MeshBasicMaterial({ map: scoreboardTex });
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.z = 0.21;
  boardGroup.add(screenMesh);

  group.add(boardGroup);

  const arenaObj: ArenaSceneObjects = {
    group,
    scoreboardCanvas,
    scoreboardTex,
    spectatorInstanced,
    spectatorBasePositions,
    oceanMesh,
    updateScoreboard(scoreA, scoreB, setsA, setsB, servingTeam, modeLabel) {
      const ctx = this.scoreboardCanvas.getContext('2d')!;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 1024, 360);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 1024, 68);

      ctx.fillStyle = '#facc15';
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`VOLLEY KHELO ARENA  ·  ${modeLabel.toUpperCase()}`, 512, 45);

      ctx.fillStyle = 'rgba(14, 165, 233, 0.16)';
      ctx.fillRect(40, 90, 380, 230);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 90, 380, 230);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '800 32px sans-serif';
      ctx.fillText(servingTeam === 'A' ? '● TEAM A (SERVE)' : 'TEAM A', 230, 138);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 120px monospace';
      ctx.fillText(String(scoreA).padStart(2, '0'), 230, 265);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 26px sans-serif';
      ctx.fillText('SETS', 512, 155);
      ctx.fillStyle = '#facc15';
      ctx.font = '900 56px monospace';
      ctx.fillText(`${setsA} - ${setsB}`, 512, 230);

      ctx.fillStyle = 'rgba(244, 63, 94, 0.16)';
      ctx.fillRect(604, 90, 380, 230);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 4;
      ctx.strokeRect(604, 90, 380, 230);

      ctx.fillStyle = '#fb7185';
      ctx.font = '800 32px sans-serif';
      ctx.fillText(servingTeam === 'B' ? '● TEAM B (SERVE)' : 'TEAM B', 794, 138);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 120px monospace';
      ctx.fillText(String(scoreB).padStart(2, '0'), 794, 265);

      this.scoreboardTex.needsUpdate = true;
    },
    updateCrowdAndOcean(elapsedTime, cheerBoost) {
      const dummyObj = new THREE.Object3D();
      const speed = cheerBoost > 0.1 ? 14 : 3.5;
      const amp = cheerBoost > 0.1 ? 0.32 : 0.04;

      for (let i = 0; i < this.spectatorBasePositions.length; i++) {
        const b = this.spectatorBasePositions[i];
        const bounce = Math.abs(Math.sin(elapsedTime * speed + b.phase)) * amp;
        dummyObj.position.set(b.x, b.y + bounce, b.z);
        dummyObj.rotation.y = Math.sin(elapsedTime * 2 + b.phase) * 0.2;
        dummyObj.updateMatrix();
        this.spectatorInstanced.setMatrixAt(i, dummyObj.matrix);
      }
      this.spectatorInstanced.instanceMatrix.needsUpdate = true;

      this.oceanMesh.position.y = -0.18 + Math.sin(elapsedTime * 1.4) * 0.05;
    },
  };

  arenaObj.updateScoreboard(0, 0, 0, 0, 'A', '2v2');
  return arenaObj;
}
