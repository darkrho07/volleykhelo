'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Sun,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageSquare,
  Send,
  Wifi,
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
    setCameraMode,
    setTheme,
    setQuality,
    toggleMute,
    toggleDock,
    setMobileMove,
    triggerMobileAction,
  } = useGameStore();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chargeUI, setChargeUI] = useState(0);
  const [inReachUI, setInReachUI] = useState(false);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      if (activeChargeState.isCharging) {
        setChargeUI(activeChargeState.chargeValue);
      } else if (chargeUI !== 0) {
        setChargeUI(0);
      }
      if (activeChargeState.ballInReach !== inReachUI) {
        setInReachUI(activeChargeState.ballInReach);
      }
    }, 45);
    return () => clearInterval(id);
  }, [chargeUI, inReachUI]);

  if (!roomState || !latestSnapshot) return null;

  const me = latestSnapshot.players.find((p) => p.id === mySocketId);
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

  // Virtual Joystick Touch Handlers
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2;
    let dx = (touch.clientX - cx) / maxR;
    let dy = (touch.clientY - cy) / maxR;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setJoyKnob({ x: dx * 28, y: dy * 28 });
    setMobileMove(dx, dy);
  };

  const handleTouchEnd = () => {
    setJoyKnob({ x: 0, y: 0 });
    setMobileMove(0, 0);
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* Top Perimeter Row: Left Room Badge, Center Broadcast Scoreboard, Right Mini-Map */}
      <div className="flex items-start justify-between gap-3 w-full">
        {/* Top-Left Room Code & Ping */}
        <div className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[#0f172a]/92 border border-slate-700/80 text-xs">
          <div>
            <span className="text-slate-400 mr-1.5">ROOM</span>
            <span className="font-mono font-bold text-amber-400">{roomState.code}</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1 font-mono tabular-nums text-slate-300">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>{ping}ms</span>
          </div>
        </div>

        {/* Top-Center Broadcast Scoreboard + Touch Counter */}
        <div className="pointer-events-auto flex flex-col items-center">
          <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-[#0f172a]/95 border border-slate-700 shadow-2xl">
            {/* Team A */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs font-extrabold text-sky-400 flex items-center justify-end gap-1.5">
                  {latestSnapshot.servingTeam === 'A' && (
                    <span className="text-amber-400" title="Serving">●</span>
                  )}
                  <span>TEAM A</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Sets: {latestSnapshot.setsWon.teamA}
                </div>
              </div>
              <div className="text-3xl md:text-4xl font-mono font-black text-white tabular-nums px-2">
                {String(latestSnapshot.score.teamA).padStart(2, '0')}
              </div>
            </div>

            {/* Center Set & Touch Indicator */}
            <div className="flex flex-col items-center px-3 border-x border-slate-800">
              <div className="text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                SET {latestSnapshot.currentSet}
              </div>
              <div className="flex items-center gap-1.5 my-1" title="Team Touches (Max 3)">
                {[1, 2, 3].map((num) => (
                  <span
                    key={num}
                    className={`w-3.5 h-3.5 rounded-sm font-mono text-[10px] font-bold flex items-center justify-center ${
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
              <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                {activeTouches}/3 Touches
              </div>
            </div>

            {/* Team B */}
            <div className="flex items-center gap-3">
              <div className="text-3xl md:text-4xl font-mono font-black text-white tabular-nums px-2">
                {String(latestSnapshot.score.teamB).padStart(2, '0')}
              </div>
              <div className="text-left">
                <div className="text-xs font-extrabold text-rose-400 flex items-center gap-1.5">
                  <span>TEAM B</span>
                  {latestSnapshot.servingTeam === 'B' && (
                    <span className="text-amber-400" title="Serving">●</span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Sets: {latestSnapshot.setsWon.teamB}
                </div>
              </div>
            </div>
          </div>

          {latestSnapshot.isMatchPoint && (
            <div className="mt-1.5 px-3 py-0.5 rounded-md bg-rose-600 text-white font-display font-extrabold text-xs tracking-wider uppercase shadow">
              Match Point!
            </div>
          )}
        </div>

        {/* Top-Right 2D Court Mini-Map */}
        <div className="hidden sm:block pointer-events-auto rounded-xl bg-[#0f172a]/92 border border-slate-700/80 p-2 shadow-lg">
          <div className="relative w-36 h-20 rounded-lg bg-[#d9b373]/25 border border-white/40 overflow-hidden">
            {/* Center Net Line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/80 -translate-x-1/2" />

            {/* Players on Mini-Map */}
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

            {/* Ball Dot on Mini-Map */}
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

      {/* Center Callouts & 3rd-Person Aim Reticle */}
      <div className="my-auto flex flex-col items-center justify-center pointer-events-none">
        {cameraMode === 'follow' &&
          (latestSnapshot.phase === 'playing' || latestSnapshot.phase === 'serve_wait') && (
            <div className="mb-3 flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform duration-75 ${
                  inReachUI
                    ? 'border-emerald-400 scale-125 bg-emerald-400/20'
                    : 'border-white/45 scale-100'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    inReachUI ? 'bg-emerald-300' : 'bg-amber-400/80'
                  }`}
                />
              </div>
              {inReachUI && (
                <span className="mt-1 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-extrabold text-[10px] uppercase tracking-wider shadow">
                  STRIKE NOW! (CLICK / E)
                </span>
              )}
            </div>
          )}

        {latestSnapshot.phase === 'countdown' && (
          <div className="px-8 py-4 rounded-2xl bg-[#0f172a]/95 border border-amber-400/60 text-center shadow-2xl">
            <div className="text-xs font-bold text-amber-300 uppercase tracking-widest mb-1">
              Get Ready
            </div>
            <div className="text-6xl font-display font-black text-white tabular-nums">
              {Math.max(1, Math.ceil(latestSnapshot.phaseTimer))}
            </div>
          </div>
        )}

        {latestSnapshot.phase === 'paused_disconnect' && (
          <div className="px-6 py-4 rounded-2xl bg-[#0f172a]/95 border border-rose-500 text-center shadow-2xl">
            <div className="text-sm font-display font-bold text-rose-400 mb-1">
              Player Disconnected — Match Paused
            </div>
            <div className="text-xs text-slate-300 font-mono tabular-nums">
              Waiting {Math.ceil(latestSnapshot.phaseTimer)}s for player to rejoin...
            </div>
          </div>
        )}

        {latestSnapshot.phase === 'serve_wait' && latestSnapshot.servingPlayerId === mySocketId && (
          <div className="px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-display font-black text-sm shadow-xl">
            YOUR SERVE! Aim with Mouse · Press Space + Click (or Hold Click for Jump Serve)
          </div>
        )}

        {showBanner && latestSnapshot.phase !== 'countdown' && (
          <div className="mt-2 px-6 py-2.5 rounded-xl bg-[#0f172a]/95 border border-slate-700 text-white font-display font-extrabold text-lg shadow-xl">
            {showBanner}
          </div>
        )}
      </div>

      {/* Mobile Virtual Touch Controls (Visible on touch/mobile screens) */}
      <div className="flex md:hidden items-end justify-between w-full mb-12 px-2">
        {/* Virtual Thumb Joystick */}
        <div
          ref={joystickRef}
          onTouchStart={handleTouchMove}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pointer-events-auto relative w-28 h-28 rounded-full bg-[#0f172a]/85 border-2 border-slate-600 flex items-center justify-center touch-none"
        >
          <div
            style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
            className="w-11 h-11 rounded-full bg-amber-400 shadow-md"
          />
        </div>

        {/* Action Touch Buttons: Jump, Hit/Spike, Set, Dive */}
        <div className="pointer-events-auto grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onTouchStart={() => triggerMobileAction({ jump: true })}
            onClick={() => triggerMobileAction({ jump: true })}
            className="w-16 h-14 rounded-2xl bg-sky-500 active:bg-sky-400 text-slate-950 font-display font-black text-xs shadow-lg"
          >
            JUMP
          </button>
          <button
            type="button"
            onTouchStart={() => triggerMobileAction({ action: 'bump', charge: 0.85 })}
            onClick={() => triggerMobileAction({ action: 'bump', charge: 0.85 })}
            className="w-16 h-14 rounded-2xl bg-amber-400 active:bg-amber-300 text-slate-950 font-display font-black text-xs shadow-lg"
          >
            HIT / SPIKE
          </button>
          <button
            type="button"
            onTouchStart={() => triggerMobileAction({ action: 'set', charge: 0.5 })}
            onClick={() => triggerMobileAction({ action: 'set', charge: 0.5 })}
            className="w-16 h-12 rounded-2xl bg-emerald-400 active:bg-emerald-300 text-slate-950 font-display font-black text-xs shadow-lg"
          >
            SET
          </button>
          <button
            type="button"
            onTouchStart={() => triggerMobileAction({ sprint: true, action: 'bump' })}
            onClick={() => triggerMobileAction({ sprint: true, action: 'bump' })}
            className="w-16 h-12 rounded-2xl bg-rose-500 active:bg-rose-400 text-white font-display font-black text-xs shadow-lg"
          >
            DIVE
          </button>
        </div>
      </div>

      {/* Bottom Perimeter Row: Left Stamina/Charge + Emotes, Center Collapsible Dock */}
      <div className="relative flex items-end justify-between w-full">
        {/* Bottom-Left: Local Athlete Stamina & Charge Meter + Emotes */}
        <div className="pointer-events-auto flex flex-col gap-2">
          {me && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#0f172a]/92 border border-slate-700/80 w-56 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-slate-300">Stamina (Shift Sprint/Dive)</span>
                <span className="font-mono text-amber-400 tabular-nums">
                  {Math.round(me.stamina)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{ width: `${Math.round(me.stamina)}%` }}
                  className="h-full bg-emerald-400 transition-all duration-75"
                />
              </div>

              {chargeUI > 0.05 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 mb-0.5">
                    <span>SPIKE / SERVE POWER</span>
                    <span className="font-mono tabular-nums">{Math.round(chargeUI * 100)}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.round(chargeUI * 100)}%` }}
                      className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Emotes Strip + Chat Toggle */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0f172a]/92 border border-slate-700/80">
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

        {/* Unified Collapsible Bottom Control Dock (Directive 5 of Three.js Skill) */}
        <div className="pointer-events-auto mx-auto flex flex-col items-center">
          <button
            onClick={toggleDock}
            className="flex items-center gap-1 px-3 py-1 rounded-t-xl bg-[#0f172a]/92 border border-b-0 border-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            {isDockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>

          {!isDockCollapsed && (
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#0f172a]/95 border border-slate-700 shadow-2xl">
              {/* Camera View Selector (3rd Person Default + C Shortcut) */}
              <div className="flex items-center gap-1" title="Press C to cycle Camera View">
                <Camera className="w-3.5 h-3.5 text-amber-400 mr-1" />
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      cameraMode === cm.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cm.label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-700" />

              {/* Lighting Theme Selector */}
              <div className="flex items-center gap-1">
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

              <div className="h-4 w-px bg-slate-700" />

              {/* Quality Selector */}
              <div className="hidden md:flex items-center gap-1">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold uppercase cursor-pointer ${
                      quality === q
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-700" />

              {/* Mute & Leave */}
              <button
                onClick={() => {
                  const next = !isMuted;
                  toggleMute();
                  soundManager.setMuted(next);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="Mute / Unmute"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              </button>

              <button
                onClick={() => {
                  soundManager.playClick();
                  socketClient.leaveRoom();
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-semibold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
