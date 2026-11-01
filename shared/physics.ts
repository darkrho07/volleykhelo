import {
  ARENA_BOUND_X,
  ARENA_BOUND_Z,
  BALL_AIR_DRAG,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  COURT_HALF_LENGTH,
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
  // Clamp input vectors (anti-cheat / normalization)
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

  // Handle active dive state
  if (player.isDiving) {
    player.diveTimer -= dt;
    if (player.diveTimer <= 0) {
      player.isDiving = false;
      player.vel.x *= 0.4;
      player.vel.z *= 0.4;
    }
  } else {
    // Initiate dive if Shift pressed while moving fast on ground and enough stamina
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
      player.vel.y = 2.6;
      player.isGrounded = false;
      player.animState = 'dive';
      player.animTimer = PLAYER_DIVE_DURATION + 0.15;
    } else {
      // Standard movement + sprint
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

    // Jump
    if (input.jump && player.isGrounded) {
      player.vel.y = PLAYER_JUMP_VELOCITY;
      player.isGrounded = false;
      player.animState = 'jump';
      player.animTimer = 0.55;
    }
  }

  // Apply gravity
  if (!player.isGrounded) {
    player.vel.y += GRAVITY * dt;
  }

  // Integrate position
  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  // Ground collision
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.vel.y = 0;
    player.isGrounded = true;
  }

  // Team side clamping (players cannot cross under the net X = 0)
  const netMargin = PLAYER_RADIUS + 0.18;
  if (player.team === 'A') {
    if (isServeWait && isActiveServer) {
      // Server must stay behind back line until they hit the serve
      player.pos.x = clamp(player.pos.x, -ARENA_BOUND_X, -(COURT_HALF_LENGTH + 0.25));
    } else {
      player.pos.x = clamp(player.pos.x, -ARENA_BOUND_X, -netMargin);
    }
  } else {
    if (isServeWait && isActiveServer) {
      player.pos.x = clamp(player.pos.x, COURT_HALF_LENGTH + 0.25, ARENA_BOUND_X);
    } else {
      player.pos.x = clamp(player.pos.x, netMargin, ARENA_BOUND_X);
    }
  }

  player.pos.z = clamp(player.pos.z, -ARENA_BOUND_Z, ARENA_BOUND_Z);

  // Update facing direction
  if (mag > 0.08) {
    player.facingAngle = Math.atan2(mz, mx);
  } else {
    // Face the net by default
    player.facingAngle = player.team === 'A' ? 0 : Math.PI;
  }

  // Update base animation state if not in an active action animation
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
export function predictBallLanding(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }): { x: number; z: number } | null {
  const y0 = Math.max(0, pos.y - BALL_RADIUS);
  const vy = vel.y;
  const g = Math.abs(GRAVITY);
  const disc = vy * vy + 2 * g * y0;
  if (disc < 0) return null;
  const t = (vy + Math.sqrt(disc)) / g;
  if (t <= 0 || t > 5.0) return null;
  const dragFactor = Math.max(0.75, 1 - BALL_AIR_DRAG * t * 0.5);
  return {
    x: pos.x + vel.x * t * dragFactor,
    z: pos.z + vel.z * t * dragFactor,
  };
}

/**
 * Computes new ball velocity & spin when a player contacts the ball.
 * Produces distinct arcs for bump, set, spike, and serve.
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
): { vel: { x: number; y: number; z: number }; spin: { x: number; y: number; z: number }; actualHitType: HitType } {
  const dirToOpponentX = player.team === 'A' ? 1 : -1;
  const clampedCharge = clamp(charge || 0, 0, 1);

  // Normalize lateral Z aim (-1 to 1)
  const lateralAim = clamp(aimZ, -1, 1);
  const forwardBias = clamp(aimX * dirToOpponentX, -0.5, 1);

  let actualHitType: HitType = requestedAction;

  // Automatically upgrade a high airborne charged hit into a Spike
  if (
    requestedAction === 'bump' &&
    !player.isGrounded &&
    player.pos.y > 0.65 &&
    (clampedCharge > 0.25 || Math.abs(player.pos.x) < 4.5)
  ) {
    actualHitType = 'spike';
  }

  let targetX = dirToOpponentX * 5.0;
  let targetZ = lateralAim * 3.4;
  let flightTime = 1.15;
  const spin = { x: 0, y: 0, z: 0 };

  if (actualHitType === 'serve') {
    // Serve from behind back line across the net
    const powerFactor = 0.4 + clampedCharge * 0.6;
    targetX = dirToOpponentX * (4.2 + powerFactor * 3.8 + forwardBias * 0.8);
    targetZ = lateralAim * 3.6;
    // Higher charge + airborne = faster, flatter topspin jump serve
    const isJumpServe = !player.isGrounded && player.pos.y > 0.45;
    flightTime = isJumpServe ? 1.05 - clampedCharge * 0.26 : 1.32 - clampedCharge * 0.22;
    spin.z = -dirToOpponentX * (6 + clampedCharge * 10);
  } else if (actualHitType === 'set') {
    // Set: soft, high-arc pass toward front-center near the net (unless 3rd touch, then send over net)
    if (touchesOnSideAfterHit >= 3) {
      targetX = dirToOpponentX * 4.5;
      targetZ = lateralAim * 3.0;
      flightTime = 1.45;
    } else {
      // Float near the net on own side for a teammate (or follow-up spike)
      targetX = -dirToOpponentX * 1.65;
      targetZ = clamp(player.pos.z * 0.35 + lateralAim * 2.4, -3.5, 3.5);
      flightTime = 1.38;
    }
    spin.y = 2.0;
  } else if (actualHitType === 'spike') {
    // Spike: fast, aggressive downward/forward smash into opponent's court
    const power = 0.35 + clampedCharge * 0.65;
    const distFromNet = Math.abs(player.pos.x);
    const jumpApexBonus = clamp(player.pos.y / 1.8, 0, 1);

    targetX = dirToOpponentX * (3.2 + power * 4.6 + forwardBias * 0.9);
    targetZ = clamp(player.pos.z * 0.3 + lateralAim * 3.8, -4.1, 4.1);

    // If spiking close to the net while high in the air, allow a blazing fast trajectory
    if (distFromNet < 3.5 && jumpApexBonus > 0.45) {
      flightTime = 0.56 - power * 0.16;
    } else {
      flightTime = 0.82 - power * 0.18;
    }
    spin.z = -dirToOpponentX * (14 + power * 12);
  } else {
    // Bump / Receive: forgiving high parabolic arc
    if (touchesOnSideAfterHit === 1 && Math.abs(player.pos.x) > 3.5 && forwardBias < 0.65) {
      // First touch receive: pop it high toward own setter zone or safe mid-court
      targetX = dirToOpponentX * 2.5;
      targetZ = lateralAim * 2.8;
      flightTime = 1.42;
    } else {
      // Send cleanly over the net into opponent court
      targetX = dirToOpponentX * (4.8 + forwardBias * 2.4);
      targetZ = lateralAim * 3.4;
      flightTime = 1.32;
    }
    spin.z = -dirToOpponentX * 3.5;
  }

  flightTime = Math.max(0.42, flightTime);
  const dx = targetX - ball.pos.x;
  const dz = targetZ - ball.pos.z;
  const targetY = BALL_RADIUS + 0.1;
  const dy = targetY - ball.pos.y;

  // Kinematics: dy = vy * t + 0.5 * g * t^2  =>  vy = (dy - 0.5 * g * t^2) / t
  let vx = (dx / flightTime) * (1 + BALL_AIR_DRAG * flightTime * 0.45);
  let vz = (dz / flightTime) * (1 + BALL_AIR_DRAG * flightTime * 0.45);
  let vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

  // Guarantee the ball clears the net if heading to opponent side (unless spiked sharply from close net)
  const crossesNet = (ball.pos.x < 0 && targetX > 0) || (ball.pos.x > 0 && targetX < 0);
  if (crossesNet && Math.abs(vx) > 0.5) {
    const tToNet = Math.abs(ball.pos.x / vx);
    const yAtNet = ball.pos.y + vy * tToNet + 0.5 * GRAVITY * tToNet * tToNet;
    const minClearance = netHeight + BALL_RADIUS + (actualHitType === 'spike' ? 0.12 : 0.42);
    if (yAtNet < minClearance && tToNet > 0.06) {
      vy = (minClearance - ball.pos.y - 0.5 * GRAVITY * tToNet * tToNet) / tToNet;
    }
  }

  // Clamp maximum ball speed
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
