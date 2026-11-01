import {
  ARENA_BOUND_X,
  ARENA_BOUND_Z,
  BALL_AIR_DRAG,
  BALL_RADIUS,
  BALL_RESTITUTION_NET,
  BALL_RESTITUTION_SAND,
  clamp,
  computeHitTrajectory,
  COURT_HALF_LENGTH,
  COURT_HALF_WIDTH,
  GameEventPayload,
  GameSnapshot,
  getCourtFormationPosition,
  GRAVITY,
  HitType,
  LINE_TOLERANCE,
  MatchPhase,
  NET_BOTTOM_HEIGHT,
  NET_THICKNESS,
  PLAYER_HIT_COOLDOWN,
  PLAYER_RADIUS,
  PLAYER_REACH_RADIUS,
  PlayerInput,
  PlayerState,
  predictBallLanding,
  RoomSettings,
  SERVER_DT,
  SetScore,
  stepPlayerPhysics,
  TeamId,
} from '../../shared';
import { computeBotInput } from './BotAI';

export interface GameEngineCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void;
  onEvent: (event: GameEventPayload) => void;
  onRoomStateChanged: () => void;
}

export class GameEngine {
  public serverTick = 0;
  public phase: MatchPhase = 'lobby';
  public phaseTimer = 0;
  public score: SetScore = { teamA: 0, teamB: 0 };
  public setsWon: SetScore = { teamA: 0, teamB: 0 };
  public currentSet = 1;
  public servingTeam: TeamId = 'A';
  public servingPlayerId: string | null = null;
  public lastPointReason: string | null = null;
  public lastScoringTeam: TeamId | null = null;
  public winnerTeam: TeamId | null = null;
  public mvpPlayerId: string | null = null;
  public slowMoFactor = 1.0;

  public ball = {
    pos: { x: -9.6, y: 2.0, z: 1.8 },
    vel: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    radius: BALL_RADIUS,
    lastTouchTeam: null as TeamId | null,
    lastTouchPlayerId: null as string | null,
    lastHitType: null as HitType | null,
    touchesThisSide: 0,
    crossedNet: false,
    isServeInFlight: false,
    predictedLanding: null as { x: number; z: number } | null,
  };

  private playerInputs = new Map<string, PlayerInput>();
  private queuedActions = new Map<
    string,
    {
      action: HitType | null;
      charge: number;
      aimX: number;
      aimZ: number;
      jump: boolean;
      expiresAt: number;
    }
  >();

  constructor(
    private getSettings: () => RoomSettings,
    private getPlayers: () => PlayerState[],
    private callbacks: GameEngineCallbacks
  ) {}

  public queuePlayerInput(playerId: string, input: PlayerInput): void {
    this.playerInputs.set(playerId, input);
    if (input.action || input.jump) {
      const prev = this.queuedActions.get(playerId);
      const now = Date.now();
      this.queuedActions.set(playerId, {
        action: input.action || prev?.action || null,
        charge: Math.max(input.charge || 0.85, prev?.charge || 0.85),
        aimX: input.aimX,
        aimZ: input.aimZ,
        jump: Boolean(input.jump || prev?.jump),
        expiresAt: input.action ? now + 280 : prev?.expiresAt || now + 100,
      });
    }
  }

  public startMatch(): void {
    this.score = { teamA: 0, teamB: 0 };
    this.setsWon = { teamA: 0, teamB: 0 };
    this.currentSet = 1;
    this.servingTeam = 'A';
    this.winnerTeam = null;
    this.mvpPlayerId = null;
    this.lastPointReason = 'Match Starting!';
    this.lastScoringTeam = null;
    this.slowMoFactor = 1.0;

    // Reset player stats and assign clean slot indices per team
    const players = this.getPlayers();
    let idxA = 0;
    let idxB = 0;
    for (const p of players) {
      p.stats = { points: 0, aces: 0, spikes: 0, blocks: 0, touches: 0 };
      p.slotIndex = p.team === 'A' ? idxA++ : idxB++;
    }

    this.setupRallyPosition('A');
    this.phase = 'countdown';
    this.phaseTimer = 3.0;
    this.callbacks.onRoomStateChanged();
  }

  public pauseForDisconnect(seconds: number): void {
    if (this.phase === 'playing' || this.phase === 'serve_wait' || this.phase === 'countdown') {
      this.phase = 'paused_disconnect';
      this.phaseTimer = seconds;
      this.callbacks.onRoomStateChanged();
    }
  }

  public resumeFromDisconnect(): void {
    if (this.phase === 'paused_disconnect') {
      this.setupRallyPosition(this.servingTeam);
      this.phase = 'serve_wait';
      this.phaseTimer = 8.0;
      this.callbacks.onRoomStateChanged();
    }
  }

  private setupRallyPosition(servingTeam: TeamId): void {
    const settings = this.getSettings();
    const players = this.getPlayers();
    this.servingTeam = servingTeam;

    const servingTeamPlayers = players
      .filter((p) => p.team === servingTeam && p.connected)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    const server = servingTeamPlayers[0] || players.find((p) => p.team === servingTeam) || null;
    this.servingPlayerId = server ? server.id : null;

    for (const p of players) {
      const isServer = p.id === this.servingPlayerId;
      const spot = getCourtFormationPosition(p.team, settings.mode, p.slotIndex, isServer);
      p.pos = { x: spot.x, y: 0, z: spot.z };
      p.vel = { x: 0, y: 0, z: 0 };
      p.isGrounded = true;
      p.isDiving = false;
      p.diveTimer = 0;
      p.hitCooldown = 0;
      p.stamina = 100;
      p.facingAngle = p.team === 'A' ? 0 : Math.PI;
      p.animState = 'idle';
      p.animTimer = 0;
    }

    if (server) {
      const sign = servingTeam === 'A' ? 1 : -1;
      this.ball.pos = {
        x: server.pos.x + sign * 0.45,
        y: 1.45,
        z: server.pos.z,
      };
    } else {
      this.ball.pos = { x: 0, y: 3, z: 0 };
    }

    this.ball.vel = { x: 0, y: 0, z: 0 };
    this.ball.spin = { x: 0, y: 0, z: 0 };
    this.ball.lastTouchTeam = null;
    this.ball.lastTouchPlayerId = null;
    this.ball.lastHitType = null;
    this.ball.touchesThisSide = 0;
    this.ball.crossedNet = false;
    this.ball.isServeInFlight = false;
    this.ball.predictedLanding = null;
    this.slowMoFactor = 1.0;
  }

  /**
   * Rotates a team's court positions clockwise when they win the serve back (side-out).
   */
  private rotateTeamPositions(team: TeamId): void {
    const teamPlayers = this.getPlayers().filter((p) => p.team === team);
    const count = teamPlayers.length;
    if (count <= 1) return;
    for (const p of teamPlayers) {
      p.slotIndex = (p.slotIndex + count - 1) % count;
    }
  }

  public step(): void {
    this.serverTick++;
    const rawDt = SERVER_DT;
    const dt = rawDt * this.slowMoFactor;
    const settings = this.getSettings();
    const players = this.getPlayers();

    if (this.phase === 'lobby' || this.phase === 'match_over') {
      return;
    }

    if (this.phase === 'paused_disconnect') {
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0) {
        // Grace period expired: resume if at least 1 player per team, else end match
        const countA = players.filter((p) => p.team === 'A' && p.connected).length;
        const countB = players.filter((p) => p.team === 'B' && p.connected).length;
        if (countA > 0 && countB > 0) {
          this.resumeFromDisconnect();
        } else {
          this.endMatch(countA > 0 ? 'A' : 'B', 'Opponent forfeited due to disconnect');
        }
      }
      if (this.serverTick % 3 === 0) {
        this.broadcastSnapshot();
      }
      return;
    }

    if (this.phase === 'countdown') {
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0) {
        this.phase = 'serve_wait';
        this.phaseTimer = 9.0; // 9 seconds to serve
        this.callbacks.onEvent({
          type: 'serve',
          team: this.servingTeam,
          playerId: this.servingPlayerId || undefined,
          reason: 'Whistle! Ready to serve',
        });
      }
      if (this.serverTick % 3 === 0) {
        this.broadcastSnapshot();
      }
      return;
    }

    if (this.phase === 'point_scored') {
      this.phaseTimer -= rawDt;
      // Gently settle ball and animate celebrating/sad players
      this.stepBallIdle(dt);
      if (this.phaseTimer <= 0) {
        this.slowMoFactor = 1.0;
        this.setupRallyPosition(this.servingTeam);
        this.phase = 'serve_wait';
        this.phaseTimer = 9.0;
        this.callbacks.onEvent({
          type: 'serve',
          team: this.servingTeam,
          playerId: this.servingPlayerId || undefined,
        });
      }
      if (this.serverTick % 2 === 0) {
        this.broadcastSnapshot();
      }
      return;
    }

    // Active phases: 'serve_wait' or 'playing'
    if (this.phase === 'serve_wait') {
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0) {
        // Auto-serve if server timer runs out so the game never stalls
        const server = players.find((p) => p.id === this.servingPlayerId);
        if (server) {
          this.executePlayerHit(server, 'serve', 0.55, server.team === 'A' ? 1 : -1, 0);
        }
      }
    }

    // 1. Step all players (human inputs + AI bot inputs)
    for (const player of players) {
      if (!player.connected) continue;

      let input: PlayerInput;
      if (player.isBot) {
        input = computeBotInput(
          player,
          players,
          this.ball,
          this.phase,
          this.servingPlayerId,
          settings.mode,
          this.serverTick
        );
      } else {
        const latest = this.playerInputs.get(player.id);
        const queued = this.queuedActions.get(player.id);
        input = latest
          ? {
              ...latest,
              action: queued?.action || latest.action,
              charge: queued ? Math.max(queued.charge, latest.charge) : latest.charge,
              jump: Boolean(queued?.jump || latest.jump),
            }
          : {
              seq: player.lastProcessedInputSeq,
              moveX: 0,
              moveZ: 0,
              aimX: player.team === 'A' ? 1 : -1,
              aimZ: 0,
              jump: false,
              sprint: false,
              action: null,
              charge: 0,
              timestamp: Date.now(),
            };
        player.lastProcessedInputSeq = input.seq;
      }

      const isServer = this.phase === 'serve_wait' && player.id === this.servingPlayerId;
      stepPlayerPhysics(player, input, dt, this.phase === 'serve_wait', isServer);

      // Consume one-shot jump, but keep swing action alive during the 280ms swing window until it hits or expires
      const q = this.queuedActions.get(player.id);
      if (q) {
        q.jump = false;
        if (!q.action || Date.now() > q.expiresAt) {
          this.queuedActions.delete(player.id);
        }
      }

      // Check Net Touch Fault if enabled
      if (
        settings.netTouchFault &&
        this.phase === 'playing' &&
        !player.isGrounded &&
        Math.abs(player.pos.x) < PLAYER_RADIUS + 0.16 &&
        player.pos.y + 1.6 > NET_BOTTOM_HEIGHT
      ) {
        const oppTeam: TeamId = player.team === 'A' ? 'B' : 'A';
        this.awardPoint(oppTeam, `${player.name} touched the net!`, player.id);
        return;
      }

      // If in serve_wait and server moves, keep ball poised in front of server's hand
      if (isServer) {
        const sign = player.team === 'A' ? 1 : -1;
        this.ball.pos.x = player.pos.x + sign * 0.48;
        this.ball.pos.y = player.pos.y + 1.35;
        this.ball.pos.z = player.pos.z;

        if (input.action) {
          this.queuedActions.delete(player.id);
          this.executePlayerHit(player, 'serve', input.charge || 0.85, input.aimX, input.aimZ);
        }
      } else if (this.phase === 'playing' && input.action && player.hitCooldown <= 0) {
        // Trigger immediate visual swing animation when player clicks
        if (player.animTimer <= 0.1) {
          player.animState = !player.isGrounded ? 'spike' : input.action === 'set' ? 'set' : 'bump';
          player.animTimer = 0.28;
        }

        // Check if ball is within player's generous 3D reach volume
        const playerCenterY = player.pos.y + (player.isDiving ? 0.55 : 1.12);
        const horizDist = Math.hypot(this.ball.pos.x - player.pos.x, this.ball.pos.z - player.pos.z);
        const vertDist = Math.abs(this.ball.pos.y - playerCenterY);
        const dist3D = Math.hypot(horizDist, vertDist * 0.82);

        if (dist3D <= PLAYER_REACH_RADIUS) {
          this.queuedActions.delete(player.id);
          this.executePlayerHit(player, input.action, input.charge || 0.85, input.aimX, input.aimZ);
        }
      }
    }

    // 2. Also allow automatic reflex contact if a diving or jumping player's body directly intercepts the ball
    if (this.phase === 'playing') {
      for (const player of players) {
        if (!player.connected || player.hitCooldown > 0) continue;
        const playerCenterY = player.pos.y + (player.isDiving ? 0.5 : 1.05);
        const dist = Math.hypot(
          this.ball.pos.x - player.pos.x,
          this.ball.pos.y - playerCenterY,
          this.ball.pos.z - player.pos.z
        );
        if (dist <= BALL_RADIUS + 0.55 && (player.isDiving || !player.isGrounded)) {
          const defaultAction: HitType = !player.isGrounded && Math.abs(player.pos.x) < 2.2 ? 'spike' : 'bump';
          this.executePlayerHit(
            player,
            defaultAction,
            0.5,
            player.team === 'A' ? 1 : -1,
            clamp((this.ball.pos.z - player.pos.z) * 0.8, -1, 1)
          );
          break;
        }
      }
    }

    // 3. Step Ball Physics during active rally
    if (this.phase === 'playing') {
      this.stepBallActive(dt, settings);
    }

    // 4. Broadcast snapshot at ~25Hz (every 2–3 ticks at 60Hz)
    if (this.serverTick % 2 === 0) {
      this.broadcastSnapshot();
    }
  }

  private executePlayerHit(
    player: PlayerState,
    requestedAction: HitType,
    charge: number,
    aimX: number,
    aimZ: number
  ): void {
    const settings = this.getSettings();
    const isServe = this.phase === 'serve_wait';

    if (isServe) {
      this.phase = 'playing';
      this.ball.lastTouchTeam = player.team;
      this.ball.lastTouchPlayerId = player.id;
      this.ball.touchesThisSide = 1;
      this.ball.crossedNet = false;
      this.ball.isServeInFlight = true;
    } else {
      // Check Double Touch Fault
      const sameTeam = this.ball.lastTouchTeam === player.team;
      const teamMemberCount = this.getPlayers().filter((p) => p.team === player.team && p.connected).length;
      const allowSelfDouble = settings.allowDoubleTouchIn1v1 && teamMemberCount <= 1;

      if (sameTeam && this.ball.lastTouchPlayerId === player.id && !allowSelfDouble) {
        const oppTeam: TeamId = player.team === 'A' ? 'B' : 'A';
        this.awardPoint(oppTeam, `Double touch fault by ${player.name}!`, player.id);
        return;
      }

      if (sameTeam) {
        this.ball.touchesThisSide += 1;
      } else {
        this.ball.lastTouchTeam = player.team;
        this.ball.touchesThisSide = 1;
        this.ball.crossedNet = false;
      }

      this.ball.lastTouchPlayerId = player.id;
      this.ball.isServeInFlight = false;

      // Check 4-Touch Fault
      if (this.ball.touchesThisSide > 3) {
        const oppTeam: TeamId = player.team === 'A' ? 'B' : 'A';
        this.awardPoint(oppTeam, `4 touches fault by Team ${player.team}!`, player.id);
        return;
      }
    }

    const { vel, spin, actualHitType } = computeHitTrajectory(
      player,
      this.ball,
      isServe ? 'serve' : requestedAction,
      charge,
      aimX,
      aimZ,
      settings.netHeight,
      this.ball.touchesThisSide
    );

    this.ball.vel = vel;
    this.ball.spin = spin;
    this.ball.lastHitType = actualHitType;
    this.ball.predictedLanding = predictBallLanding(this.ball.pos, this.ball.vel);

    player.hitCooldown = PLAYER_HIT_COOLDOWN;
    player.animState = actualHitType === 'block' ? 'jump' : actualHitType;
    player.animTimer = 0.42;
    player.stats.touches += 1;

    // Trigger slow-motion dramatic highlight if a powerful spike is unleashed on Match Point!
    const isMatchPt = this.checkIsMatchPoint();
    if (actualHitType === 'spike' && isMatchPt && charge > 0.5) {
      this.slowMoFactor = 0.42;
      setTimeout(() => {
        if (this.phase === 'playing') this.slowMoFactor = 1.0;
      }, 650);
    }

    this.callbacks.onEvent({
      type: 'hit',
      team: player.team,
      playerId: player.id,
      playerName: player.name,
      hitType: actualHitType,
      position: { ...this.ball.pos },
      power: clamp(charge, 0.2, 1),
      isMatchPointHit: isMatchPt && actualHitType === 'spike',
    });
  }

  private stepBallActive(dt: number, settings: RoomSettings): void {
    const prevX = this.ball.pos.x;

    // Gravity + air drag + Magnus topspin curve
    this.ball.vel.y += GRAVITY * dt;
    // Topspin pulls the ball downward faster
    const topspinPull = -Math.abs(this.ball.spin.z) * 0.18;
    this.ball.vel.y += topspinPull * dt;

    const drag = Math.max(0, 1 - BALL_AIR_DRAG * dt);
    this.ball.vel.x *= drag;
    this.ball.vel.z *= drag;

    this.ball.pos.x += this.ball.vel.x * dt;
    this.ball.pos.y += this.ball.vel.y * dt;
    this.ball.pos.z += this.ball.vel.z * dt;

    // Check if the ball crossed the net plane (X = 0)
    if ((prevX < 0 && this.ball.pos.x >= 0) || (prevX > 0 && this.ball.pos.x <= 0)) {
      // Did it cross UNDER the net or outside the side antennas?
      if (this.ball.pos.y < NET_BOTTOM_HEIGHT) {
        const faultingTeam = this.ball.lastTouchTeam || 'A';
        const oppTeam: TeamId = faultingTeam === 'A' ? 'B' : 'A';
        this.awardPoint(oppTeam, `Ball went under the net!`);
        return;
      }
      if (Math.abs(this.ball.pos.z) > COURT_HALF_WIDTH + LINE_TOLERANCE) {
        const faultingTeam = this.ball.lastTouchTeam || 'A';
        const oppTeam: TeamId = faultingTeam === 'A' ? 'B' : 'A';
        this.awardPoint(oppTeam, `Ball crossed outside the net antennas!`);
        return;
      }

      this.ball.crossedNet = true;
      // Reset touch counter once it cleanly enters opponent airspace
      this.ball.touchesThisSide = 0;
    }

    // Net collision (X near 0, Y between NET_BOTTOM_HEIGHT and settings.netHeight + BALL_RADIUS)
    const netTop = settings.netHeight;
    if (
      Math.abs(this.ball.pos.x) < BALL_RADIUS + NET_THICKNESS * 0.5 &&
      this.ball.pos.y >= NET_BOTTOM_HEIGHT - BALL_RADIUS &&
      this.ball.pos.y <= netTop + BALL_RADIUS &&
      Math.abs(this.ball.pos.z) <= COURT_HALF_WIDTH + 0.4
    ) {
      if (this.ball.pos.y > netTop - 0.12) {
        // Hit the top tape of the net — pop up and lose horizontal speed
        this.ball.pos.y = netTop + BALL_RADIUS;
        this.ball.vel.y = Math.abs(this.ball.vel.y) * 0.45 + 2.2;
        this.ball.vel.x *= 0.55;
      } else {
        // Hit the mesh body of the net — dampen and bounce back slightly
        const sign = prevX < 0 ? -1 : 1;
        this.ball.pos.x = sign * (BALL_RADIUS + NET_THICKNESS * 0.5 + 0.02);
        this.ball.vel.x = -this.ball.vel.x * BALL_RESTITUTION_NET;
        this.ball.vel.y *= 0.7;
      }
      this.ball.predictedLanding = predictBallLanding(this.ball.pos, this.ball.vel);
      this.callbacks.onEvent({
        type: 'net_hit',
        position: { ...this.ball.pos },
        power: Math.hypot(this.ball.vel.x, this.ball.vel.y),
      });
    }

    // Ground contact (Sand at Y <= BALL_RADIUS)
    if (this.ball.pos.y <= BALL_RADIUS) {
      this.ball.pos.y = BALL_RADIUS;
      this.resolveBallGrounded();
      return;
    }

    // Refresh predicted landing periodically
    if (this.serverTick % 4 === 0) {
      this.ball.predictedLanding = predictBallLanding(this.ball.pos, this.ball.vel);
    }
  }

  private stepBallIdle(dt: number): void {
    this.ball.vel.y += GRAVITY * dt;
    this.ball.pos.x += this.ball.vel.x * dt;
    this.ball.pos.y += this.ball.vel.y * dt;
    this.ball.pos.z += this.ball.vel.z * dt;
    if (this.ball.pos.y <= BALL_RADIUS) {
      this.ball.pos.y = BALL_RADIUS;
      this.ball.vel.y = -this.ball.vel.y * BALL_RESTITUTION_SAND;
      this.ball.vel.x *= 0.75;
      this.ball.vel.z *= 0.75;
      if (Math.abs(this.ball.vel.y) < 0.5) this.ball.vel.y = 0;
    }
    this.ball.pos.x = clamp(this.ball.pos.x, -ARENA_BOUND_X, ARENA_BOUND_X);
    this.ball.pos.z = clamp(this.ball.pos.z, -ARENA_BOUND_Z, ARENA_BOUND_Z);
  }

  private resolveBallGrounded(): void {
    const bx = this.ball.pos.x;
    const bz = this.ball.pos.z;
    const landedSide: TeamId = bx < 0 ? 'A' : 'B';
    const isInsideBounds =
      Math.abs(bx) <= COURT_HALF_LENGTH + LINE_TOLERANCE &&
      Math.abs(bz) <= COURT_HALF_WIDTH + LINE_TOLERANCE;

    const lastTeam = this.ball.lastTouchTeam || this.servingTeam;
    const otherTeam: TeamId = lastTeam === 'A' ? 'B' : 'A';

    if (isInsideBounds) {
      // Ball landed IN bounds on `landedSide`
      const scoringTeam: TeamId = landedSide === 'A' ? 'B' : 'A';
      if (scoringTeam === lastTeam) {
        const hitLabel =
          this.ball.isServeInFlight
            ? 'Service Ace!'
            : this.ball.lastHitType === 'spike'
            ? 'Monster Spike!'
            : 'Ball landed in!';
        this.awardPoint(scoringTeam, hitLabel, this.ball.lastTouchPlayerId || undefined);
      } else {
        // Team failed to get the ball over the net and it landed on their own side
        this.awardPoint(scoringTeam, `Ball landed on Team ${landedSide}'s own court!`);
      }
    } else {
      // Ball landed OUT of bounds — fault on the last team to touch the ball
      this.awardPoint(otherTeam, `Out of bounds off Team ${lastTeam}!`);
    }
  }

  private awardPoint(scoringTeam: TeamId, reason: string, creditPlayerId?: string): void {
    const settings = this.getSettings();
    const players = this.getPlayers();

    if (scoringTeam === 'A') {
      this.score.teamA += 1;
    } else {
      this.score.teamB += 1;
    }

    // Credit individual player stats if they scored directly on an attack/serve
    if (creditPlayerId) {
      const p = players.find((pl) => pl.id === creditPlayerId);
      if (p && p.team === scoringTeam) {
        p.stats.points += 1;
        if (this.ball.isServeInFlight) p.stats.aces += 1;
        if (this.ball.lastHitType === 'spike') p.stats.spikes += 1;
      }
    }

    // Check side-out rotation: if receiving team won the point, they rotate clockwise and take serve
    if (scoringTeam !== this.servingTeam) {
      this.rotateTeamPositions(scoringTeam);
      this.servingTeam = scoringTeam;
    }

    this.lastPointReason = reason;
    this.lastScoringTeam = scoringTeam;

    // Set celebrate / sad animations on players
    for (const p of players) {
      p.animState = p.team === scoringTeam ? 'celebrate' : 'sad';
      p.animTimer = 2.4;
    }

    // Bounce ball gently
    this.ball.vel.y = Math.max(3.5, Math.abs(this.ball.vel.y) * 0.45);
    this.ball.vel.x *= 0.4;
    this.ball.vel.z *= 0.4;
    this.ball.predictedLanding = null;

    this.callbacks.onEvent({
      type: 'point',
      team: scoringTeam,
      playerId: creditPlayerId,
      reason,
      position: { ...this.ball.pos },
    });

    // Check if current Set is won (First to pointsToWin, win by 2)
    const sA = this.score.teamA;
    const sB = this.score.teamB;
    const target = settings.pointsToWin;

    if ((sA >= target || sB >= target) && Math.abs(sA - sB) >= 2) {
      const setWinner: TeamId = sA > sB ? 'A' : 'B';
      if (setWinner === 'A') this.setsWon.teamA += 1;
      else this.setsWon.teamB += 1;

      const setsNeeded = Math.ceil(settings.bestOfSets / 2);
      if (this.setsWon.teamA >= setsNeeded || this.setsWon.teamB >= setsNeeded) {
        this.endMatch(setWinner, `Team ${setWinner} wins the match! (${reason})`);
        return;
      } else {
        // Advance to next set
        this.currentSet += 1;
        this.score = { teamA: 0, teamB: 0 };
        this.lastPointReason = `Team ${setWinner} wins Set ${this.currentSet - 1}! Starting Set ${this.currentSet}`;
        this.callbacks.onEvent({
          type: 'set_won',
          team: setWinner,
          reason: this.lastPointReason,
        });
      }
    }

    this.phase = 'point_scored';
    this.phaseTimer = 2.6;
    this.callbacks.onRoomStateChanged();
    this.broadcastSnapshot();
  }

  private endMatch(winner: TeamId, reason: string): void {
    this.phase = 'match_over';
    this.winnerTeam = winner;
    this.lastPointReason = reason;
    this.slowMoFactor = 1.0;

    // Compute MVP (highest points*3 + spikes*2 + aces*2 + touches)
    const players = this.getPlayers();
    let bestScore = -1;
    let mvpId: string | null = null;
    for (const p of players) {
      const score =
        p.stats.points * 3 +
        p.stats.spikes * 2 +
        p.stats.aces * 2 +
        p.stats.touches * 0.5 +
        (p.team === winner ? 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        mvpId = p.id;
      }
    }
    this.mvpPlayerId = mvpId;

    this.callbacks.onEvent({
      type: 'match_end',
      team: winner,
      playerId: mvpId || undefined,
      reason,
    });
    this.callbacks.onRoomStateChanged();
    this.broadcastSnapshot();
  }

  private checkIsMatchPoint(): boolean {
    const settings = this.getSettings();
    const target = settings.pointsToWin;
    const sA = this.score.teamA;
    const sB = this.score.teamB;
    return (sA >= target - 1 && sA - sB >= 1) || (sB >= target - 1 && sB - sA >= 1);
  }

  public broadcastSnapshot(): void {
    const players = this.getPlayers();
    const snapshot: GameSnapshot = {
      serverTick: this.serverTick,
      timestamp: Date.now(),
      phase: this.phase,
      phaseTimer: Number(this.phaseTimer.toFixed(2)),
      score: { ...this.score },
      setsWon: { ...this.setsWon },
      currentSet: this.currentSet,
      servingTeam: this.servingTeam,
      servingPlayerId: this.servingPlayerId,
      touchesTeamA: this.ball.lastTouchTeam === 'A' ? this.ball.touchesThisSide : 0,
      touchesTeamB: this.ball.lastTouchTeam === 'B' ? this.ball.touchesThisSide : 0,
      lastPointReason: this.lastPointReason,
      lastScoringTeam: this.lastScoringTeam,
      isMatchPoint: this.checkIsMatchPoint(),
      slowMoFactor: this.slowMoFactor,
      ball: {
        pos: { ...this.ball.pos },
        vel: { ...this.ball.vel },
        spin: { ...this.ball.spin },
        radius: this.ball.radius,
        lastTouchTeam: this.ball.lastTouchTeam,
        lastTouchPlayerId: this.ball.lastTouchPlayerId,
        lastHitType: this.ball.lastHitType,
        touchesThisSide: this.ball.touchesThisSide,
        crossedNet: this.ball.crossedNet,
        isServeInFlight: this.ball.isServeInFlight,
        predictedLanding: this.ball.predictedLanding ? { ...this.ball.predictedLanding } : null,
      },
      players: players.map((p) => ({ ...p, pos: { ...p.pos }, vel: { ...p.vel }, stats: { ...p.stats } })),
    };

    this.callbacks.onSnapshot(snapshot);
  }
}
