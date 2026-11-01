export type TeamId = 'A' | 'B';
export type GameMode = '1v1' | '2v2' | '3v3';
export type HitType = 'bump' | 'set' | 'spike' | 'serve' | 'block';

export type MatchPhase =
  | 'lobby'
  | 'countdown'
  | 'serve_wait'
  | 'playing'
  | 'point_scored'
  | 'paused_disconnect'
  | 'match_over';

export type PlayerAnimState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'bump'
  | 'set'
  | 'spike'
  | 'dive'
  | 'serve'
  | 'celebrate'
  | 'sad';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInput {
  seq: number;
  moveX: number; // -1 to 1 (world X axis: toward/away from net)
  moveZ: number; // -1 to 1 (world Z axis: sideline to sideline)
  aimX: number;  // normalized aim direction X
  aimZ: number;  // normalized aim direction Z
  jump: boolean;
  sprint: boolean;
  action: HitType | null;
  charge: number; // 0 to 1 for charged serve/spike
  timestamp: number;
}

export interface PlayerStats {
  points: number;
  aces: number;
  spikes: number;
  blocks: number;
  touches: number;
}

export interface PlayerState {
  id: string;        // socket id or bot id
  guestId: string;   // persistent guest ID for 30s reconnect
  name: string;
  team: TeamId;
  slotIndex: number; // 0, 1, or 2 (determines rotation order)
  outfitColor: string;
  visorColor: string;
  jerseyNumber: number;
  isBot: boolean;
  isReady: boolean;
  isHost: boolean;
  connected: boolean;
  disconnectedAt?: number;
  ping: number;

  // Physics & Transform
  pos: Vec3;
  vel: Vec3;
  facingAngle: number; // radians in XZ plane
  isGrounded: boolean;
  stamina: number;     // 0 to 100
  isDiving: boolean;
  diveTimer: number;
  hitCooldown: number;
  animState: PlayerAnimState;
  animTimer: number;
  lastProcessedInputSeq: number;
  activeEmote?: {
    text: string;
    expiresAt: number;
  };
  stats: PlayerStats;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
  radius: number;
  lastTouchTeam: TeamId | null;
  lastTouchPlayerId: string | null;
  lastHitType: HitType | null;
  touchesThisSide: number;
  crossedNet: boolean;
  isServeInFlight: boolean;
  predictedLanding: { x: number; z: number } | null;
}

export interface RoomSettings {
  mode: GameMode;
  pointsToWin: 11 | 15 | 25;
  bestOfSets: 1 | 3;
  netHeight: number; // 2.43m default (configurable 2.0m / 2.24m / 2.43m)
  netTouchFault: boolean;
  allowDoubleTouchIn1v1: boolean;
  isPublic: boolean;
  maxPlayers: number;
}

export interface SetScore {
  teamA: number;
  teamB: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team?: TeamId;
  text: string;
  isEmote?: boolean;
  isSystem?: boolean;
  timestamp: number;
}

export interface GameSnapshot {
  serverTick: number;
  timestamp: number;
  phase: MatchPhase;
  phaseTimer: number;
  score: SetScore;
  setsWon: SetScore;
  currentSet: number;
  servingTeam: TeamId;
  servingPlayerId: string | null;
  touchesTeamA: number;
  touchesTeamB: number;
  lastPointReason: string | null;
  lastScoringTeam: TeamId | null;
  isMatchPoint: boolean;
  slowMoFactor: number;
  ball: BallState;
  players: PlayerState[];
}

export interface RoomState {
  code: string;
  hostGuestId: string;
  settings: RoomSettings;
  phase: MatchPhase;
  players: PlayerState[];
  chat: ChatMessage[];
  score: SetScore;
  setsWon: SetScore;
  currentSet: number;
  servingTeam: TeamId;
  servingPlayerId: string | null;
  winnerTeam: TeamId | null;
  mvpPlayerId: string | null;
  disconnectPauseRemainingMs: number;
}

export interface GameEventPayload {
  type: 'hit' | 'point' | 'fault' | 'serve' | 'set_won' | 'match_end' | 'net_hit' | 'emote';
  team?: TeamId;
  playerId?: string;
  playerName?: string;
  hitType?: HitType;
  reason?: string;
  position?: Vec3;
  power?: number;
  isMatchPointHit?: boolean;
}
