'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Sun,
  Volume2,
  VolumeX,
  EyeOff,
  Eye,
  LogOut,
  MessageSquare,
  Send,
  Wifi,
  Gamepad2,
  Crosshair,
} from 'lucide-react';
import { COURT_HALF_LENGTH, COURT_HALF_WIDTH, QUICK_EMOTES } from '../../shared';
import { soundManager } from '../../lib/audio';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';
import { activeChargeState } from '../game/VolleyCanvas';

export default function GameHUD() {
  const {
    roomState,
    latestSnapshot,
    mySocketId,
    ping,
    recentBanner,
    cameraMode,
    theme,
    quality,
    isMuted,
    isDockCollapsed,
    showMobileControls,
    mobileSprintHeld,
    mobileAim,
    setCameraMode,
    setTheme,
    setQuality,
    toggleMute,
    toggleDock,
    toggleMobileControls,
    setMobileMove,
    setMobileSprintHeld,
    setMobileAim,
    triggerMobileAction,
  } = useGameStore();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [inReachUI, setInReachUI] = useState(false);

  // Multi-touch safe Virtual Joystick state
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  // Auto-detect mobile viewport resize
  useEffect(() => {
    const checkViewport = () => {
      if (window.innerWidth < 900 && !useGameStore.getState().showMobileControls) {
        useGameStore.getState().setShowMobileControls(true);
      }
    };
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (activeChargeState.ballInReach !== inReachUI) {
        setInReachUI(activeChargeState.ballInReach);
      }
    }, 45);
    return () => clearInterval(id);
  }, [inReachUI]);

  if (!roomState || !latestSnapshot) return null;

  // When H is pressed (`isDockCollapsed === true`), hide ALL HUDs for a 100% unobstructed view!
  if (isDockCollapsed) {
    return (
      <div className="fixed bottom-3 right-3 z-20 pointer-events-auto">
        <button
          onClick={toggleDock}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f172a]/85 hover:bg-[#0f172a] border border-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer shadow-lg"
          title="Press H to restore all HUD elements"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>Show HUD (H)</span>
        </button>
      </div>
    );
  }

  const me = latestSnapshot.players.find((p) => p.id === mySocketId);
  const isMyServe =
    latestSnapshot.phase === 'serve_wait' && latestSnapshot.servingPlayerId === mySocketId;

  const activeTouches =
    latestSnapshot.ball.lastTouchTeam === 'A'
      ? latestSnapshot.touchesTeamA
      : latestSnapshot.ball.lastTouchTeam === 'B'
      ? latestSnapshot.touchesTeamB
      : 0;

  const showBanner =
    recentBanner && recentBanner.expiresAt > Date.now() ? recentBanner.text : null;

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketClient.sendChat(chatInput);
    setChatInput('');
  };

  // Helper to update joystick vector from clientX/clientY
  const updateJoystickFromPoint = (clientX: number, clientY: number) => {
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 8;
    let dx = (clientX - cx) / maxR;
    let dy = (clientY - cy) / maxR;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setJoyKnob({ x: dx * 34, y: dy * 34 });
    setMobileMove(dx, dy);
  };

  const resetJoystick = () => {
    activeTouchIdRef.current = null;
    activePointerIdRef.current = null;
    setIsJoystickActive(false);
    setJoyKnob({ x: 0, y: 0 });
    setMobileMove(0, 0);
  };

  // Multi-touch handlers tracking specific touch identifier so right-hand buttons never interrupt left-hand joystick
  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeTouchIdRef.current = touch.identifier;
    setIsJoystickActive(true);
    updateJoystickFromPoint(touch.clientX, touch.clientY);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier === activeTouchIdRef.current) {
        updateJoystickFromPoint(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        resetJoystick();
        break;
      }
    }
  };

  // Pointer fallback so desktop users testing Mobile Controls can drag the joystick with a mouse
  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    setIsJoystickActive(true);
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (activePointerIdRef.current !== e.pointerId) return;
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (activePointerIdRef.current === e.pointerId) {
      resetJoystick();
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2 sm:p-3.5 md:p-5 select-none">
      {/* Top Perimeter Row: Left Room Badge, Center Broadcast Scoreboard, Right Mini-Map */}
      <div className="flex items-start justify-between gap-1.5 sm:gap-3 w-full">
        {/* Top-Left Room Code & Ping */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#0f172a]/92 border border-slate-700/80 text-[10px] sm:text-xs shrink-0">
          <div>
            <span className="hidden sm:inline text-slate-400 mr-1.5">ROOM</span>
            <span className="font-mono font-bold text-amber-400">{roomState.code}</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1 font-mono tabular-nums text-slate-300">
            <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
            <span>{ping}ms</span>
          </div>
        </div>

        {/* Top-Center Scoreboard + Touch Counter */}
        <div className="pointer-events-auto flex flex-col items-center">
          <div className="flex items-center gap-2 sm:gap-4 px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-[#0f172a]/95 border border-slate-700 shadow-2xl">
            {/* Team A */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="text-right">
                <div className="text-[10px] sm:text-xs font-extrabold text-sky-400 flex items-center justify-end gap-1">
                  {latestSnapshot.servingTeam === 'A' && (
                    <span className="text-amber-400" title="Serving">●</span>
                  )}
                  <span>TEAM A</span>
                </div>
                <div className="text-[9px] sm:text-[11px] font-mono text-slate-400 tabular-nums">
                  Sets: {latestSnapshot.setsWon.teamA}
                </div>
              </div>
              <div className="text-xl sm:text-2xl md:text-3xl font-mono font-black text-white tabular-nums px-1">
                {String(latestSnapshot.score.teamA).padStart(2, '0')}
              </div>
            </div>

            {/* Center Set & Touch Indicator */}
            <div className="flex flex-col items-center px-2 sm:px-3 border-x border-slate-800">
              <div className="text-[9px] sm:text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                SET {latestSnapshot.currentSet}
              </div>
              <div className="flex items-center gap-1 my-0.5" title="Team Touches (Max 3)">
                {[1, 2, 3].map((num) => (
                  <span
                    key={num}
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-sm font-mono text-[9px] sm:text-[10px] font-bold flex items-center justify-center ${
                      activeTouches >= num
                        ? num === 3
                          ? 'bg-rose-500 text-white'
                          : 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {num}
                  </span>
                ))}
              </div>
              <div className="hidden sm:block text-[10px] text-slate-400 font-mono tabular-nums">
                {activeTouches}/3 Touches
              </div>
            </div>

            {/* Team B */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="text-xl sm:text-2xl md:text-3xl font-mono font-black text-white tabular-nums px-1">
                {String(latestSnapshot.score.teamB).padStart(2, '0')}
              </div>
              <div className="text-left">
                <div className="text-[10px] sm:text-xs font-extrabold text-rose-400 flex items-center gap-1">
                  <span>TEAM B</span>
                  {latestSnapshot.servingTeam === 'B' && (
                    <span className="text-amber-400" title="Serving">●</span>
                  )}
                </div>
                <div className="text-[9px] sm:text-[11px] font-mono text-slate-400 tabular-nums">
                  Sets: {latestSnapshot.setsWon.teamB}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right 2D Court Mini-Map (Compact on mobile, larger on desktop) */}
        <div className="hidden md:block pointer-events-auto rounded-xl bg-[#0f172a]/92 border border-slate-700/80 p-2 shadow-lg shrink-0">
          <div className="relative w-32 h-18 rounded-lg bg-[#d9b373]/25 border border-white/40 overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/80 -translate-x-1/2" />
            {latestSnapshot.players.map((p) => {
              const leftPct = 50 + (p.pos.x / (COURT_HALF_LENGTH + 3)) * 46;
              const topPct = 50 + (p.pos.z / (COURT_HALF_WIDTH + 2)) * 44;
              const isMe = p.id === mySocketId;
              return (
                <div
                  key={p.id}
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className={`absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ${
                    isMe
                      ? 'bg-amber-300 ring-2 ring-white'
                      : p.team === 'A'
                      ? 'bg-sky-400'
                      : 'bg-rose-400'
                  }`}
                />
              );
            })}
            <div
              style={{
                left: `${50 + (latestSnapshot.ball.pos.x / (COURT_HALF_LENGTH + 3)) * 46}%`,
                top: `${50 + (latestSnapshot.ball.pos.z / (COURT_HALF_WIDTH + 2)) * 44}%`,
              }}
              className="absolute w-2 h-2 rounded-full bg-yellow-300 border border-slate-950 -translate-x-1/2 -translate-y-1/2"
            />
          </div>
        </div>
      </div>

      {/* Bottom Area: Status Callouts + Mobile Controller + Bottom Dock */}
      <div className="relative flex flex-col items-center gap-2 w-full mt-auto">
        {/* Bottom Status & Callout Messages (Always at the bottom, never blocking the middle of the screen!) */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pointer-events-none px-2 text-center">
          {inReachUI && (latestSnapshot.phase === 'playing' || latestSnapshot.phase === 'serve_wait') && (
            <div className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-mono font-extrabold text-[11px] sm:text-xs uppercase tracking-wider shadow-lg">
              {showMobileControls
                ? 'BALL IN REACH — TAP HIT / SPIKE OR SET!'
                : 'BALL IN REACH — LEFT CLICK TO HIT / E TO SET'}
            </div>
          )}

          {latestSnapshot.phase === 'countdown' && (
            <div className="px-4 py-1.5 rounded-xl bg-[#0f172a]/95 border border-amber-400/60 text-center shadow-xl flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-amber-300 uppercase tracking-widest">
                Match Starting In
              </span>
              <span className="text-lg sm:text-xl font-display font-black text-white tabular-nums">
                {Math.max(1, Math.ceil(latestSnapshot.phaseTimer))}
              </span>
            </div>
          )}

          {latestSnapshot.phase === 'paused_disconnect' && (
            <div className="px-3.5 py-1.5 rounded-xl bg-[#0f172a]/95 border border-rose-500 text-center shadow-xl text-xs">
              <span className="font-bold text-rose-400 mr-2">Player Disconnected</span>
              <span className="text-slate-300 font-mono tabular-nums">
                Waiting {Math.ceil(latestSnapshot.phaseTimer)}s...
              </span>
            </div>
          )}

          {isMyServe && (
            <div className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-display font-extrabold text-[11px] sm:text-xs shadow-xl">
              {showMobileControls
                ? 'YOUR SERVE! Choose Aim & Tap HIT / SERVE (or JUMP + HIT for Jump Serve)'
                : 'YOUR SERVE! Aim with Mouse · Left Click to Serve (or Space + Left Click for Jump Serve)'}
            </div>
          )}

          {showBanner && latestSnapshot.phase !== 'countdown' && (
            <div className="px-3.5 py-1 sm:py-1.5 rounded-xl bg-[#0f172a]/95 border border-slate-700 text-amber-300 font-display font-bold text-xs sm:text-sm shadow-xl">
              {showBanner}
            </div>
          )}

          {latestSnapshot.isMatchPoint && (
            <div className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-display font-extrabold text-[11px] sm:text-xs tracking-wider uppercase shadow">
              Match Point!
            </div>
          )}
        </div>

        {/* Dedicated Ergonomic Mobile & Touch Controller (Shown on mobile/touch or when toggled on) */}
        {showMobileControls && (
          <div className="flex items-end justify-between w-full px-1 sm:px-3 pb-1 gap-2">
            {/* Left Side: Sprint Toggle + Analog Virtual Thumbstick */}
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              {/* Compact Stamina + Sprint Lock Pill */}
              {me && (
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setMobileSprintHeld(!mobileSprintHeld);
                  }}
                  onClick={() => setMobileSprintHeld(!mobileSprintHeld)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-md ${
                    mobileSprintHeld
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 ring-2 ring-emerald-300/60'
                      : 'bg-[#0f172a]/90 text-slate-200 border-slate-700'
                  }`}
                >
                  <span>SPRINT {mobileSprintHeld ? 'ON' : 'OFF'}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-amber-300">
                    {Math.round(me.stamina)}%
                  </span>
                </button>
              )}

              {/* Analog Thumbstick */}
              <div
                ref={joystickRef}
                onTouchStart={handleJoystickTouchStart}
                onTouchMove={handleJoystickTouchMove}
                onTouchEnd={handleJoystickTouchEnd}
                onTouchCancel={handleJoystickTouchEnd}
                onPointerDown={handleJoystickPointerDown}
                onPointerMove={handleJoystickPointerMove}
                onPointerUp={handleJoystickPointerUp}
                onPointerCancel={handleJoystickPointerUp}
                className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0f172a]/85 border-2 flex items-center justify-center touch-none shadow-2xl transition-colors ${
                  isJoystickActive ? 'border-amber-400' : 'border-slate-600/90'
                }`}
              >
                {/* Directional Crosshair Guides */}
                <span className="absolute top-1.5 text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                  NET
                </span>
                <span className="absolute bottom-1.5 text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                  BACK
                </span>
                <span className="absolute left-2 text-[9px] font-mono font-bold text-slate-400">
                  L
                </span>
                <span className="absolute right-2 text-[9px] font-mono font-bold text-slate-400">
                  R
                </span>
                <div className="w-10 h-10 rounded-full border border-slate-700/70" />

                {/* Thumb Knob */}
                <div
                  style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
                  className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
                    isJoystickActive
                      ? 'bg-gradient-to-br from-amber-300 to-orange-500 ring-2 ring-white'
                      : 'bg-amber-400/90'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-slate-950/30" />
                </div>
              </div>
            </div>

            {/* Right Side: Shot Aim Selector + Arcade Action Buttons */}
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {/* Mobile Shot Placement Selector (Steers the yellow 3rd-person aim arrow!) */}
              <div className="flex flex-col items-end gap-1 bg-[#0f172a]/90 border border-slate-700/80 rounded-xl p-1.5 shadow-lg">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 px-1">
                  <Crosshair className="w-3 h-3 text-amber-400" />
                  <span>SHOT AIM</span>
                  <button
                    type="button"
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setMobileAim(mobileAim.x, mobileAim.y > 0.2 ? -0.35 : 0.75);
                    }}
                    onClick={() => setMobileAim(mobileAim.x, mobileAim.y > 0.2 ? -0.35 : 0.75)}
                    className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      mobileAim.y > 0.2
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : 'bg-sky-400/20 text-sky-300 border border-sky-400/40'
                    }`}
                  >
                    {mobileAim.y > 0.2 ? 'DEEP' : 'DROP'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { label: '↖ Left', val: -0.75 },
                      { label: '↑ Mid', val: 0 },
                      { label: 'Right ↗', val: 0.75 },
                    ] as const
                  ).map((dir) => (
                    <button
                      key={dir.label}
                      type="button"
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setMobileAim(dir.val, mobileAim.y);
                      }}
                      onClick={() => setMobileAim(dir.val, mobileAim.y)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                        Math.abs(mobileAim.x - dir.val) < 0.2
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {dir.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons Cluster */}
              <div className="grid grid-cols-2 gap-2">
                {/* JUMP Button */}
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ jump: true });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ jump: true });
                  }}
                  className="w-20 h-14 sm:w-24 sm:h-16 rounded-2xl bg-sky-500 active:bg-sky-400 active:scale-95 text-slate-950 font-display font-black text-xs sm:text-sm shadow-xl border-2 border-sky-300/80 flex flex-col items-center justify-center transition-transform touch-none"
                >
                  <span>JUMP</span>
                  <span className="text-[9px] font-mono font-bold opacity-80">BLOCK / AIR</span>
                </button>

                {/* Primary Instant HIT / SPIKE / SERVE Button */}
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ action: 'bump', charge: 0.9 });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ action: 'bump', charge: 0.9 });
                  }}
                  className={`w-24 h-14 sm:w-28 sm:h-16 rounded-2xl active:scale-95 text-slate-950 font-display font-black text-xs sm:text-sm shadow-2xl border-2 flex flex-col items-center justify-center transition-all touch-none ${
                    inReachUI || isMyServe
                      ? 'bg-emerald-400 border-white ring-4 ring-emerald-400/50 scale-105'
                      : 'bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 border-amber-200'
                  }`}
                >
                  <span>{isMyServe ? 'SERVE!' : 'HIT / SPIKE'}</span>
                  <span className="text-[9px] font-mono font-bold opacity-85">
                    {inReachUI ? 'STRIKE NOW!' : 'INSTANT HIT'}
                  </span>
                </button>

                {/* SET (High Pass) Button */}
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ action: 'set', charge: 0.6 });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ action: 'set', charge: 0.6 });
                  }}
                  className="w-20 h-11 sm:w-24 sm:h-12 rounded-2xl bg-emerald-400 active:bg-emerald-300 active:scale-95 text-slate-950 font-display font-black text-xs shadow-lg border border-emerald-200 flex items-center justify-center touch-none"
                >
                  SET PASS
                </button>

                {/* DIVE SAVE Button */}
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ sprint: true, action: 'bump', charge: 0.85 });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    triggerMobileAction({ sprint: true, action: 'bump', charge: 0.85 });
                  }}
                  className="w-24 h-11 sm:w-28 sm:h-12 rounded-2xl bg-rose-500 active:bg-rose-400 active:scale-95 text-white font-display font-black text-xs shadow-lg border border-rose-300/60 flex items-center justify-center touch-none"
                >
                  SAND DIVE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Bar: Stamina & Emotes on Desktop Left, Unified Control Dock in Center */}
        <div className="flex flex-wrap items-end justify-between gap-2 w-full">
          {/* Bottom-Left: Local Athlete Stamina + Emotes (Hidden on mobile when touch controls show stamina) */}
          <div className="pointer-events-auto hidden lg:flex flex-col gap-1.5">
            {me && (
              <div className="px-3 py-2 rounded-xl bg-[#0f172a]/92 border border-slate-700/80 w-52 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-300">Stamina (Shift)</span>
                  <span className="font-mono text-amber-400 tabular-nums">
                    {Math.round(me.stamina)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.round(me.stamina)}%` }}
                    className="h-full bg-emerald-400 transition-all duration-75"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0f172a]/92 border border-slate-700/80">
              {QUICK_EMOTES.slice(0, 4).map((em, idx) => (
                <button
                  key={em}
                  onClick={() => socketClient.sendChat(em, true)}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer"
                  title={`Press ${idx + 1}`}
                >
                  <span className="text-amber-400 font-mono mr-1">{idx + 1}</span>
                  {em}
                </button>
              ))}
              <button
                onClick={() => setChatOpen((o) => !o)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 cursor-pointer"
                title="Toggle Chat"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>

            {chatOpen && (
              <div className="w-72 rounded-xl bg-[#0f172a]/95 border border-slate-700 p-3 shadow-2xl">
                <div className="max-h-28 overflow-y-auto space-y-1 text-xs mb-2">
                  {roomState.chat.slice(-8).map((m) => (
                    <div key={m.id}>
                      <span className="font-bold text-amber-300 mr-1">{m.senderName}:</span>
                      <span className="text-slate-200">{m.text}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleChatSubmit} className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Chat..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-lg bg-amber-400 text-slate-950 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Bottom-Center Dock (Compact & Responsive on Mobile) */}
          <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-[#0f172a]/95 border border-slate-700 shadow-2xl">
            <div className="flex items-center gap-1" title="Press C to cycle Camera View">
              <Camera className="w-3.5 h-3.5 text-amber-400 hidden sm:inline mr-0.5" />
              {(
                [
                  { id: 'follow', label: '3rd Person' },
                  { id: 'broadcast', label: 'Broadcast' },
                  { id: 'side', label: 'Sideline' },
                ] as const
              ).map((cm) => (
                <button
                  key={cm.id}
                  onClick={() => setCameraMode(cm.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer ${
                    cameraMode === cm.id
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cm.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-700 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-1">
              <Sun className="w-3.5 h-3.5 text-sky-400 mr-1" />
              {(['sunset', 'day', 'stadium'] as const).map((th) => (
                <button
                  key={th}
                  onClick={() => setTheme(th)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                    theme === th
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {th}
                </button>
              ))}
            </div>

            {/* Toggle Mobile Touch Controls Button (Available on all devices!) */}
            <button
              onClick={toggleMobileControls}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer border ${
                showMobileControls
                  ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Toggle On-Screen Mobile Touch Controls"
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Touch Controls</span>
            </button>

            <button
              onClick={() => {
                const next = !isMuted;
                toggleMute();
                soundManager.setMuted(next);
              }}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Mute / Unmute"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              )}
            </button>

            <button
              onClick={toggleDock}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] sm:text-xs font-semibold cursor-pointer"
              title="Hide All HUDs (Shortcut: H)"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Hide HUD (H)</span>
              <span className="sm:hidden">HUD</span>
            </button>

            <button
              onClick={() => {
                soundManager.playClick();
                socketClient.leaveRoom();
              }}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] sm:text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
