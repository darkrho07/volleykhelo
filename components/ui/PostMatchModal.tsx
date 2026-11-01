'use client';

import React from 'react';
import { Trophy, Award, RotateCcw, Users } from 'lucide-react';
import { soundManager } from '../../lib/audio';
import { socketClient } from '../../lib/socketClient';
import { useGameStore } from '../../store/useGameStore';

export default function PostMatchModal() {
  const { roomState, latestSnapshot } = useGameStore();
  if (!roomState || roomState.phase !== 'match_over') return null;

  const players = latestSnapshot?.players || roomState.players;
  const winner = roomState.winnerTeam || 'A';
  const mvp = players.find((p) => p.id === roomState.mvpPlayerId) || players[0];

  return (
    <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0f172a] border border-slate-700 p-6 md:p-8 shadow-2xl space-y-6">
        {/* Winner Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-400 mb-1">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-black text-white">
            TEAM {winner} WINS THE MATCH!
          </h2>
          <p className="text-sm text-slate-300 font-mono tabular-nums">
            Sets Score: Team A {roomState.setsWon.teamA} — {roomState.setsWon.teamB} Team B
          </p>
        </div>

        {/* Match MVP Spotlight */}
        {mvp && (
          <div className="flex items-center justify-between px-5 py-4 rounded-xl bg-slate-900 border border-amber-400/50">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-400 text-slate-950">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Match MVP
                </div>
                <div className="text-lg font-display font-extrabold text-white">
                  {mvp.name} (Team {mvp.team})
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
              <div className="text-center">
                <div className="text-slate-400">PTS</div>
                <div className="text-base font-bold text-white">{mvp.stats.points}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400">SPIKES</div>
                <div className="text-base font-bold text-amber-400">{mvp.stats.spikes}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400">ACES</div>
                <div className="text-base font-bold text-sky-400">{mvp.stats.aces}</div>
              </div>
            </div>
          </div>
        )}

        {/* Full Player Stats Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-4">Athlete</th>
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3 text-right">Points</th>
                <th className="py-2.5 px-3 text-right">Spikes</th>
                <th className="py-2.5 px-3 text-right">Aces</th>
                <th className="py-2.5 px-4 text-right">Touches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
              {players.map((p) => (
                <tr key={p.id} className="bg-slate-950/60">
                  <td className="py-2.5 px-4 font-sans font-bold text-white">{p.name}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={
                        p.team === 'A' ? 'text-sky-400 font-bold' : 'text-rose-400 font-bold'
                      }
                    >
                      Team {p.team}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">{p.stats.points}</td>
                  <td className="py-2.5 px-3 text-right text-amber-300">{p.stats.spikes}</td>
                  <td className="py-2.5 px-3 text-right text-sky-300">{p.stats.aces}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{p.stats.touches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Post-Match Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            onClick={() => {
              soundManager.playClick();
              socketClient.returnToLobby();
            }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Back to Lobby</span>
          </button>

          <button
            onClick={() => {
              soundManager.playClick();
              socketClient.rematch();
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-display font-extrabold text-sm cursor-pointer shadow-lg"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Rematch</span>
          </button>
        </div>
      </div>
    </div>
  );
}
