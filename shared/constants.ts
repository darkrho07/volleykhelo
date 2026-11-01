import { GameMode, RoomSettings, TeamId, Vec3 } from './types';

// Standard 18m x 9m court (X = -9 to +9, Z = -4.5 to +4.5, Net at X = 0)
export const COURT_LENGTH = 18.0;
export const COURT_HALF_LENGTH = 9.0;
export const COURT_WIDTH = 9.0;
export const COURT_HALF_WIDTH = 4.5;
export const LINE_TOLERANCE = 0.22; // Ball touching the boundary line is IN

// Free zone outer bounds (sand perimeter)
export const ARENA_BOUND_X = 14.5;
export const ARENA_BOUND_Z = 8.5;

// Net heights (Men's standard 2.43m, Women's 2.24m, Arcade 2.10m)
export const NET_HEIGHT_MENS = 2.43;
export const NET_HEIGHT_WOMENS = 2.24;
export const NET_HEIGHT_ARCADE = 2.10;
export const NET_BOTTOM_HEIGHT = 1.0;
export const NET_THICKNESS = 0.14;

// Physics simulation rates
export const SERVER_TICK_RATE = 60;
export const SERVER_DT = 1 / SERVER_TICK_RATE;
export const SNAPSHOT_RATE = 25; // Broadcast 25 snapshots/sec

// Ball physics constants
export const BALL_RADIUS = 0.28;
export const GRAVITY = -18.8; // Crisp arcade beach volleyball feel
export const BALL_AIR_DRAG = 0.08;
export const BALL_RESTITUTION_SAND = 0.42;
export const BALL_RESTITUTION_NET = 0.38;
export const BALL_MAX_SPEED = 24.0;

// Player physics constants
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.85;
export const PLAYER_MOVE_SPEED = 7.4;
export const PLAYER_SPRINT_MULT = 1.42;
export const PLAYER_DIVE_SPEED = 11.8;
export const PLAYER_DIVE_DURATION = 0.36;
export const PLAYER_JUMP_VELOCITY = 9.4;
export const PLAYER_REACH_RADIUS = 1.78;
export const PLAYER_HIT_COOLDOWN = 0.26;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_SEC = 34;
export const STAMINA_DIVE_COST = 28;
export const STAMINA_REGEN_PER_SEC = 20;

// Disconnect grace period (30 seconds)
export const DISCONNECT_GRACE_MS = 30_000;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  mode: '2v2',
  pointsToWin: 15,
  bestOfSets: 3,
  netHeight: NET_HEIGHT_MENS,
  netTouchFault: true,
  allowDoubleTouchIn1v1: true,
  isPublic: true,
  maxPlayers: 4,
};

export const OUTFIT_PALETTES = [
  { name: 'Solar Flare', outfit: '#f97316', visor: '#fef08a' },
  { name: 'Ocean Surge', outfit: '#06b6d4', visor: '#cffafe' },
  { name: 'Tropical Lime', outfit: '#84cc16', visor: '#ecfccb' },
  { name: 'Coral Reef', outfit: '#f43f5e', visor: '#ffe4e6' },
  { name: 'Sunset Gold', outfit: '#eab308', visor: '#fef9c3' },
  { name: 'Electric Violet', outfit: '#8b5cf6', visor: '#ede9fe' },
];

export const QUICK_EMOTES = [
  'Nice shot!',
  'Sorry!',
  'GG!',
  'Mine!',
  "Let's go!",
  'What a save!',
];

export const GAME_TIPS = [
  'Hold Left Click while jumping near the net to unleash a charged topspin Spike!',
  'Press E to loft a high, soft Set right near the net for your teammate to smash.',
  'Use Shift + Direction to Dive across the sand and save balls before they hit the court!',
  'Each team gets up to 3 touches — Bump, Set, Spike is the golden combo!',
  'When your team wins the serve back (Side-Out), players rotate clockwise on the court.',
];

/**
 * Returns rotational court positions for a given team, mode, and slot index.
 * Slot 0 is always the active Server position (Back Right).
 */
export function getCourtFormationPosition(
  team: TeamId,
  mode: GameMode,
  slotIndex: number,
  isServingNow: boolean
): Vec3 {
  const sign = team === 'A' ? -1 : 1; // Team A is X < 0, Team B is X > 0
  // For Team A (facing +X): Right side of their court is +Z, Left side is -Z
  // For Team B (facing -X): Right side of their court is -Z, Left side is +Z
  const rightZ = team === 'A' ? 1 : -1;

  if (isServingNow && slotIndex === 0) {
    // Serving player stands behind the back boundary line (|X| = 9.6m)
    return {
      x: sign * 9.6,
      y: 0,
      z: rightZ * 1.8,
    };
  }

  if (mode === '1v1') {
    return {
      x: sign * 4.8,
      y: 0,
      z: 0,
    };
  }

  if (mode === '2v2') {
    // Slot 0: Back-Right / Defender, Slot 1: Front-Left / Blocker-Setter
    if (slotIndex % 2 === 0) {
      return { x: sign * 6.0, y: 0, z: rightZ * 1.9 };
    } else {
      return { x: sign * 2.8, y: 0, z: -rightZ * 1.9 };
    }
  }

  // 3v3 Triangle formation:
  // Slot 0: Back-Right (Server/Defense), Slot 1: Front-Center (Setter), Slot 2: Front-Left (Spiker)
  const mod = slotIndex % 3;
  if (mod === 0) {
    return { x: sign * 6.4, y: 0, z: rightZ * 2.1 };
  } else if (mod === 1) {
    return { x: sign * 2.3, y: 0, z: 0 };
  } else {
    return { x: sign * 4.6, y: 0, z: -rightZ * 2.2 };
  }
}
