'use client';

import { io, Socket } from 'socket.io-client';
import {
  GameEventPayload,
  GameSnapshot,
  PlayerInput,
  RoomSettings,
  RoomState,
  SERVER_DT,
  stepPlayerPhysics,
  TeamId,
} from '../shared';
import { useGameStore } from '../store/useGameStore';
import { soundManager } from './audio';

export type VisualEventCallback = (event: GameEventPayload) => void;

class SocketGameClient {
  public socket: Socket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private inputHistory: PlayerInput[] = [];
  private seqCounter = 0;
  private visualListeners = new Set<VisualEventCallback>();

  // Mutable predicted state for local player so 60fps Three.js loop reads it without GC/React re-renders
  public predictedLocalPos: { x: number; y: number; z: number } | null = null;
  public predictedLocalVel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  public predictedLocalGrounded = true;

  public connect(): Socket {
    if (this.socket) return this.socket;

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
    });

    this.socket = socket;

    socket.on('connect', () => {
      const store = useGameStore.getState();
      store.setConnected(true, socket.id || null);

      // If we were previously in a room, auto-rejoin using guestId!
      if (store.roomState?.code) {
        this.joinRoom(store.roomState.code);
      }
    });

    socket.on('disconnect', () => {
      useGameStore.getState().setConnected(false);
    });

    socket.on('room:state', (state: RoomState) => {
      useGameStore.getState().setRoomState(state);
    });

    socket.on('lobby:update', (state: RoomState) => {
      useGameStore.getState().setRoomState(state);
    });

    socket.on('game:snapshot', (snapshot: GameSnapshot) => {
      const store = useGameStore.getState();
      store.setLatestSnapshot(snapshot);
      this.reconcileLocalPlayer(snapshot);
    });

    socket.on('game:event', (ev: GameEventPayload) => {
      useGameStore.getState().handleGameEvent(ev);

      // Play procedural Web Audio feedback
      if (ev.type === 'hit') {
        if (ev.hitType === 'spike') soundManager.playSpike(ev.power || 0.8);
        else if (ev.hitType === 'set') soundManager.playSet();
        else soundManager.playBump();
      } else if (ev.type === 'serve') {
        soundManager.playWhistle();
      } else if (ev.type === 'net_hit') {
        soundManager.playNetHit();
      } else if (ev.type === 'point' || ev.type === 'set_won') {
        soundManager.playPointCheer(false);
      } else if (ev.type === 'match_end') {
        soundManager.playPointCheer(true);
      }

      for (const cb of this.visualListeners) {
        cb(ev);
      }
    });

    socket.on('error', (err: { message?: string }) => {
      if (err?.message) {
        useGameStore.getState().setErrorToast(err.message);
      }
    });

    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (socket.connected) {
        const sent = Date.now();
        socket.emit('ping:check', sent, () => {
          const rtt = Date.now() - sent;
          useGameStore.getState().setPing(rtt);
        });
      }
    }, 2500);

    return socket;
  }

  public onVisualEvent(cb: VisualEventCallback): () => void {
    this.visualListeners.add(cb);
    return () => {
      this.visualListeners.delete(cb);
    };
  }

  /**
   * Client-side prediction & reconciliation with authoritative server snapshot
   */
  private reconcileLocalPlayer(snapshot: GameSnapshot): void {
    const myId = this.socket?.id;
    if (!myId) return;
    const serverMe = snapshot.players.find((p) => p.id === myId);
    if (!serverMe) return;

    // Discard inputs already processed by the server
    this.inputHistory = this.inputHistory.filter(
      (inp) => inp.seq > serverMe.lastProcessedInputSeq
    );

    if (snapshot.phase !== 'playing' && snapshot.phase !== 'serve_wait') {
      this.predictedLocalPos = { ...serverMe.pos };
      this.predictedLocalVel = { ...serverMe.vel };
      this.predictedLocalGrounded = serverMe.isGrounded;
      this.inputHistory = [];
      return;
    }

    // Re-simulate from authoritative server state + unacknowledged inputs
    const simPlayer = {
      ...serverMe,
      pos: { ...serverMe.pos },
      vel: { ...serverMe.vel },
    };
    const isServeWait = snapshot.phase === 'serve_wait';
    const isServer = snapshot.servingPlayerId === myId;

    for (const inp of this.inputHistory) {
      stepPlayerPhysics(simPlayer, inp, SERVER_DT, isServeWait, isServer);
    }

    if (!this.predictedLocalPos) {
      this.predictedLocalPos = { ...simPlayer.pos };
    } else {
      // Smoothly reconcile any prediction error
      const errDist = Math.hypot(
        simPlayer.pos.x - this.predictedLocalPos.x,
        simPlayer.pos.y - this.predictedLocalPos.y,
        simPlayer.pos.z - this.predictedLocalPos.z
      );
      if (errDist > 1.6) {
        // Snap if teleported (e.g. rally reset)
        this.predictedLocalPos = { ...simPlayer.pos };
      } else {
        this.predictedLocalPos.x += (simPlayer.pos.x - this.predictedLocalPos.x) * 0.35;
        this.predictedLocalPos.y += (simPlayer.pos.y - this.predictedLocalPos.y) * 0.45;
        this.predictedLocalPos.z += (simPlayer.pos.z - this.predictedLocalPos.z) * 0.35;
      }
    }
    this.predictedLocalVel = { ...simPlayer.vel };
    this.predictedLocalGrounded = simPlayer.isGrounded;
  }

  public sendInput(raw: Omit<PlayerInput, 'seq' | 'timestamp'>): void {
    if (!this.socket || !this.socket.connected) return;
    const store = useGameStore.getState();
    const snap = store.latestSnapshot;
    if (!snap || (snap.phase !== 'playing' && snap.phase !== 'serve_wait')) return;

    this.seqCounter += 1;
    const fullInput: PlayerInput = {
      ...raw,
      seq: this.seqCounter,
      timestamp: Date.now(),
    };

    // Apply immediate client-side prediction step for local responsiveness
    const myId = this.socket.id;
    const me = snap.players.find((p) => p.id === myId);
    if (me) {
      if (!this.predictedLocalPos) {
        this.predictedLocalPos = { ...me.pos };
      }
      const simMe = {
        ...me,
        pos: { ...this.predictedLocalPos },
        vel: { ...this.predictedLocalVel },
        isGrounded: this.predictedLocalGrounded,
      };
      stepPlayerPhysics(
        simMe,
        fullInput,
        SERVER_DT,
        snap.phase === 'serve_wait',
        snap.servingPlayerId === myId
      );
      this.predictedLocalPos = { ...simMe.pos };
      this.predictedLocalVel = { ...simMe.vel };
      this.predictedLocalGrounded = simMe.isGrounded;
    }

    this.inputHistory.push(fullInput);
    if (this.inputHistory.length > 60) {
      this.inputHistory.shift();
    }

    this.socket.emit('input:update', fullInput);
  }

  public createRoom(settings?: Partial<RoomSettings>, withBots = false, autoStart = false): void {
    const store = useGameStore.getState();
    this.connect().emit('room:create', {
      guestId: store.guestId,
      name: store.nickname,
      outfitColor: store.outfitColor,
      visorColor: store.visorColor,
      settings,
      withBots,
      autoStart,
    });
  }

  public joinRoom(code: string): void {
    const store = useGameStore.getState();
    this.connect().emit('room:join', {
      code: code.trim().toUpperCase(),
      guestId: store.guestId,
      name: store.nickname,
      outfitColor: store.outfitColor,
      visorColor: store.visorColor,
    });
  }

  public quickMatch(preferredMode: '1v1' | '2v2' | '3v3' = '2v2'): void {
    const store = useGameStore.getState();
    this.connect().emit('room:quick_match', {
      guestId: store.guestId,
      name: store.nickname,
      outfitColor: store.outfitColor,
      visorColor: store.visorColor,
      preferredMode,
    });
  }

  public leaveRoom(): void {
    this.socket?.emit('room:leave');
    this.predictedLocalPos = null;
    useGameStore.getState().setRoomState(null);
    useGameStore.getState().setLatestSnapshot(null);
  }

  public updateSettings(partial: Partial<RoomSettings>): void {
    this.socket?.emit('room:settings', partial);
  }

  public selectTeam(team: TeamId): void {
    this.socket?.emit('team:select', { team });
  }

  public addBot(team?: TeamId): void {
    this.socket?.emit('bot:add', { team });
  }

  public removeBot(botId: string): void {
    this.socket?.emit('bot:remove', { botId });
  }

  public toggleReady(): void {
    this.socket?.emit('player:ready');
  }

  public startMatch(): void {
    this.socket?.emit('match:start');
  }

  public rematch(): void {
    this.socket?.emit('match:rematch');
  }

  public returnToLobby(): void {
    this.socket?.emit('match:lobby');
  }

  public sendChat(text: string, isEmote = false): void {
    this.socket?.emit('chat:send', { text, isEmote });
  }
}

export const socketClient = new SocketGameClient();
