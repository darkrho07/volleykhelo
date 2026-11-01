import * as THREE from 'three';
import { PlayerAnimState, PlayerState } from '../../../shared';

export interface ArticulatedPlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Mesh;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  shadowDisc: THREE.Mesh;
  roleRing: THREE.Mesh;
  nameSprite: THREE.Sprite;
  emoteSprite: THREE.Sprite;
  currentOutfitColor: string;
  currentEmoteText: string;
  stepAudioCooldown: number;
}

function createJerseyNumberTexture(num: number, bgHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 256);

  // Sporty side stripes
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, 0, 28, 256);
  ctx.fillRect(228, 0, 28, 256);

  // Collar trim
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 22);

  // Jersey number
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 128, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNameplateTexture(name: string, team: 'A' | 'B', isLocal: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 320, 80);
  ctx.fillStyle = isLocal ? 'rgba(15, 23, 42, 0.92)' : 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(20, 14, 280, 52, 14);
  ctx.fill();

  ctx.strokeStyle = isLocal ? '#facc15' : team === 'A' ? '#38bdf8' : '#fb7185';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = isLocal ? '#fef08a' : '#f8fafc';
  ctx.font = '700 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 15), 160, 41);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function updateEmoteSpriteTexture(sprite: THREE.Sprite, text: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(16, 12, 288, 62, 18);
  ctx.fill();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 43);

  const mat = sprite.material as THREE.SpriteMaterial;
  if (mat.map) mat.map.dispose();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex;
  mat.needsUpdate = true;
}

/**
 * Builds a 10-part composite articulated 3D Beach Volleyball Athlete pivoted at y = 0.
 */
export function createPlayerRig(state: PlayerState, isLocal: boolean): ArticulatedPlayerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe0ac69,
    roughness: 0.65,
    metalness: 0.05,
  });

  const jerseyTex = createJerseyNumberTexture(state.jerseyNumber || 7, state.outfitColor);
  const jerseyMat = new THREE.MeshStandardMaterial({
    map: jerseyTex,
    roughness: 0.42,
    metalness: 0.1,
  });

  const shortsMat = new THREE.MeshStandardMaterial({
    color: state.team === 'A' ? 0x0c4a6e : 0x881337,
    roughness: 0.72,
    metalness: 0.05,
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(state.visorColor || '#fef08a'),
    roughness: 0.25,
    metalness: 0.35,
  });

  const glassesMat = new THREE.MeshPhysicalMaterial({
    color: 0x090d16,
    roughness: 0.12,
    metalness: 0.85,
    clearcoat: 1.0,
  });

  // 1. Soft radial contact shadow on sand (prevents floating appearance)
  const shadowGeo = new THREE.CircleGeometry(0.55, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.02;
  root.add(shadowDisc);

  // 2. Role/Team indicator ring on ground
  const ringGeo = new THREE.RingGeometry(0.56, 0.68, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isLocal ? 0xfacc15 : state.team === 'A' ? 0x38bdf8 : 0xf43f5e,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const roleRing = new THREE.Mesh(ringGeo, ringMat);
  roleRing.position.y = 0.025;
  root.add(roleRing);

  // 3. Torso (Athletic tapered cylinder + chest)
  const torsoGeo = new THREE.CylinderGeometry(0.27, 0.22, 0.66, 16);
  const torso = new THREE.Mesh(torsoGeo, jerseyMat);
  torso.position.y = 1.02;
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // 4. Shorts / Hip block
  const hipsGeo = new THREE.CylinderGeometry(0.23, 0.24, 0.26, 14);
  const hips = new THREE.Mesh(hipsGeo, shortsMat);
  hips.position.y = 0.62;
  hips.castShadow = true;
  bodyPivot.add(hips);

  // 5. Head Group (Head + Visor Brim + Sport Sunglasses + Hair)
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.54;
  bodyPivot.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.21, 20, 20);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Sporty Headband + Sun Visor Brim (facing +X in local player space)
  const bandGeo = new THREE.CylinderGeometry(0.218, 0.218, 0.07, 20);
  const bandMesh = new THREE.Mesh(bandGeo, visorMat);
  bandMesh.position.y = 0.06;
  headGroup.add(bandMesh);

  const brimGeo = new THREE.BoxGeometry(0.22, 0.025, 0.32);
  const brimMesh = new THREE.Mesh(brimGeo, visorMat);
  brimMesh.position.set(0.16, 0.05, 0);
  headGroup.add(brimMesh);

  // Sport Sunglasses
  const shadesGeo = new THREE.BoxGeometry(0.12, 0.065, 0.28);
  const shadesMesh = new THREE.Mesh(shadesGeo, glassesMat);
  shadesMesh.position.set(0.165, 0.0, 0);
  headGroup.add(shadesMesh);

  // Hair crown
  const hairGeo = new THREE.SphereGeometry(0.19, 14, 12);
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.position.set(-0.03, 0.08, 0);
  headGroup.add(hairMesh);

  // 6 & 7. Left & Right Articulated Arms (Shoulder -> Arm -> Wristband)
  const createArm = (sideZ: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.28, sideZ * 0.33);

    const armGeo = new THREE.CapsuleGeometry(0.068, 0.44, 6, 12);
    const armMesh = new THREE.Mesh(armGeo, skinMat);
    armMesh.position.y = -0.22;
    armMesh.castShadow = true;
    pivot.add(armMesh);

    const wristGeo = new THREE.CylinderGeometry(0.074, 0.072, 0.08, 12);
    const wristMesh = new THREE.Mesh(wristGeo, visorMat);
    wristMesh.position.y = -0.38;
    pivot.add(wristMesh);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftArmPivot = createArm(-1);
  const rightArmPivot = createArm(1);

  // 8 & 9. Left & Right Articulated Legs (Hip -> Leg -> Athletic Sneaker)
  const sneakerMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.15,
  });

  const createLeg = (sideZ: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.54, sideZ * 0.13);

    const legGeo = new THREE.CapsuleGeometry(0.082, 0.38, 6, 12);
    const legMesh = new THREE.Mesh(legGeo, skinMat);
    legMesh.position.y = -0.24;
    legMesh.castShadow = true;
    pivot.add(legMesh);

    const shoeGeo = new THREE.BoxGeometry(0.26, 0.1, 0.15);
    const shoeMesh = new THREE.Mesh(shoeGeo, sneakerMat);
    shoeMesh.position.set(0.04, -0.49, 0);
    shoeMesh.castShadow = true;
    pivot.add(shoeMesh);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftLegPivot = createLeg(-1);
  const rightLegPivot = createLeg(1);

  // 10. Floating Nameplate Sprite & Quick Emote Sprite
  const nameTex = createNameplateTexture(state.name, state.team, isLocal);
  const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthTest: false });
  const nameSprite = new THREE.Sprite(nameMat);
  nameSprite.position.set(0, 2.18, 0);
  nameSprite.scale.set(1.85, 0.46, 1);
  root.add(nameSprite);

  const emoteMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
  const emoteSprite = new THREE.Sprite(emoteMat);
  emoteSprite.position.set(0, 2.68, 0);
  emoteSprite.scale.set(2.1, 0.62, 1);
  emoteSprite.visible = false;
  root.add(emoteSprite);

  return {
    root,
    bodyPivot,
    torso,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    shadowDisc,
    roleRing,
    nameSprite,
    emoteSprite,
    currentOutfitColor: state.outfitColor,
    currentEmoteText: '',
    stepAudioCooldown: 0,
  };
}

/**
 * Animates the articulated 10-part player rig at 60fps based on velocity & PlayerAnimState.
 */
export function updatePlayerRigAnimation(
  rig: ArticulatedPlayerRig,
  animState: PlayerAnimState,
  elapsedTime: number,
  speedXZ: number,
  heightY: number,
  isServingPlayer: boolean
): void {
  // Scale contact shadow based on jump height
  const shadowScale = Math.max(0.45, 1 - heightY * 0.22);
  rig.shadowDisc.scale.setScalar(shadowScale);
  rig.shadowDisc.position.y = -heightY + 0.02;
  rig.roleRing.position.y = -heightY + 0.025;

  // Highlight active server ring
  const ringMat = rig.roleRing.material as THREE.MeshBasicMaterial;
  ringMat.opacity = isServingPlayer ? 0.95 : 0.65;

  // Reset base body tilt
  rig.bodyPivot.rotation.set(0, 0, 0);
  rig.bodyPivot.position.set(0, 0, 0);

  if (animState === 'dive') {
    // Horizontal dive stretch forward (+X in local space)
    rig.bodyPivot.rotation.z = -Math.PI * 0.42;
    rig.bodyPivot.position.y = -0.35;
    rig.leftArmPivot.rotation.z = Math.PI * 0.85;
    rig.rightArmPivot.rotation.z = Math.PI * 0.85;
    rig.leftLegPivot.rotation.z = -0.3;
    rig.rightLegPivot.rotation.z = -0.15;
    return;
  }

  if (animState === 'spike' || animState === 'serve') {
    // Dynamic overhead arm swing
    const swing = Math.sin(elapsedTime * 22) * 0.6 + 2.3;
    rig.rightArmPivot.rotation.z = swing;
    rig.leftArmPivot.rotation.z = 1.5;
    rig.bodyPivot.rotation.z = -0.15;
    rig.leftLegPivot.rotation.z = -0.35;
    rig.rightLegPivot.rotation.z = 0.25;
    return;
  }

  if (animState === 'set') {
    // Both hands raised high above forehead in diamond set posture
    rig.leftArmPivot.rotation.z = 2.55;
    rig.rightArmPivot.rotation.z = 2.55;
    rig.leftArmPivot.rotation.x = 0.25;
    rig.rightArmPivot.rotation.x = -0.25;
    rig.headGroup.rotation.z = 0.25;
    return;
  }

  if (animState === 'bump') {
    // Forearm platform locked together in front of waist
    rig.leftArmPivot.rotation.z = 1.15;
    rig.rightArmPivot.rotation.z = 1.15;
    rig.leftArmPivot.rotation.x = 0.32;
    rig.rightArmPivot.rotation.x = -0.32;
    rig.bodyPivot.rotation.z = -0.18;
    return;
  }

  if (animState === 'celebrate') {
    // Joyful jumping & pumping both arms in the air
    const bounce = Math.abs(Math.sin(elapsedTime * 10)) * 0.28;
    rig.bodyPivot.position.y = bounce;
    rig.leftArmPivot.rotation.z = 2.6 + Math.sin(elapsedTime * 14) * 0.3;
    rig.rightArmPivot.rotation.z = 2.6 - Math.sin(elapsedTime * 14) * 0.3;
    rig.leftLegPivot.rotation.z = 0.2;
    rig.rightLegPivot.rotation.z = -0.2;
    return;
  }

  if (animState === 'sad') {
    // Slumped shoulders
    rig.headGroup.rotation.z = -0.32;
    rig.leftArmPivot.rotation.z = 0.1;
    rig.rightArmPivot.rotation.z = 0.1;
    return;
  }

  rig.headGroup.rotation.z = 0;
  rig.leftArmPivot.rotation.x = 0;
  rig.rightArmPivot.rotation.x = 0;

  if (animState === 'jump' || heightY > 0.15) {
    rig.leftArmPivot.rotation.z = 1.95;
    rig.rightArmPivot.rotation.z = 2.15;
    rig.leftLegPivot.rotation.z = -0.4;
    rig.rightLegPivot.rotation.z = 0.2;
    return;
  }

  if (animState === 'run' || speedXZ > 0.4) {
    const freq = elapsedTime * 14;
    const stride = Math.min(1, speedXZ / 6.5) * 0.72;
    rig.leftLegPivot.rotation.z = Math.sin(freq) * stride;
    rig.rightLegPivot.rotation.z = -Math.sin(freq) * stride;
    rig.leftArmPivot.rotation.z = -Math.sin(freq) * stride * 0.85 + 0.25;
    rig.rightArmPivot.rotation.z = Math.sin(freq) * stride * 0.85 + 0.25;
    rig.bodyPivot.position.y = Math.abs(Math.cos(freq)) * 0.06;
    rig.bodyPivot.rotation.z = -0.1;
  } else {
    // Athletic ready breath idle
    const breath = Math.sin(elapsedTime * 3.5) * 0.03;
    rig.bodyPivot.position.y = breath;
    rig.leftArmPivot.rotation.z = 0.35 + breath;
    rig.rightArmPivot.rotation.z = 0.35 - breath;
    rig.leftLegPivot.rotation.z = 0.08;
    rig.rightLegPivot.rotation.z = -0.08;
  }
}
