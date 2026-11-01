import {
  ARENA_BOUND_X,
  ARENA_BOUND_Z,
  BALL_AIR_DRAG,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  COURT_HALF_LENGTH,
  COURT_HALF_WIDTH,
  GRAVITY,
  PLAYER_DIVE_DURATION,
  PLAYER_DIVE_SPEED,
  PLAYER_JUMP_VELOCITY,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPRINT_MULT,
  STAMINA_DIVE_COST,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SEC,
} from './constants';
import { BallState, HitType, PlayerInput, PlayerState } from './types';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Deterministic player movement step shared by both server (60Hz) and client prediction.
 */
export function stepPlayerPhysics(
  player: PlayerState,
  input: PlayerInput,
  dt: number,
  isServeWait: boolean,
  isActiveServer: boolean
): void {
  let mx = clamp(input.moveX || 0, -1, 1);
  let mz = clamp(input.moveZ || 0, -1, 1);
  const mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
  }

  if (player.hitCooldown > 0) {
    player.hitCooldown = Math.max(0, player.hitCooldown - dt);
  }
  if (player.animTimer > 0) {
    player.animTimer = Math.max(0, player.animTimer - dt);
  }

  if (player.isDiving) {
    player.diveTimer -= dt;
    if (player.diveTimer <= 0) {
      player.isDiving = false;
      player.vel.x *= 0.4;
      player.vel.z *= 0.4;
    }
  } else {
    const wantsSprintOrDive = Boolean(input.sprint);
    if (
      wantsSprintOrDive &&
      mag > 0.75 &&
      player.isGrounded &&
      player.stamina >= STAMINA_DIVE_COST &&
      input.action === 'bump'
    ) {
      player.isDiving = true;
      player.diveTimer = PLAYER_DIVE_DURATION;
      player.stamina = Math.max(0, player.stamina - STAMINA_DIVE_COST);
      player.vel.x = mx * PLAYER_DIVE_SPEED;
      player.vel.z = mz * PLAYER_DIVE_SPEED;
      player.vel.y = 2.4;
      player.isGrounded = false;
      player.animState = 'dive';
      player.animTimer = PLAYER_DIVE_DURATION + 0.15;
    } else {
      let speed = PLAYER_MOVE_SPEED;
      if (wantsSprintOrDive && mag > 0.1 && player.stamina > 2) {
        speed *= PLAYER_SPRINT_MULT;
        player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_SEC * dt);
      } else {
        player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN_PER_SEC * dt);
      }

      player.vel.x = mx * speed;
      player.vel.z = mz * speed;
    }

    if (input.jump && player.isGrounded) {
      player.vel.y = PLAYER_JUMP_VELOCITY;
      player.isGrounded = false;
      player.animState = 'jump';
      player.animTimer = 0.55;
    }
  }

  if (!player.isGrounded) {
    player.vel.y += GRAVITY * dt;
  }

  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.vel.y = 0;
    player.isGrounded = true;
  }

  const netMargin = PLAYER_RADIUS + 0.22;
  if (player.team === 'A') {
    if (isServeWait && isActiveServer) {
      player.pos.x = clamp(player.pos.x, -ARENA_BOUND_X, -(COURT_HALF_LENGTH + 0.3));
    } else {
      player.pos.x = clamp(player.pos.x, -ARENA_BOUND_X, -netMargin);
    }
  } else {
    if (isServeWait && isActiveServer) {
      player.pos.x = clamp(player.pos.x, COURT_HALF_LENGTH + 0.3, ARENA_BOUND_X);
    } else {
      player.pos.x = clamp(player.pos.x, netMargin, ARENA_BOUND_X);
    }
  }

  player.pos.z = clamp(player.pos.z, -ARENA_BOUND_Z, ARENA_BOUND_Z);

  if (mag > 0.08) {
    player.facingAngle = Math.atan2(mz, mx);
  } else {
    player.facingAngle = player.team === 'A' ? 0 : Math.PI;
  }

  if (player.animTimer <= 0 && !player.isDiving) {
    if (!player.isGrounded) {
      player.animState = 'jump';
    } else if (mag > 0.12) {
      player.animState = 'run';
    } else {
      player.animState = 'idle';
    }
  }
}

/**
 * Predicts where the ball will land on y = BALL_RADIUS given its current pos & vel.
 */
export function predictBallLanding(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number }
): { x: number; z: number } | null {
  const y0 = Math.max(0, pos.y - BALL_RADIUS);
  const vy = vel.y;
  const g = Math.abs(GRAVITY);
  const disc = vy * vy + 2 * g * y0;
  if (disc < 0) return null;
  const t = (vy + Math.sqrt(disc)) / g;
  if (t <= 0 || t > 6.5) return null;
  const dragFactor = Math.max(0.72, 1 - BALL_AIR_DRAG * t * 0.5);
  return {
    x: pos.x + vel.x * t * dragFactor,
    z: pos.z + vel.z * t * dragFactor,
  };
}

/**
 * Computes new ball velocity & spin when a player contacts the ball.
 * Tuned for the expanded 28m x 14m court with generous, readable hang-time.
 */
export function computeHitTrajectory(
  player: PlayerState,
  ball: BallState,
  requestedAction: HitType,
  charge: number,
  aimX: number,
  aimZ: number,
  netHeight: number,
  touchesOnSideAfterHit: number
): {
  vel: { x: number; y: number; z: number };
  spin: { x: number; y: number; z: number };
  actualHitType: HitType;
} {
  const dirToOpponentX = player.team === 'A' ? 1 : -1;
  const clampedCharge = clamp(charge || 0.75, 0, 1);

  const lateralAim = clamp(aimZ, -1, 1);
  const forwardBias = clamp(aimX * dirToOpponentX, -0.5, 1);

  let actualHitType: HitType = requestedAction;

  // Automatically upgrade an airborne hit into a Spike
  if (
    requestedAction === 'bump' &&
    !player.isGrounded &&
    player.pos.y > 0.48 &&
    Math.abs(player.pos.x) < 8.5
  ) {
    actualHitType = 'spike';
  }

  const maxZ = COURT_HALF_WIDTH - 1.1; // ~5.9m
  let targetX = dirToOpponentX * 7.8;
  let targetZ = lateralAim * maxZ;
  let flightTime = 1.75;
  const spin = { x: 0, y: 0, z: 0 };

  if (actualHitType === 'serve') {
    const powerFactor = 0.4 + clampedCharge * 0.6;
    targetX = dirToOpponentX * (6.5 + powerFactor * 5.2 + forwardBias * 1.2);
    targetZ = lateralAim * maxZ;
    const isJumpServe = !player.isGrounded && player.pos.y > 0.42;
    flightTime = isJumpServe ? 1.55 - clampedCharge * 0.2 : 1.88 - clampedCharge * 0.18;
    spin.z = -dirToOpponentX * (5 + clampedCharge * 8);
  } else if (actualHitType === 'set') {
    // Set: soft, high-arc pass toward front-center near the net (unless 3rd touch, then send over net)
    if (touchesOnSideAfterHit >= 3) {
      targetX = dirToOpponentX * 7.0;
      targetZ = lateralAim * (maxZ * 0.85);
      flightTime = 1.92;
    } else {
      // Float high near the net on own side for a teammate or follow-up spike
      targetX = -dirToOpponentX * 2.5;
      targetZ = clamp(player.pos.z * 0.35 + lateralAim * 3.8, -maxZ, maxZ);
      flightTime = 1.78;
    }
    spin.y = 2.0;
  } else if (actualHitType === 'spike') {
    const power = 0.35 + clampedCharge * 0.65;
    const distFromNet = Math.abs(player.pos.x);
    const jumpApexBonus = clamp(player.pos.y / 1.7, 0, 1);

    targetX = dirToOpponentX * (5.2 + power * 6.5 + forwardBias * 1.4);
    targetZ = clamp(player.pos.z * 0.3 + lateralAim * maxZ, -maxZ, maxZ);

    if (distFromNet < 5.2 && jumpApexBonus > 0.4) {
      flightTime = 0.92 - power * 0.16;
    } else {
      flightTime = 1.22 - power * 0.18;
    }
    spin.z = -dirToOpponentX * (10 + power * 10);
  } else {
    // Bump / Receive: high, floaty parabolic arc giving plenty of time to react
    if (touchesOnSideAfterHit === 1 && Math.abs(player.pos.x) > 5.5 && forwardBias < 0.65) {
      targetX = dirToOpponentX * 4.2;
      targetZ = lateralAim * (maxZ * 0.8);
      flightTime = 1.92;
    } else {
      targetX = dirToOpponentX * (7.4 + forwardBias * 3.6);
      targetZ = lateralAim * maxZ;
      flightTime = 1.82;
    }
    spin.z = -dirToOpponentX * 3.0;
  }

  flightTime = Math.max(0.68, flightTime);
  const dx = targetX - ball.pos.x;
  const dz = targetZ - ball.pos.z;
  const targetY = BALL_RADIUS + 0.12;
  const dy = targetY - ball.pos.y;

  let vx = (dx / flightTime) * (1 + BALL_AIR_DRAG * flightTime * 0.45);
  let vz = (dz / flightTime) * (1 + BALL_AIR_DRAG * flightTime * 0.45);
  let vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

  // Guarantee the ball clears the net if heading to opponent side
  const crossesNet = (ball.pos.x < 0 && targetX > 0) || (ball.pos.x > 0 && targetX < 0);
  if (crossesNet && Math.abs(vx) > 0.5) {
    const tToNet = Math.abs(ball.pos.x / vx);
    const yAtNet = ball.pos.y + vy * tToNet + 0.5 * GRAVITY * tToNet * tToNet;
    const minClearance = netHeight + BALL_RADIUS + (actualHitType === 'spike' ? 0.22 : 0.65);
    if (yAtNet < minClearance && tToNet > 0.06) {
      vy = (minClearance - ball.pos.y - 0.5 * GRAVITY * tToNet * tToNet) / tToNet;
    }
  }

  const totalSpeed = Math.hypot(vx, vy, vz);
  if (totalSpeed > BALL_MAX_SPEED) {
    const scale = BALL_MAX_SPEED / totalSpeed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }

  return {
    vel: { x: vx, y: vy, z: vz },
    spin,
    actualHitType,
  };
}
