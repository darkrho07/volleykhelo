'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  Bot,
  Trash2,
  Play,
  ArrowLeft,
  Send,
  Shield,
  CheckCircle2,
  Gamepad2,
} from 'lucide-react';
import { GameMode, QUICK_EMOTES, TeamId } from '../../shared';
import { soundManager } from '../../lib/audio';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';

export default function LobbyOverlay() {
  const { roomState, mySocketId, guestId, showMobileControls, toggleMobileControls } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState('');

  if (!roomState) return null;

  const me =
    roomState.players.find((p) => p.id === mySocketId) ||
    roomState.players.find((p) => p.guestId === guestId);
  const isHost = Boolean(me?.isHost || roomState.hostGuestId === guestId);

  const teamAPlayers = roomState.players.filter((p) => p.team === 'A');
  const teamBPlayers = roomState.players.filter((p) => p.team === 'B');
  const maxPerTeam = roomState.settings.maxPlayers / 2;

  const handleCopyInvite = () => {
    soundManager.playClick();
    const url = `${window.location.origin}/room/${roomState.code}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    socketClient.sendChat(chatText);
    setChatText('');
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-auto lg:pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 md:p-8 overflow-y-auto gap-3">
      {/* Top Room Header Bar */}
      <div className="pointer-events-auto w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 rounded-2xl bg-[#0f172a]/95 border border-slate-700 px-3.5 sm:px-5 py-2.5 sm:py-3.5 shadow-xl shrink-0">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          <button
            onClick={() => {
              soundManager.playClick();
              socketClient.leaveRoom();
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Leave</span>
          </button>

          <div>
            <div className="text-[10px] sm:text-xs text-slate-400">Room Code</div>
            <div className="font-mono font-extrabold text-base sm:text-xl text-amber-400 tracking-wider">
              {roomState.code}
            </div>
          </div>

          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                <span className="text-emerald-300">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
                <span>Invite Link</span>
              </>
            )}
          </button>
        </div>

        {/* Host Mode & Score Settings */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {(['1v1', '2v2', '3v3'] as GameMode[]).map((m) => (
            <button
              key={m}
              disabled={!isHost}
              onClick={() => socketClient.updateSettings({ mode: m })}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg font-mono font-bold text-xs border transition-colors ${
                roomState.settings.mode === m
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              } ${isHost ? 'cursor-pointer hover:border-slate-500' : 'opacity-75'}`}
            >
              {m}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          {([11, 15, 25] as const).map((pts) => (
            <button
              key={pts}
              disabled={!isHost}
              onClick={() => socketClient.updateSettings({ pointsToWin: pts })}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg font-mono font-bold text-xs border ${
                roomState.settings.pointsToWin === pts
                  ? 'bg-sky-400 text-slate-950 border-sky-300'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              } ${isHost ? 'cursor-pointer' : 'opacity-75'}`}
            >
              {pts} pts
            </button>
          ))}
        </div>
      </div>

      {/* Center Team Selection & Chat Grid */}
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 my-auto">
        {/* Team A Column */}
        <TeamRosterCard
          team="A"
          title="Team A · West Sand"
          accentClass="text-sky-400 border-sky-500/40"
          players={teamAPlayers}
          maxPerTeam={maxPerTeam}
          myId={me?.id || null}
          isHost={isHost}
        />

        {/* Team B Column */}
        <TeamRosterCard
          team="B"
          title="Team B · East Sand"
          accentClass="text-rose-400 border-rose-500/40"
          players={teamBPlayers}
          maxPerTeam={maxPerTeam}
          myId={me?.id || null}
          isHost={isHost}
        />

        {/* Lobby Chat & Emotes Panel */}
        <div className="pointer-events-auto md:col-span-2 lg:col-span-1 rounded-2xl bg-[#0f172a]/95 border border-slate-700 p-3.5 sm:p-4 flex flex-col h-56 lg:h-80 shadow-xl">
          <div className="text-xs font-bold text-slate-300 pb-2 border-b border-slate-800 mb-2">
            Room Chat &amp; Quick Emotes
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {roomState.chat.map((msg) => (
              <div key={msg.id} className="leading-snug">
                {msg.isSystem ? (
                  <span className="text-amber-300 font-medium">{msg.text}</span>
                ) : (
                  <>
                    <span
                      className={`font-bold mr-1.5 ${
                        msg.team === 'A' ? 'text-sky-400' : 'text-rose-400'
                      }`}
                    >
                      {msg.senderName}:
                    </span>
                    <span className={msg.isEmote ? 'text-amber-200 font-semibold' : 'text-slate-200'}>
                      {msg.text}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Quick Emote Buttons */}
          <div className="flex flex-wrap gap-1 my-2">
            {QUICK_EMOTES.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => socketClient.sendChat(em, true)}
                className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-amber-300 cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-1.5">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Send a message..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="p-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Action Bar: Ready Up, Touch Controls Toggle & Host Start Match */}
      <div className="pointer-events-auto w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#0f172a]/95 border border-slate-700 px-4 sm:px-6 py-3 sm:py-4 shadow-xl shrink-0">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span>
            Each team needs at least <strong>1 player</strong> (Human or Bot) to begin.
          </span>
          <button
            type="button"
            onClick={toggleMobileControls}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
              showMobileControls
                ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Touch Controls: {showMobileControls ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {!isHost && (
            <button
              onClick={() => {
                soundManager.playClick();
                socketClient.toggleReady();
              }}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-sm cursor-pointer transition-colors ${
                me?.isReady
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{me?.isReady ? 'Ready!' : 'Tap to Ready Up'}</span>
            </button>
          )}

          {isHost && (
            <button
              onClick={() => {
                soundManager.playClick();
                socketClient.startMatch();
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-display font-extrabold text-sm tracking-wide shadow-lg cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Start Match Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamRosterCard({
  team,
  title,
  accentClass,
  players,
  maxPerTeam,
  myId,
  isHost,
}: {
  team: TeamId;
  title: string;
  accentClass: string;
  players: NonNullable<ReturnType<typeof useGameStore.getState>['roomState']>['players'];
  maxPerTeam: number;
  myId: string | null;
  isHost: boolean;
}) {
  return (
    <div className="pointer-events-auto rounded-2xl bg-[#0f172a]/95 border border-slate-700 p-3.5 sm:p-4 flex flex-col justify-between min-h-[12rem] lg:h-80 shadow-xl">
      <div>
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
          <h3 className={`font-display font-extrabold text-sm sm:text-base ${accentClass.split(' ')[0]}`}>
            {title}
          </h3>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {players.length} / {maxPerTeam}
          </span>
        </div>

        <div className="space-y-2 max-h-40 lg:max-h-none overflow-y-auto">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center font-mono font-bold text-xs text-white shadow"
                  style={{ backgroundColor: p.outfitColor }}
                >
                  {p.jerseyNumber}
                </span>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{p.name}</span>
                    {p.id === myId && <span className="text-[10px] text-amber-400">(You)</span>}
                    {p.isHost && <Shield className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {p.isBot ? 'AI Bot' : p.isReady || p.isHost ? 'Ready' : 'Not Ready'}
                  </div>
                </div>
              </div>

              {isHost && p.isBot && (
                <button
                  onClick={() => socketClient.removeBot(p.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                  title="Remove Bot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-800">
        <button
          onClick={() => {
            soundManager.playClick();
            socketClient.selectTeam(team);
          }}
          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
        >
          Join Team {team}
        </button>

        {isHost && players.length < maxPerTeam && (
          <button
            onClick={() => {
              soundManager.playClick();
              socketClient.addBot(team);
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-amber-300 cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>+ Bot</span>
          </button>
        )}
      </div>
    </div>
  );
}
