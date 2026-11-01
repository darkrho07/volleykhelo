'use client';

import { create } from 'zustand';
import {
  GameEventPayload,
  GameSnapshot,
  OUTFIT_PALETTES,
  RoomState,
} from '../shared';

export type ScreenModal = 'none' | 'create_room' | 'join_room' | 'how_to_play' | 'settings';
export type CameraViewMode = 'broadcast' | 'follow' | 'side';
export type AtmosphereTheme = 'day' | 'sunset' | 'stadium';
export type GraphicsQuality = 'low' | 'medium' | 'high';

interface GameStoreState {
  // Player Identity
  guestId: string;
  mySocketId: string | null;
  nickname: string;
  outfitColor: string;
  visorColor: string;

  // Connection & Room
  connected: boolean;
  ping: number;
  roomState: RoomState | null;
  latestSnapshot: GameSnapshot | null;
  recentBanner: { text: string; team?: 'A' | 'B'; expiresAt: number } | null;
  errorToast: string | null;

  // UI & Settings
  activeModal: ScreenModal;
  cameraMode: CameraViewMode;
  mouseSensitivity: number;
  theme: AtmosphereTheme;
  quality: GraphicsQuality;
  sfxVolume: number;
  musicVolume: number;
  isMuted: boolean;
  isMusicEnabled: boolean;
  isDockCollapsed: boolean;

  // Mobile virtual input state
  mobileMove: { x: number; z: number };
  mobileActionQueue: {
    jump: boolean;
    action: 'bump' | 'set' | 'spike' | 'serve' | null;
    sprint: boolean;
    charge: number;
  };

  // Actions
  initIdentity: () => void;
  setNickname: (name: string) => void;
  setOutfit: (outfit: string, visor: string) => void;
  setConnected: (connected: boolean, socketId?: string | null) => void;
  setPing: (ping: number) => void;
  setRoomState: (state: RoomState | null) => void;
  setLatestSnapshot: (snap: GameSnapshot | null) => void;
  handleGameEvent: (ev: GameEventPayload) => void;
  setErrorToast: (msg: string | null) => void;
  setActiveModal: (modal: ScreenModal) => void;
  setCameraMode: (mode: CameraViewMode) => void;
  setMouseSensitivity: (sens: number) => void;
  setTheme: (theme: AtmosphereTheme) => void;
  setQuality: (q: GraphicsQuality) => void;
  setVolumes: (sfx: number, music: number) => void;
  toggleMute: () => void;
  toggleMusic: () => void;
  toggleDock: () => void;
  setMobileMove: (x: number, z: number) => void;
  triggerMobileAction: (payload: Partial<GameStoreState['mobileActionQueue']>) => void;
  consumeMobileAction: () => GameStoreState['mobileActionQueue'];
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  guestId: '',
  mySocketId: null,
  nickname: 'Striker',
  outfitColor: OUTFIT_PALETTES[0].outfit,
  visorColor: OUTFIT_PALETTES[0].visor,

  connected: false,
  ping: 16,
  roomState: null,
  latestSnapshot: null,
  recentBanner: null,
  errorToast: null,

  activeModal: 'none',
  cameraMode: 'follow',
  mouseSensitivity: 1.0,
  theme: 'sunset',
  quality: 'high',
  sfxVolume: 0.75,
  musicVolume: 0.35,
  isMuted: false,
  isMusicEnabled: false,
  isDockCollapsed: false,

  mobileMove: { x: 0, z: 0 },
  mobileActionQueue: {
    jump: false,
    action: null,
    sprint: false,
    charge: 0.7,
  },

  initIdentity: () => {
    if (typeof window === 'undefined') return;
    let gid = localStorage.getItem('vk_guest_id');
    if (!gid) {
      gid = `vk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('vk_guest_id', gid);
    }
    const savedName = localStorage.getItem('vk_nickname') || `Player${Math.floor(10 + Math.random() * 89)}`;
    const savedOutfit = localStorage.getItem('vk_outfit') || OUTFIT_PALETTES[0].outfit;
    const savedVisor = localStorage.getItem('vk_visor') || OUTFIT_PALETTES[0].visor;
    set({
      guestId: gid,
      nickname: savedName,
      outfitColor: savedOutfit,
      visorColor: savedVisor,
    });
  },

  setNickname: (nickname) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vk_nickname', nickname);
    }
    set({ nickname });
  },

  setOutfit: (outfitColor, visorColor) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vk_outfit', outfitColor);
      localStorage.setItem('vk_visor', visorColor);
    }
    set({ outfitColor, visorColor });
  },

  setConnected: (connected, socketId) =>
    set((s) => ({
      connected,
      mySocketId: socketId !== undefined ? socketId : s.mySocketId,
    })),

  setPing: (ping) => set({ ping }),

  setRoomState: (roomState) => set({ roomState }),

  setLatestSnapshot: (latestSnapshot) => set({ latestSnapshot }),

  handleGameEvent: (ev) => {
    if (ev.type === 'point' || ev.type === 'set_won' || ev.type === 'serve') {
      set({
        recentBanner: {
          text: ev.reason || (ev.type === 'point' ? `Point Team ${ev.team}!` : 'Serve Ready!'),
          team: ev.team,
          expiresAt: Date.now() + 2600,
        },
      });
    }
  },

  setErrorToast: (errorToast) => {
    set({ errorToast });
    if (errorToast) {
      setTimeout(() => {
        if (get().errorToast === errorToast) {
          set({ errorToast: null });
        }
      }, 4000);
    }
  },

  setActiveModal: (activeModal) => set({ activeModal }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setMouseSensitivity: (mouseSensitivity) => set({ mouseSensitivity }),
  setTheme: (theme) => set({ theme }),
  setQuality: (quality) => set({ quality }),
  setVolumes: (sfxVolume, musicVolume) => set({ sfxVolume, musicVolume }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleMusic: () => set((s) => ({ isMusicEnabled: !s.isMusicEnabled })),
  toggleDock: () => set((s) => ({ isDockCollapsed: !s.isDockCollapsed })),

  setMobileMove: (x, z) => set({ mobileMove: { x, z } }),
  triggerMobileAction: (payload) =>
    set((s) => ({
      mobileActionQueue: {
        ...s.mobileActionQueue,
        ...payload,
      },
    })),
  consumeMobileAction: () => {
    const current = get().mobileActionQueue;
    if (current.jump || current.action || current.sprint) {
      set({
        mobileActionQueue: {
          jump: false,
          action: null,
          sprint: false,
          charge: 0.7,
        },
      });
    }
    return current;
  },
}));
