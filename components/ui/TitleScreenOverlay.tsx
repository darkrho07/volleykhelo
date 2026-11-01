'use client';

import React, { useEffect, useState } from 'react';
import {
  Gamepad2,
  PlusCircle,
  LogIn,
  HelpCircle,
  Settings,
  Volume2,
  VolumeX,
  Zap,
  Users,
  X,
  Smartphone,
} from 'lucide-react';
import {
  GameMode,
  NET_HEIGHT_ARCADE,
  NET_HEIGHT_MENS,
  NET_HEIGHT_WOMENS,
  OUTFIT_PALETTES,
} from '../../shared';
import { soundManager } from '../../lib/audio';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';

export default function TitleScreenOverlay() {
  const {
    nickname,
    outfitColor,
    visorColor,
    activeModal,
    isMuted,
    sfxVolume,
    musicVolume,
    mouseSensitivity,
    quality,
    theme,
    showMobileControls,
    setNickname,
    setOutfit,
    setActiveModal,
    toggleMute,
    setVolumes,
    setMouseSensitivity,
    setQuality,
    setTheme,
    toggleMobileControls,
  } = useGameStore();

  // Create Room form state
  const [createMode, setCreateMode] = useState<GameMode>('2v2');
  const [pointsToWin, setPointsToWin] = useState<11 | 15 | 25>(15);
  const [bestOfSets, setBestOfSets] = useState<1 | 3>(3);
  const [netHeight, setNetHeight] = useState<number>(NET_HEIGHT_MENS);
  const [isPublic, setIsPublic] = useState(true);
  const [fillBots, setFillBots] = useState(true);

  // Join Room form state
  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<
    Array<{
      code: string;
      mode: string;
      playerCount: number;
      maxPlayers: number;
      phase: string;
      pointsToWin: number;
    }>
  >([]);

  useEffect(() => {
    if (activeModal === 'join_room') {
      const sock = socketClient.connect();
      sock.emit('rooms:list', (list: typeof publicRooms) => {
        if (Array.isArray(list)) setPublicRooms(list);
      });
    }
  }, [activeModal]);

  const handleQuickPlay = () => {
    soundManager.playClick();
    socketClient.quickMatch('2v2');
  };

  const handleInstantSoloMatch = (mode: GameMode) => {
    soundManager.playClick();
    socketClient.createRoom(
      {
        mode,
        pointsToWin: 15,
        bestOfSets: 3,
        isPublic: true,
      },
      true,
      true
    );
  };

  const handleCreateRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playClick();
    socketClient.createRoom(
      {
        mode: createMode,
        pointsToWin,
        bestOfSets,
        netHeight,
        isPublic,
      },
      fillBots,
      false
    );
    setActiveModal('none');
  };

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    soundManager.playClick();
    socketClient.joinRoom(joinCode);
    setActiveModal('none');
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-6 md:p-10 overflow-y-auto">
      {/* Top Bar: Bespoke Brand Lockup + Quick Audio/Settings */}
      <div className="flex items-start justify-between gap-2 w-full max-w-7xl mx-auto">
        <div className="pointer-events-auto flex flex-col">
          {/* Bespoke SVG Title Lockup */}
          <svg
            viewBox="0 0 460 92"
            className="w-48 sm:w-72 md:w-96 h-auto drop-shadow-[0_6px_16px_rgba(0,0,0,0.65)]"
            aria-label="Volley Khelo"
          >
            <defs>
              <linearGradient id="vkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde047" />
                <stop offset="55%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            {/* Stylized Volleyball Emblem */}
            <circle cx="44" cy="46" r="34" fill="url(#vkGrad)" stroke="#0f172a" strokeWidth="5" />
            <path
              d="M16 34 Q44 52 72 34 M18 60 Q44 40 70 60 M44 12 Q56 46 44 80"
              fill="none"
              stroke="#0f172a"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <text
              x="92"
              y="54"
              fontFamily="var(--font-display), sans-serif"
              fontWeight="900"
              fontSize="48"
              letterSpacing="-1"
              fill="url(#vkGrad)"
              stroke="#0f172a"
              strokeWidth="7"
              paintOrder="stroke"
            >
              VOLLEY KHELO
            </text>
            <text
              x="95"
              y="79"
              fontFamily="var(--font-sans), sans-serif"
              fontWeight="700"
              fontSize="14"
              letterSpacing="2.5"
              fill="#f8fafc"
            >
              REAL-TIME 3D MULTIPLAYER BEACH VOLLEYBALL
            </text>
          </svg>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveModal('how_to_play');
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-slate-700 text-xs sm:text-sm font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden xs:inline sm:inline">How to Play</span>
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveModal('settings');
            }}
            className="p-2 sm:p-2.5 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-slate-700 text-slate-200 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={() => {
              const nextMuted = !isMuted;
              toggleMute();
              soundManager.setMuted(nextMuted);
            }}
            className="p-2 sm:p-2.5 rounded-xl bg-[#0f172a]/90 hover:bg-[#1e293b] border border-slate-700 text-slate-200 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            )}
          </button>
        </div>
      </div>

      {/* Main Lower-Left Player Setup & Action Panel */}
      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 sm:gap-6 mt-4">
        <div className="pointer-events-auto w-full max-w-md mx-auto lg:mx-0 rounded-2xl bg-[#0f172a]/95 border border-slate-700/90 p-4 sm:p-6 shadow-2xl">
          {/* Player Identity & Outfit Customizer */}
          <div className="mb-4 sm:mb-5">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Athlete Nickname & Jersey Kit
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter nickname..."
                className="w-full px-3.5 py-2 sm:py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 mt-2.5 sm:mt-3">
              {OUTFIT_PALETTES.map((pal) => {
                const selected = outfitColor === pal.outfit;
                return (
                  <button
                    key={pal.name}
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setOutfit(pal.outfit, pal.visor);
                    }}
                    title={pal.name}
                    style={{ backgroundColor: pal.outfit }}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-transform cursor-pointer ${
                      selected ? 'ring-2 ring-white scale-110' : 'opacity-75 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Primary Play CTAs */}
          <div className="space-y-2.5">
            <button
              onClick={() => handleInstantSoloMatch('2v2')}
              className="w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-display font-extrabold text-sm sm:text-base tracking-wide shadow-lg transition-all cursor-pointer"
            >
              <Zap className="w-5 h-5 fill-slate-950 shrink-0" />
              <span>Play Instant Match (2v2)</span>
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleQuickPlay}
                className="flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-2 sm:px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-semibold text-[11px] sm:text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Quick Lobby</span>
              </button>
              <button
                onClick={() => {
                  soundManager.playClick();
                  setActiveModal('create_room');
                }}
                className="flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-2 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-semibold text-[11px] sm:text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                <span>Create Room</span>
              </button>
              <button
                onClick={() => {
                  soundManager.playClick();
                  setActiveModal('join_room');
                }}
                className="flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-2 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-semibold text-[11px] sm:text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                <span>Join Room</span>
              </button>
            </div>

            {/* Quick Mode Presets */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Quick Start Mode:</span>
              <div className="flex items-center gap-1.5">
                {(['1v1', '2v2', '3v3'] as GameMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleInstantSoloMatch(m)}
                    className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-amber-400 hover:text-slate-950 font-mono font-bold text-slate-200 transition-colors cursor-pointer"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Control Hint Line (Responsive for Mobile vs Desktop) */}
        <div className="pointer-events-auto mx-auto lg:mx-0 px-3.5 py-2 rounded-xl bg-[#0f172a]/90 border border-slate-700/80 text-[11px] sm:text-xs font-medium text-slate-300 tracking-wide text-center lg:text-left">
          <span className="hidden md:inline">
            <span className="text-amber-400 font-semibold">WASD / Arrows</span> Move ·{' '}
            <span className="text-amber-400 font-semibold">Space</span> Jump ·{' '}
            <span className="text-amber-400 font-semibold">Left Click</span> Instant Hit / Spike / Serve ·{' '}
            <span className="text-amber-400 font-semibold">E / Right Click</span> Set ·{' '}
            <span className="text-amber-400 font-semibold">Shift</span> Sprint & Dive ·{' '}
            <span className="text-amber-400 font-semibold">H</span> Hide HUD
          </span>
          <span className="md:hidden flex items-center justify-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-amber-400">Mobile Touch Ready:</strong> Virtual Joystick + Jump, Instant Hit/Spike, Set &amp; Shot Aim Pad!
            </span>
          </span>
        </div>
      </div>

      {/* Create Room Modal */}
      {activeModal === 'create_room' && (
        <div className="fixed inset-0 z-30 pointer-events-auto bg-black/70 flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleCreateRoomSubmit}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#0f172a] border border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-display font-bold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-amber-400" />
                <span>Create Match Room</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Team Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1v1', '2v2', '3v3'] as GameMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCreateMode(m)}
                    className={`py-2 rounded-xl font-bold text-sm border transition-colors cursor-pointer ${
                      createMode === m
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Points to Win</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([11, 15, 25] as const).map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      onClick={() => setPointsToWin(pts)}
                      className={`py-2 rounded-lg font-mono font-bold text-xs border cursor-pointer ${
                        pointsToWin === pts
                          ? 'bg-sky-400 text-slate-950 border-sky-300'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {pts}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Sets Format</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([1, 3] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBestOfSets(s)}
                      className={`py-2 rounded-lg font-bold text-xs border cursor-pointer ${
                        bestOfSets === s
                          ? 'bg-sky-400 text-slate-950 border-sky-300'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      Best of {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Net Height</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Men (2.43m)', val: NET_HEIGHT_MENS },
                  { label: 'Women (2.24m)', val: NET_HEIGHT_WOMENS },
                  { label: 'Arcade (2.10m)', val: NET_HEIGHT_ARCADE },
                ].map((nh) => (
                  <button
                    key={nh.label}
                    type="button"
                    onClick={() => setNetHeight(nh.val)}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      Math.abs(netHeight - nh.val) < 0.02
                        ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                        : 'bg-slate-900 text-slate-300 border-slate-700'
                    }`}
                  >
                    {nh.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fillBots}
                  onChange={(e) => setFillBots(e.target.checked)}
                  className="rounded accent-amber-400"
                />
                <span>Pre-fill empty slots with AI Bots</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded accent-amber-400"
                />
                <span>Public Room</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-extrabold text-sm tracking-wide cursor-pointer"
            >
              Create Room &amp; Open Lobby
            </button>
          </form>
        </div>
      )}

      {/* Join Room Modal */}
      {activeModal === 'join_room' && (
        <div className="fixed inset-0 z-30 pointer-events-auto bg-black/70 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#0f172a] border border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-display font-bold text-white">Join Room by Code</h2>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinRoomSubmit} className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="6-CHAR CODE (e.g. VK7X92)"
                className="flex-1 px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold tracking-widest uppercase text-sm focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm cursor-pointer"
              >
                Join
              </button>
            </form>

            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">Open Public Rooms</div>
              {publicRooms.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-xl">
                  No open public rooms right now. Tap &ldquo;Quick Lobby&rdquo; or create one!
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {publicRooms.map((r) => (
                    <div
                      key={r.code}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800"
                    >
                      <div>
                        <span className="font-mono font-bold text-amber-400 mr-2">{r.code}</span>
                        <span className="text-xs text-slate-300">
                          {r.mode} · {r.playerCount}/{r.maxPlayers} players · {r.pointsToWin} pts
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          socketClient.joinRoom(r.code);
                          setActiveModal('none');
                        }}
                        className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      {activeModal === 'how_to_play' && (
        <div className="fixed inset-0 z-30 pointer-events-auto bg-black/70 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#0f172a] border border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-display font-bold text-white">How to Play Volley Khelo</h2>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p>
                <strong className="text-amber-400">1. Rally Scoring &amp; Win by 2:</strong> Every rally awards a point! First team to 15 points (configurable 11/15/25) with a 2-point lead wins the set.
              </p>
              <p>
                <strong className="text-sky-400">2. 3-Touch Combination (Bump → Set → Spike):</strong> Your team gets up to <strong>3 touches</strong> to send the ball over the net. In 2v2 and 3v3, the same player cannot touch the ball twice in a row.
              </p>
              <p>
                <strong className="text-emerald-400">3. Desktop &amp; Mobile Touch Controls:</strong>
              </p>
              <ul className="space-y-1.5 text-xs bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                <li>• <strong>Move:</strong> WASD / Arrow Keys on Desktop, or Left Virtual Thumbstick on Mobile</li>
                <li>• <strong>Jump:</strong> Spacebar or <strong>JUMP</strong> button</li>
                <li>• <strong>Instant Hit / Spike / Serve:</strong> Left Click or <strong>HIT / SPIKE</strong> button when the ball is inside your green reach ring</li>
                <li>• <strong>High Set (Pass to Teammate):</strong> Press <strong>E / Right Click</strong> or tap <strong>SET PASS</strong></li>
                <li>• <strong>Sprint / Sand Dive:</strong> Hold <strong>Shift</strong> or toggle <strong>SPRINT ON</strong> / tap <strong>SAND DIVE</strong></li>
                <li>• <strong>Hide All HUDs:</strong> Press <strong>H</strong> or tap the <strong>HUD</strong> toggle button</li>
              </ul>
            </div>

            <button
              onClick={() => setActiveModal('none')}
              className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
            >
              Got It — Let&apos;s Play!
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-30 pointer-events-auto bg-black/70 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#0f172a] border border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-display font-bold text-white">Game Settings</h2>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-white">On-Screen Mobile Touch Controls</div>
                  <div className="text-[11px] text-slate-400">
                    Virtual thumbstick, Jump, Hit/Spike, Set &amp; Aim Pad
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleMobileControls}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    showMobileControls
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {showMobileControls ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sound Effects Volume ({Math.round(sfxVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sfxVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolumes(v, musicVolume);
                    soundManager.setVolumes(v, musicVolume);
                  }}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Beach Music Volume ({Math.round(musicVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolumes(sfxVolume, v);
                    soundManager.setVolumes(sfxVolume, v);
                  }}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mouse Aim Sensitivity ({mouseSensitivity.toFixed(1)}x)
                </label>
                <input
                  type="range"
                  min={0.4}
                  max={2.0}
                  step={0.1}
                  value={mouseSensitivity}
                  onChange={(e) => setMouseSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Graphics Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`py-2 rounded-lg text-xs font-bold uppercase border cursor-pointer ${
                        quality === q
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Arena Lighting Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['sunset', 'day', 'stadium'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`py-2 rounded-lg text-xs font-bold capitalize border cursor-pointer ${
                        theme === t
                          ? 'bg-sky-400 text-slate-950 border-sky-300'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveModal('none')}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
