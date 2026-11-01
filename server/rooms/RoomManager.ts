import { Server, Socket } from 'socket.io';
import {
  ChatMessage,
  DEFAULT_ROOM_SETTINGS,
  DISCONNECT_GRACE_MS,
  GameEventPayload,
  GameSnapshot,
  getCourtFormationPosition,
  OUTFIT_PALETTES,
  PlayerInput,
  PlayerState,
  RoomSettings,
  RoomState,
  SERVER_TICK_RATE,
  TeamId,
} from '../../shared';
import { GameEngine } from '../game/GameEngine';

interface ManagedRoom {
  code: string;
  hostGuestId: string;
  settings: RoomSettings;
  players: PlayerState[];
  chat: ChatMessage[];
  engine: GameEngine;
  tickInterval: ReturnType<typeof setInterval>;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  lastInputTimestamps: Map<string, number>;
}

const BOT_NAMES = [
  'Kiran (Bot)',
  'Aarav (Bot)',
  'Riya (Bot)',
  'Dev (Bot)',
  'Meera (Bot)',
  'Vikram (Bot)',
];

export class RoomManager {
  private rooms = new Map<string, ManagedRoom>();
  private socketToRoom = new Map<string, string>();
  private socketToGuest = new Map<string, string>();

  constructor(private io: Server) {}

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private createManagedRoom(hostGuestId: string, partialSettings?: Partial<RoomSettings>): ManagedRoom {
    const code = this.generateRoomCode();
    const mode = partialSettings?.mode || DEFAULT_ROOM_SETTINGS.mode;
    const maxPlayers = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 6;

    const settings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      ...partialSettings,
      mode,
      maxPlayers,
    };

    const roomObj: Partial<ManagedRoom> = {
      code,
      hostGuestId,
      settings,
      players: [],
      chat: [],
      disconnectTimers: new Map(),
      lastInputTimestamps: new Map(),
    };

    const engine = new GameEngine(
      () => roomObj.settings!,
      () => roomObj.players!,
      {
        onSnapshot: (snapshot: GameSnapshot) => {
          this.io.to(code).emit('game:snapshot', snapshot);
        },
        onEvent: (event: GameEventPayload) => {
          this.io.to(code).emit('game:event', event);
        },
        onRoomStateChanged: () => {
          this.broadcastRoomState(code);
        },
      }
    );

    roomObj.engine = engine;
    roomObj.tickInterval = setInterval(() => {
      engine.step();
    }, 1000 / SERVER_TICK_RATE);

    const fullRoom = roomObj as ManagedRoom;
    this.rooms.set(code, fullRoom);
    return fullRoom;
  }

  public getPublicRoomsSummary() {
    const list: Array<{
      code: string;
      mode: string;
      playerCount: number;
      maxPlayers: number;
      phase: string;
      pointsToWin: number;
    }> = [];
    for (const room of this.rooms.values()) {
      if (room.settings.isPublic) {
        const humanCount = room.players.filter((p) => !p.isBot && p.connected).length;
        if (humanCount > 0) {
          list.push({
            code: room.code,
            mode: room.settings.mode,
            playerCount: room.players.filter((p) => p.connected).length,
            maxPlayers: room.settings.maxPlayers,
            phase: room.engine.phase,
            pointsToWin: room.settings.pointsToWin,
          });
        }
      }
    }
    return list;
  }

  public registerSocket(socket: Socket): void {
    socket.on('ping:check', (clientTime: number, ack?: (serverTime: number) => void) => {
      if (typeof ack === 'function') ack(Date.now());
      const roomCode = this.socketToRoom.get(socket.id);
      if (roomCode) {
        const room = this.rooms.get(roomCode);
        const p = room?.players.find((pl) => pl.id === socket.id);
        if (p && typeof clientTime === 'number') {
          p.ping = Math.max(1, Math.min(999, Date.now() - clientTime));
        }
      }
    });

    socket.on('rooms:list', (ack?: (rooms: ReturnType<RoomManager['getPublicRoomsSummary']>) => void) => {
      if (typeof ack === 'function') ack(this.getPublicRoomsSummary());
    });

    socket.on(
      'room:create',
      (payload: {
        guestId: string;
        name: string;
        outfitColor: string;
        visorColor?: string;
        settings?: Partial<RoomSettings>;
        withBots?: boolean;
        autoStart?: boolean;
      }) => {
        this.leaveCurrentRoom(socket);
        const room = this.createManagedRoom(payload.guestId, payload.settings);
        this.addOrReconnectPlayer(socket, room, payload);

        if (payload.withBots) {
          this.fillRoomWithBots(room);
        }

        this.broadcastRoomState(room.code);

        if (payload.autoStart) {
          for (const p of room.players) p.isReady = true;
          room.engine.startMatch();
        }
      }
    );

    socket.on(
      'room:join',
      (payload: {
        code: string;
        guestId: string;
        name: string;
        outfitColor: string;
        visorColor?: string;
      }) => {
        const normalizedCode = (payload.code || '').trim().toUpperCase();
        const room = this.rooms.get(normalizedCode);
        if (!room) {
          socket.emit('error', { message: `Room "${normalizedCode}" not found.` });
          return;
        }

        // Check if this player is reconnecting via guestId
        const existingPlayer = room.players.find((p) => p.guestId === payload.guestId);
        const humanCount = room.players.filter((p) => !p.isBot && p.connected).length;

        if (!existingPlayer && humanCount >= room.settings.maxPlayers) {
          // If there is a bot, replace the bot with the joining human!
          const botIndex = room.players.findIndex((p) => p.isBot);
          if (botIndex !== -1) {
            room.players.splice(botIndex, 1);
          } else {
            socket.emit('error', { message: `Room ${normalizedCode} is full (${room.settings.maxPlayers}/${room.settings.maxPlayers}).` });
            return;
          }
        }

        this.leaveCurrentRoom(socket);
        this.addOrReconnectPlayer(socket, room, payload);
        this.broadcastRoomState(room.code);
      }
    );

    socket.on(
      'room:quick_match',
      (payload: {
        guestId: string;
        name: string;
        outfitColor: string;
        visorColor?: string;
        preferredMode?: '1v1' | '2v2' | '3v3';
      }) => {
        this.leaveCurrentRoom(socket);

        // Find an open public room in lobby phase (or with a replaceable bot)
        let targetRoom: ManagedRoom | undefined;
        for (const room of this.rooms.values()) {
          const humans = room.players.filter((p) => !p.isBot && p.connected).length;
          if (
            room.settings.isPublic &&
            room.engine.phase === 'lobby' &&
            humans < room.settings.maxPlayers
          ) {
            targetRoom = room;
            break;
          }
        }

        if (!targetRoom) {
          targetRoom = this.createManagedRoom(payload.guestId, {
            mode: payload.preferredMode || '2v2',
            isPublic: true,
          });
          this.addOrReconnectPlayer(socket, targetRoom, payload);
          // Add bots so Quick Match is immediately playable even if no second tab is open yet
          this.fillRoomWithBots(targetRoom);
        } else {
          const botIdx = targetRoom.players.findIndex((p) => p.isBot);
          if (targetRoom.players.length >= targetRoom.settings.maxPlayers && botIdx !== -1) {
            targetRoom.players.splice(botIdx, 1);
          }
          this.addOrReconnectPlayer(socket, targetRoom, payload);
        }

        this.broadcastRoomState(targetRoom.code);
      }
    );

    socket.on('room:leave', () => {
      this.leaveCurrentRoom(socket, true);
    });

    socket.on('room:settings', (partial: Partial<RoomSettings>) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isHost || room.engine.phase !== 'lobby') return;

      const mode = partial.mode || room.settings.mode;
      const maxPlayers = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 6;
      room.settings = {
        ...room.settings,
        ...partial,
        mode,
        maxPlayers,
      };

      // Trim excess bots if mode shrunk
      while (room.players.length > maxPlayers) {
        const botIdx = room.players.findIndex((p) => p.isBot);
        if (botIdx !== -1) room.players.splice(botIdx, 1);
        else break;
      }

      this.rebalanceSlots(room);
      this.broadcastRoomState(room.code);
    });

    socket.on('team:select', (payload: { team: TeamId }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || room.engine.phase !== 'lobby') return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      const maxPerTeam = room.settings.maxPlayers / 2;
      const teamMembers = room.players.filter((p) => p.team === payload.team);
      if (teamMembers.length >= maxPerTeam) {
        // Swap with a bot on the target team if one exists
        const botOnTarget = teamMembers.find((p) => p.isBot);
        if (botOnTarget) {
          botOnTarget.team = player.team;
        } else {
          socket.emit('error', { message: `Team ${payload.team} is already full!` });
          return;
        }
      }

      player.team = payload.team;
      this.rebalanceSlots(room);
      this.broadcastRoomState(room.code);
    });

    socket.on('bot:add', (payload?: { team?: TeamId }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || room.engine.phase !== 'lobby') return;
      if (room.players.length >= room.settings.maxPlayers) {
        socket.emit('error', { message: 'Room is at max player capacity.' });
        return;
      }
      this.addSingleBot(room, payload?.team);
      this.broadcastRoomState(room.code);
    });

    socket.on('bot:remove', (payload: { botId: string }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || room.engine.phase !== 'lobby') return;
      const idx = room.players.findIndex((p) => p.id === payload.botId && p.isBot);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        this.rebalanceSlots(room);
        this.broadcastRoomState(room.code);
      }
    });

    socket.on('player:ready', (payload?: { ready?: boolean }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || room.engine.phase !== 'lobby') return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      player.isReady = payload?.ready !== undefined ? payload.ready : !player.isReady;
      this.broadcastRoomState(room.code);
    });

    socket.on('match:start', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || room.engine.phase !== 'lobby') return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isHost) return;

      const teamACount = room.players.filter((p) => p.team === 'A' && p.connected).length;
      const teamBCount = room.players.filter((p) => p.team === 'B' && p.connected).length;

      if (teamACount < 1 || teamBCount < 1) {
        socket.emit('error', { message: 'Each team needs at least 1 player (or Bot) to start!' });
        return;
      }

      const allReady = room.players.filter((p) => !p.isBot && p.connected).every((p) => p.isReady || p.isHost);
      if (!allReady) {
        socket.emit('error', { message: 'Waiting for all players in the lobby to Ready Up!' });
        return;
      }

      room.engine.startMatch();
    });

    socket.on('match:rematch', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      for (const p of room.players) {
        p.isReady = true;
      }
      room.engine.startMatch();
    });

    socket.on('match:lobby', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      room.engine.phase = 'lobby';
      this.rebalanceSlots(room);
      this.broadcastRoomState(room.code);
    });

    socket.on('input:update', (input: PlayerInput) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || !input) return;

      // Basic anti-cheat input rate guard (ignore > 140 packets/sec burst)
      const now = Date.now();
      const lastTime = room.lastInputTimestamps.get(socket.id) || 0;
      if (now - lastTime < 4 && !input.action && !input.jump) {
        return;
      }
      room.lastInputTimestamps.set(socket.id, now);

      room.engine.queuePlayerInput(socket.id, input);
    });

    socket.on('chat:send', (payload: { text: string; isEmote?: boolean }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room || !payload?.text) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      const cleanText = payload.text.trim().slice(0, 140);
      if (!cleanText) return;

      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: player.id,
        senderName: player.name,
        team: player.team,
        text: cleanText,
        isEmote: Boolean(payload.isEmote),
        timestamp: Date.now(),
      };

      room.chat.push(msg);
      if (room.chat.length > 50) room.chat.shift();

      if (payload.isEmote) {
        player.activeEmote = {
          text: cleanText,
          expiresAt: Date.now() + 3200,
        };
        this.io.to(room.code).emit('game:event', {
          type: 'emote',
          playerId: player.id,
          playerName: player.name,
          team: player.team,
          reason: cleanText,
        } satisfies GameEventPayload);
      }

      this.broadcastRoomState(room.code);
    });

    socket.on('disconnect', () => {
      this.handleSocketDisconnect(socket);
    });
  }

  private addOrReconnectPlayer(
    socket: Socket,
    room: ManagedRoom,
    payload: { guestId: string; name: string; outfitColor: string; visorColor?: string }
  ): void {
    const guestId = payload.guestId || `guest-${socket.id}`;
    this.socketToRoom.set(socket.id, room.code);
    this.socketToGuest.set(socket.id, guestId);
    socket.join(room.code);

    // Check if player exists (reconnecting within 30s grace period)
    const existing = room.players.find((p) => p.guestId === guestId && !p.isBot);
    if (existing) {
      const timer = room.disconnectTimers.get(guestId);
      if (timer) {
        clearTimeout(timer);
        room.disconnectTimers.delete(guestId);
      }
      if (room.engine.servingPlayerId === existing.id) {
        room.engine.servingPlayerId = socket.id;
      }
      existing.id = socket.id;
      existing.name = (payload.name || existing.name).slice(0, 18);
      existing.outfitColor = payload.outfitColor || existing.outfitColor;
      existing.connected = true;
      existing.disconnectedAt = undefined;

      this.addSystemChat(room, `${existing.name} reconnected to the match!`);
      if (room.engine.phase === 'paused_disconnect') {
        const anyStillDisconnected = room.players.some((p) => !p.isBot && !p.connected);
        if (!anyStillDisconnected) {
          room.engine.resumeFromDisconnect();
        }
      }
      return;
    }

    // Balance team assignment
    const countA = room.players.filter((p) => p.team === 'A').length;
    const countB = room.players.filter((p) => p.team === 'B').length;
    const assignedTeam: TeamId = countA <= countB ? 'A' : 'B';
    const slotIndex = room.players.filter((p) => p.team === assignedTeam).length;
    const spot = getCourtFormationPosition(assignedTeam, room.settings.mode, slotIndex, false);

    const newPlayer: PlayerState = {
      id: socket.id,
      guestId,
      name: (payload.name || 'Player').trim().slice(0, 18) || 'Player',
      team: assignedTeam,
      slotIndex,
      outfitColor: payload.outfitColor || OUTFIT_PALETTES[0].outfit,
      visorColor: payload.visorColor || '#fef08a',
      jerseyNumber: Math.floor(1 + Math.random() * 98),
      isBot: false,
      isReady: room.hostGuestId === guestId,
      isHost: room.hostGuestId === guestId,
      connected: true,
      ping: 18,
      pos: { ...spot },
      vel: { x: 0, y: 0, z: 0 },
      facingAngle: assignedTeam === 'A' ? 0 : Math.PI,
      isGrounded: true,
      stamina: 100,
      isDiving: false,
      diveTimer: 0,
      hitCooldown: 0,
      animState: 'idle',
      animTimer: 0,
      lastProcessedInputSeq: 0,
      stats: { points: 0, aces: 0, spikes: 0, blocks: 0, touches: 0 },
    };

    room.players.push(newPlayer);
    this.rebalanceSlots(room);
    this.addSystemChat(room, `${newPlayer.name} joined Team ${assignedTeam}.`);
  }

  private addSingleBot(room: ManagedRoom, preferredTeam?: TeamId): void {
    const countA = room.players.filter((p) => p.team === 'A').length;
    const countB = room.players.filter((p) => p.team === 'B').length;
    const team: TeamId = preferredTeam || (countA <= countB ? 'A' : 'B');
    const botIndex = room.players.filter((p) => p.isBot).length;
    const palette = OUTFIT_PALETTES[(botIndex + 1) % OUTFIT_PALETTES.length];
    const slotIndex = room.players.filter((p) => p.team === team).length;
    const spot = getCourtFormationPosition(team, room.settings.mode, slotIndex, false);
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    room.players.push({
      id: botId,
      guestId: botId,
      name: BOT_NAMES[botIndex % BOT_NAMES.length],
      team,
      slotIndex,
      outfitColor: palette.outfit,
      visorColor: palette.visor,
      jerseyNumber: (botIndex + 1) * 7,
      isBot: true,
      isReady: true,
      isHost: false,
      connected: true,
      ping: 0,
      pos: { ...spot },
      vel: { x: 0, y: 0, z: 0 },
      facingAngle: team === 'A' ? 0 : Math.PI,
      isGrounded: true,
      stamina: 100,
      isDiving: false,
      diveTimer: 0,
      hitCooldown: 0,
      animState: 'idle',
      animTimer: 0,
      lastProcessedInputSeq: 0,
      stats: { points: 0, aces: 0, spikes: 0, blocks: 0, touches: 0 },
    });
    this.rebalanceSlots(room);
  }

  private fillRoomWithBots(room: ManagedRoom): void {
    while (room.players.length < room.settings.maxPlayers) {
      this.addSingleBot(room);
    }
  }

  private rebalanceSlots(room: ManagedRoom): void {
    let idxA = 0;
    let idxB = 0;
    for (const p of room.players) {
      p.slotIndex = p.team === 'A' ? idxA++ : idxB++;
      if (room.engine.phase === 'lobby') {
        const spot = getCourtFormationPosition(p.team, room.settings.mode, p.slotIndex, false);
        p.pos = { ...spot };
      }
    }
  }

  private handleSocketDisconnect(socket: Socket): void {
    const roomCode = this.socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    this.socketToRoom.delete(socket.id);
    this.socketToGuest.delete(socket.id);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    // If in lobby, remove immediately and migrate host if needed
    if (room.engine.phase === 'lobby' || room.engine.phase === 'match_over') {
      this.removePlayerFromRoom(room, player.guestId);
      return;
    }

    // Active match: mark disconnected and grant a 30-second grace period!
    player.connected = false;
    player.disconnectedAt = Date.now();
    this.addSystemChat(room, `${player.name} disconnected. Waiting 30s to reconnect...`);

    // Migrate host if host disconnected
    if (player.isHost) {
      this.migrateHost(room);
    }

    room.engine.pauseForDisconnect(DISCONNECT_GRACE_MS / 1000);
    this.io.to(room.code).emit('player:disconnected', {
      playerId: player.id,
      playerName: player.name,
      gracePeriodSeconds: 30,
    });
    this.broadcastRoomState(room.code);

    const timer = setTimeout(() => {
      room.disconnectTimers.delete(player.guestId);
      if (!player.connected) {
        this.removePlayerFromRoom(room, player.guestId);
      }
    }, DISCONNECT_GRACE_MS);

    room.disconnectTimers.set(player.guestId, timer);
  }

  private leaveCurrentRoom(socket: Socket, explicitLeave = false): void {
    const roomCode = this.socketToRoom.get(socket.id);
    if (!roomCode) return;
    socket.leave(roomCode);
    this.socketToRoom.delete(socket.id);
    const guestId = this.socketToGuest.get(socket.id);
    this.socketToGuest.delete(socket.id);

    const room = this.rooms.get(roomCode);
    if (!room || !guestId) return;

    if (explicitLeave) {
      this.removePlayerFromRoom(room, guestId);
    }
  }

  private removePlayerFromRoom(room: ManagedRoom, guestId: string): void {
    const idx = room.players.findIndex((p) => p.guestId === guestId);
    if (idx === -1) return;
    const [removed] = room.players.splice(idx, 1);
    const timer = room.disconnectTimers.get(guestId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(guestId);
    }

    this.addSystemChat(room, `${removed.name} left the room.`);

    // Check if any connected human players remain
    const remainingHumans = room.players.filter((p) => !p.isBot && p.connected);
    if (remainingHumans.length === 0) {
      clearInterval(room.tickInterval);
      for (const t of room.disconnectTimers.values()) clearTimeout(t);
      this.rooms.delete(room.code);
      return;
    }

    if (removed.isHost) {
      this.migrateHost(room);
    }

    // If match was paused waiting for this player, replace them with a Bot so remaining humans can finish the match!
    if (room.engine.phase === 'paused_disconnect') {
      this.addSingleBot(room, removed.team);
      this.addSystemChat(room, `A Bot stepped in for Team ${removed.team}. Match resuming!`);
      room.engine.resumeFromDisconnect();
    }

    this.rebalanceSlots(room);
    this.broadcastRoomState(room.code);
  }

  private migrateHost(room: ManagedRoom): void {
    for (const p of room.players) p.isHost = false;
    const nextHost = room.players.find((p) => !p.isBot && p.connected);
    if (nextHost) {
      nextHost.isHost = true;
      nextHost.isReady = true;
      room.hostGuestId = nextHost.guestId;
      this.addSystemChat(room, `${nextHost.name} is now the room host.`);
    }
  }

  private addSystemChat(room: ManagedRoom, text: string): void {
    room.chat.push({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'system',
      senderName: 'Referee',
      text,
      isSystem: true,
      timestamp: Date.now(),
    });
    if (room.chat.length > 50) room.chat.shift();
  }

  private getRoomBySocket(socketId: string): ManagedRoom | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  public broadcastRoomState(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;

    const state: RoomState = {
      code: room.code,
      hostGuestId: room.hostGuestId,
      settings: room.settings,
      phase: room.engine.phase,
      players: room.players,
      chat: room.chat,
      score: room.engine.score,
      setsWon: room.engine.setsWon,
      currentSet: room.engine.currentSet,
      servingTeam: room.engine.servingTeam,
      servingPlayerId: room.engine.servingPlayerId,
      winnerTeam: room.engine.winnerTeam,
      mvpPlayerId: room.engine.mvpPlayerId,
      disconnectPauseRemainingMs:
        room.engine.phase === 'paused_disconnect'
          ? Math.max(0, Math.round(room.engine.phaseTimer * 1000))
          : 0,
    };

    this.io.to(code).emit('room:state', state);
    this.io.to(code).emit('lobby:update', state);
  }
}
