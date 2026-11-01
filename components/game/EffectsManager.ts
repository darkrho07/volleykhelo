import * as THREE from 'three';

interface ParticleItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  scale: number;
  age: number;
  maxAge: number;
  gravity: number;
}

export class EffectsManager {
  public group = new THREE.Group();
  private poolSize = 140;
  private particles: ParticleItem[] = [];
  private instancedMesh: THREE.InstancedMesh;
  private impactRing: THREE.Mesh;
  private impactRingTimer = 0;
  private dummy = new THREE.Object3D();

  constructor() {
    const geo = new THREE.DodecahedronGeometry(0.1, 0);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.poolSize);
    this.instancedMesh.frustumCulled = false;

    for (let i = 0; i < this.poolSize; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -10, 0),
        vel: new THREE.Vector3(),
        color: new THREE.Color(0xf3d59b),
        scale: 0,
        age: 0,
        maxAge: 1,
        gravity: -9.8,
      });
      this.dummy.position.set(0, -10, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, new THREE.Color(0xf3d59b));
    }

    this.group.add(this.instancedMesh);

    // Hit / Spike Impact Flash Ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.42, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.impactRing = new THREE.Mesh(ringGeo, ringMat);
    this.impactRing.visible = false;
    this.group.add(this.impactRing);
  }

  public spawnSandBurst(x: number, y: number, z: number, count = 14): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.pos.set(x + (Math.random() - 0.5) * 0.4, Math.max(0.05, y), z + (Math.random() - 0.5) * 0.4);
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.8;
        p.vel.set(Math.cos(angle) * speed, 1.8 + Math.random() * 2.6, Math.sin(angle) * speed);
        p.color.setHex(Math.random() > 0.4 ? 0xf3d59b : 0xfef3c7);
        p.scale = 0.7 + Math.random() * 0.8;
        p.age = 0;
        p.maxAge = 0.45 + Math.random() * 0.25;
        p.gravity = -11.0;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  public spawnHitFlash(x: number, y: number, z: number, isSpike = false): void {
    this.impactRing.position.set(x, y, z);
    this.impactRing.scale.setScalar(isSpike ? 1.3 : 0.75);
    this.impactRing.visible = true;
    const mat = this.impactRing.material as THREE.MeshBasicMaterial;
    mat.color.setHex(isSpike ? 0xf97316 : 0xfef08a);
    mat.opacity = 0.95;
    this.impactRingTimer = 0.24;

    if (isSpike) {
      this.spawnSparkBurst(x, y, z, 18);
    }
  }

  private spawnSparkBurst(x: number, y: number, z: number, count: number): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.pos.set(x, y, z);
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const speed = 3.5 + Math.random() * 5.0;
        p.vel.set(
          Math.cos(theta) * Math.cos(phi) * speed,
          Math.sin(phi) * speed,
          Math.sin(theta) * Math.cos(phi) * speed
        );
        p.color.setHex(Math.random() > 0.5 ? 0xf97316 : 0xfef08a);
        p.scale = 0.85;
        p.age = 0;
        p.maxAge = 0.35;
        p.gravity = -4.0;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  public spawnVictoryConfetti(): void {
    const colors = [0xfacc15, 0x38bdf8, 0xf43f5e, 0x4ade80, 0xa855f7, 0xf97316];
    for (const p of this.particles) {
      p.active = true;
      p.pos.set((Math.random() - 0.5) * 14, 5.5 + Math.random() * 4.5, (Math.random() - 0.5) * 8);
      p.vel.set((Math.random() - 0.5) * 2.5, -1.2 - Math.random() * 1.8, (Math.random() - 0.5) * 2.5);
      p.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      p.scale = 0.9 + Math.random() * 0.6;
      p.age = 0;
      p.maxAge = 3.5 + Math.random() * 2.0;
      p.gravity = -1.5;
    }
  }

  public update(dt: number, cameraPos: THREE.Vector3): void {
    if (this.impactRingTimer > 0) {
      this.impactRingTimer -= dt;
      this.impactRing.lookAt(cameraPos);
      this.impactRing.scale.addScalar(dt * 6.5);
      const mat = this.impactRing.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, this.impactRingTimer / 0.24);
      if (this.impactRingTimer <= 0) {
        this.impactRing.visible = false;
      }
    }

    let anyUpdated = false;
    for (let i = 0; i < this.poolSize; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyUpdated = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      const lifeRatio = 1 - p.age / p.maxAge;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.age * 6, p.age * 4, 0);
      this.dummy.scale.setScalar(p.scale * lifeRatio);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, p.color);
    }

    if (anyUpdated) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }
}
