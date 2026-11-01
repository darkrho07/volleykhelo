import {
  BallState,
  COURT_HALF_LENGTH,
  COURT_HALF_WIDTH,
  GameMode,
  getCourtFormationPosition,
  MatchPhase,
  PLAYER_REACH_RADIUS,
  PlayerInput,
  PlayerState,
} from '../../shared';

export function computeBotInput(
  bot: PlayerState,
  allPlayers: PlayerState[],
  ball: BallState,
  phase: MatchPhase,
  servingPlayerId: string | null,
  mode: GameMode,
  serverTick: number
): PlayerInput {
  const input: PlayerInput = {
    seq: serverTick,
    moveX: 0,
    moveZ: 0,
    aimX: bot.team === 'A' ? 1 : -1,
    aimZ: 0,
    jump: false,
    sprint: false,
    action: null,
    charge: 0.65,
    timestamp: Date.now(),
  };

  const isTeamA = bot.team === 'A';
  const dirToNet = isTeamA ? 1 : -1;

  // 1. Serve handling when this bot is the designated server
  if (phase === 'serve_wait') {
    if (servingPlayerId === bot.id) {
      const serveSpot = getCourtFormationPosition(bot.team, mode, 0, true);
      const dx = serveSpot.x - bot.pos.x;
      const dz = serveSpot.z - bot.pos.z;
      if (Math.hypot(dx, dz) > 0.35) {
        input.moveX = Math.max(-1, Math.min(1, dx * 2));
        input.moveZ = Math.max(-1, Math.min(1, dz * 2));
        return input;
      }
      // Trigger serve after a short rhythm delay
      if (serverTick % 55 === 0) {
        input.jump = true;
        input.action = 'serve';
        input.charge = 0.72;
        input.aimX = dirToNet;
        input.aimZ = Math.sin(serverTick * 0.17) * 0.75;
      }
    } else {
      // Move to home formation spot
      const home = getCourtFormationPosition(bot.team, mode, bot.slotIndex, false);
      const dx = home.x - bot.pos.x;
      const dz = home.z - bot.pos.z;
      if (Math.hypot(dx, dz) > 0.3) {
        input.moveX = Math.max(-1, Math.min(1, dx * 1.5));
        input.moveZ = Math.max(-1, Math.min(1, dz * 1.5));
      }
    }
    return input;
  }

  if (phase !== 'playing') {
    return input;
  }

  // 2. Determine if the ball is on or heading toward the bot's side of the court
  const landing = ball.predictedLanding || { x: ball.pos.x, z: ball.pos.z };
  const ballOnOurSide = isTeamA ? ball.pos.x < 0.3 : ball.pos.x > -0.3;
  const landingOnOurSide = isTeamA ? landing.x < 0.2 : landing.x > -0.2;

  const teammates = allPlayers.filter((p) => p.team === bot.team && p.connected);

  // Pick which teammate is closest to the landing spot (and didn't just touch it if >1 teammate)
  let designatedResponderId = bot.id;
  if (teammates.length > 1) {
    let bestScore = Infinity;
    for (const mate of teammates) {
      const dist = Math.hypot(landing.x - mate.pos.x, landing.z - mate.pos.z);
      // Penalize player who just touched the ball to prevent double-touch faults
      const penalty = ball.lastTouchPlayerId === mate.id ? 6.5 : 0;
      if (dist + penalty < bestScore) {
        bestScore = dist + penalty;
        designatedResponderId = mate.id;
      }
    }
  }

  let targetX: number;
  let targetZ: number;

  if ((ballOnOurSide || landingOnOurSide) && designatedResponderId === bot.id) {
    // Intercept ball landing spot
    targetX = isTeamA
      ? Math.max(-COURT_HALF_LENGTH - 1.5, Math.min(-0.65, landing.x))
      : Math.min(COURT_HALF_LENGTH + 1.5, Math.max(0.65, landing.x));
    targetZ = Math.max(-COURT_HALF_WIDTH - 1.0, Math.min(COURT_HALF_WIDTH + 1.0, landing.z));
  } else if (ballOnOurSide && teammates.length > 1 && ball.touchesThisSide === 1) {
    // Prepare at the net for a set or spike!
    targetX = isTeamA ? -1.55 : 1.55;
    targetZ = bot.slotIndex % 2 === 0 ? 1.6 : -1.6;
  } else {
    // Return to base defensive formation
    const home = getCourtFormationPosition(bot.team, mode, bot.slotIndex, false);
    targetX = home.x;
    targetZ = home.z;
  }

  const dx = targetX - bot.pos.x;
  const dz = targetZ - bot.pos.z;
  const distToTarget = Math.hypot(dx, dz);

  if (distToTarget > 0.22) {
    input.moveX = dx / distToTarget;
    input.moveZ = dz / distToTarget;
    if (distToTarget > 2.8 && (ballOnOurSide || landingOnOurSide)) {
      input.sprint = true;
    }
  }

  // 3. Check if ball is within reach or approaching spike height
  const dist3D = Math.hypot(
    ball.pos.x - bot.pos.x,
    ball.pos.y - (bot.pos.y + 1.05),
    ball.pos.z - bot.pos.z
  );
  const horizontalDist = Math.hypot(ball.pos.x - bot.pos.x, ball.pos.z - bot.pos.z);

  // Avoid double touch unless allowed in 1v1
  const canTouch =
    ball.lastTouchPlayerId !== bot.id || teammates.length === 1;

  if (canTouch && ballOnOurSide) {
    // Jump up to spike if the ball is high near the net
    if (
      horizontalDist < 1.85 &&
      ball.pos.y > 1.85 &&
      ball.pos.y < 3.6 &&
      Math.abs(bot.pos.x) < 3.6 &&
      (ball.touchesThisSide >= 1 || teammates.length === 1)
    ) {
      input.jump = true;
    }

    if (dist3D <= PLAYER_REACH_RADIUS + 0.12) {
      // Choose bump, set, or spike based on team touch count and court position
      const nextTouch = ball.lastTouchTeam === bot.team ? ball.touchesThisSide + 1 : 1;
      input.aimX = dirToNet;
      // Aim toward open corner of opponent court
      input.aimZ = Math.sin(serverTick * 0.23 + bot.jerseyNumber) * 0.82;

      if (!bot.isGrounded && bot.pos.y > 0.45 && Math.abs(bot.pos.x) < 4.2) {
        input.action = 'spike';
        input.charge = 0.85;
      } else if (nextTouch === 1 && teammates.length > 1) {
        input.action = 'bump';
        input.charge = 0.4;
      } else if (nextTouch === 2 && teammates.length > 1) {
        input.action = 'set';
        input.charge = 0.5;
      } else {
        input.action = 'bump';
        input.charge = 0.65;
      }
    } else if (
      horizontalDist < 2.9 &&
      horizontalDist > 1.4 &&
      ball.pos.y < 1.2 &&
      ball.vel.y < -1.0 &&
      bot.isGrounded
    ) {
      // Emergency dive save!
      input.sprint = true;
      input.action = 'bump';
    }
  }

  return input;
}
