import React from 'react';
import {
  Activity,
  Copy,
  Link2,
  Link2Off,
  RotateCcw,
  Sliders,
  Shield,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { audioEngine } from '../audio/audio-engine';
import { DSPStatus } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { AuthUser } from '../services/auth-service';

interface HeaderProps {
  id?: string;
  status: DSPStatus;
  isLinked: boolean;
  currentPresetName: string;
  currentUser?: AuthUser | null;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
  onToggleLink: () => void;
  onOpenPresets: () => void;
  onCopyLToR: () => void;
  onCopyRToL: () => void;
  onResetL: () => void;
  onResetR: () => void;
  onResetAll: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  id,
  status,
  isLinked,
  currentPresetName,
  currentUser,
  onOpenAdmin,
  onLogout,
  onToggleLink,
  onOpenPresets,
  onCopyLToR,
  onCopyRToL,
  onResetL,
  onResetR,
  onResetAll,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'DSP ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-600/50 shadow-sm shadow-emerald-900/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            DSP ACTIVE
          </span>
        );
      case 'FALLBACK MODE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-600/50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            FALLBACK MODE
          </span>
        );
      case 'DSP UNAVAILABLE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-600/50">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            DSP UNAVAILABLE
          </span>
        );
    }
  };

  return (
    <header
      id={id}
      className="bg-neutral-900/90 border-b border-neutral-800 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-700 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-900/20">
              <img
                src="/icon.svg"
                alt="DLMS Virtual Logo"
                className="w-full h-full rounded-[6px]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white font-sans">
                  DLMS <span className="text-cyan-400">VIRTUAL</span>
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  2-CH STEREO DSP
                </span>
              </div>
              <p className="text-[10px] font-mono text-neutral-400 -mt-0.5">
                Digital Loudspeaker Management System
              </p>
            </div>
          </div>

          <div className="ml-1 sm:ml-3">{getStatusBadge()}</div>
        </div>

        {/* Global Toolbar: LINK L/R, Copy, Presets, PWA Install */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {/* Preset Selector Button */}
          <button
            id="btn-open-presets"
            onClick={onOpenPresets}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition cursor-pointer"
            title="Kelola Preset DSP"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline text-neutral-400">Preset:</span>
            <span className="font-semibold text-neutral-100 max-w-[120px] truncate">
              {currentPresetName}
            </span>
          </button>

          {/* LINK L/R Toggle */}
          <button
            id="btn-toggle-link"
            onClick={onToggleLink}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              isLinked
                ? 'bg-cyan-950 text-cyan-300 border-cyan-500 shadow-sm shadow-cyan-500/20'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
            }`}
            title={isLinked ? 'LINK L/R Aktif: Pengaturan L disinkronkan ke R' : 'LINK L/R Mati: L & R Independen'}
          >
            {isLinked ? (
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Link2Off className="w-3.5 h-3.5 text-neutral-500" />
            )}
            <span>LINK L/R</span>
          </button>

          {/* Copy Tools */}
          <div className="hidden sm:flex items-center bg-neutral-950 rounded-lg border border-neutral-800 p-0.5">
            <button
              id="btn-copy-l-to-r"
              onClick={onCopyLToR}
              className="px-2 py-1 text-[11px] rounded text-neutral-300 hover:text-cyan-400 hover:bg-neutral-800 transition"
              title="Salin parameter INPUT L ke INPUT R"
            >
              Copy L → R
            </button>
            <button
              id="btn-copy-r-to-l"
              onClick={onCopyRToL}
              className="px-2 py-1 text-[11px] rounded text-neutral-300 hover:text-amber-400 hover:bg-neutral-800 transition"
              title="Salin parameter INPUT R ke INPUT L"
            >
              Copy R → L
            </button>
          </div>

          {/* Reset Dropdown/Buttons */}
          <div className="hidden sm:flex items-center bg-neutral-950 rounded-lg border border-neutral-800 p-0.5">
            <button
              id="btn-reset-l"
              onClick={onResetL}
              className="px-2 py-1 text-[11px] rounded text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
              title="Reset default INPUT L"
            >
              Reset L
            </button>
            <button
              id="btn-reset-r"
              onClick={onResetR}
              className="px-2 py-1 text-[11px] rounded text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
              title="Reset default INPUT R"
            >
              Reset R
            </button>
            <button
              id="btn-reset-all"
              onClick={onResetAll}
              className="px-2 py-1 text-[11px] rounded text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
              title="Reset Semua Saluran"
            >
              Reset All
            </button>
          </div>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Security / Admin Controls */}
          {currentUser && (
            <div className="flex items-center gap-1.5 ml-1 pl-1.5 border-l border-neutral-800">
              {currentUser.role === 'admin' ? (
                <button
                  id="btn-open-admin-panel"
                  onClick={onOpenAdmin}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition shadow-sm shadow-amber-500/20 cursor-pointer text-xs"
                  title="Buka Security & License Admin Panel"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ADMIN PANEL</span>
                </button>
              ) : (
                <span
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-800/80 text-emerald-400 border border-emerald-900/50 text-[10px] font-bold"
                  title={`Activated user ID: ${currentUser.userId}`}
                >
                  <KeyRound className="w-3 h-3" />
                  <span>ACTIVE</span>
                </span>
              )}

              {onLogout && (
                <button
                  id="btn-auth-logout"
                  onClick={onLogout}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-rose-950/80 hover:text-rose-400 text-neutral-400 border border-neutral-700 hover:border-rose-800/80 transition cursor-pointer text-xs"
                  title="Kunci / Keluar dari DLMS Virtual"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">LOCK</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
