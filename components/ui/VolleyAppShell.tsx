'use client';

import React, { useEffect } from 'react';
import VolleyCanvas from '../game/VolleyCanvas';
import TitleScreenOverlay from './TitleScreenOverlay';
import LobbyOverlay from './LobbyOverlay';
import GameHUD from './GameHUD';
import PostMatchModal from './PostMatchModal';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';

interface VolleyAppShellProps {
  initialRoomCode?: string;
  initialModal?: 'none' | 'create_room' | 'join_room' | 'how_to_play' | 'settings';
}

export default function VolleyAppShell({
  initialRoomCode,
  initialModal,
}: VolleyAppShellProps) {
  const { roomState, errorToast, initIdentity, setActiveModal } = useGameStore();

  useEffect(() => {
    initIdentity();
    socketClient.connect();

    if (initialModal) {
      setActiveModal(initialModal);
    }

    if (initialRoomCode) {
      // Join the room code specified in the URL (/room/ABC123)
      setTimeout(() => {
        socketClient.joinRoom(initialRoomCode);
      }, 120);
    }
  }, [initIdentity, initialModal, initialRoomCode, setActiveModal]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b132b] select-none">
      {/* Persistent Full-Bleed 60fps Three.js Arena */}
      <VolleyCanvas />

      {/* Error Toast Notification */}
      {errorToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl bg-rose-600 text-white font-semibold text-xs shadow-2xl border border-rose-400">
          {errorToast}
        </div>
      )}

      {/* State-Driven Game Shell Overlays */}
      {!roomState && <TitleScreenOverlay />}
      {roomState && roomState.phase === 'lobby' && <LobbyOverlay />}
      {roomState && roomState.phase !== 'lobby' && <GameHUD />}
      {roomState && roomState.phase === 'match_over' && <PostMatchModal />}
    </main>
  );
}
