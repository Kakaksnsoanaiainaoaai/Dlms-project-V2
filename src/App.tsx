/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { audioEngine } from './audio/audio-engine';
import { AudioSourceBar } from './components/AudioSourceBar';
import { ChannelDSPView } from './components/ChannelDSPView';
import { Header } from './components/Header';
import { PresetModal } from './components/PresetModal';
import { RoutingDiagram } from './components/RoutingDiagram';
import { SpectrumRTA } from './components/SpectrumRTA';
import { SecureAccess } from './components/SecureAccess';
import { AdminPanel } from './components/AdminPanel';
import { authService, AuthUser } from './services/auth-service';
import { Loader2, Sliders } from 'lucide-react';
import {
  AudioPlaybackState,
  ChannelConfig,
  ChannelMeterData,
  DSPPreset,
  DSPStatus,
  SubMode,
} from './types';

const initialMeterData: ChannelMeterData = {
  inputLevel: -100,
  processingLevel: -100,
  outputLevel: -100,
  peak: -100,
  rms: -100,
  peakRaw: 0,
  rmsRaw: 0,
  isClipping: false,
  compReduction: 0,
  limiterReduction: 0,
};

export default function App() {
  // Security Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(authService.getStoredUser());
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'DLMS' | 'ADMIN'>('DLMS');
  const [authError, setAuthError] = useState<string | null>(null);

  const [status, setStatus] = useState<DSPStatus>(audioEngine.getStatus());
  const [playbackState, setPlaybackState] = useState<AudioPlaybackState>(audioEngine.getPlaybackState());
  const [configL, setConfigL] = useState<ChannelConfig>(audioEngine.configL);
  const [configR, setConfigR] = useState<ChannelConfig>(audioEngine.configR);
  const [isLinked, setIsLinked] = useState<boolean>(audioEngine.isLinked);
  const [meters, setMeters] = useState<{ L: ChannelMeterData; R: ChannelMeterData }>({
    L: initialMeterData,
    R: initialMeterData,
  });

  const [presets, setPresets] = useState<DSPPreset[]>(audioEngine.presets);
  const [currentPresetId, setCurrentPresetId] = useState<string>(audioEngine.currentPresetId);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);

  // Verify initial session and run periodic server-side heartbeat
  useEffect(() => {
    let isMounted = true;

    const verify = async () => {
      const res = await authService.checkSession();
      if (!isMounted) return;
      if (res.valid && res.user) {
        setCurrentUser(res.user);
        setAuthError(null);
      } else {
        setCurrentUser(null);
        if (res.error && res.error !== 'NO_TOKEN') {
          setAuthError(res.error);
        }
      }
      setIsAuthChecking(false);
    };

    verify();

    // Heartbeat every 25s: if server revoked key/session, kick out immediately
    const interval = setInterval(async () => {
      if (authService.getToken()) {
        const check = await authService.checkSession();
        if (!check.valid && isMounted) {
          audioEngine.stop();
          setCurrentUser(null);
          setAuthError(check.error || 'SESSION REVOKED BY ADMINISTRATOR');
        }
      }
    }, 25000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle Logout
  const handleLogout = async () => {
    audioEngine.stop();
    await authService.logout();
    setCurrentUser(null);
    setViewMode('DLMS');
    setAuthError(null);
  };

  // Subscribe to Audio Engine events
  useEffect(() => {
    const unsubStatus = audioEngine.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });

    const unsubState = audioEngine.subscribeState((newState) => {
      setPlaybackState(newState);
    });

    const unsubMeters = audioEngine.subscribeMeters((newMeters) => {
      setMeters(newMeters);
    });

    return () => {
      unsubStatus();
      unsubState();
      unsubMeters();
    };
  }, []);

  // Sync component state when config changes
  const handleConfigChangeL = (patch: Partial<ChannelConfig>) => {
    audioEngine.updateChannelL(patch);
    setConfigL({ ...audioEngine.configL });
    setConfigR({ ...audioEngine.configR });
  };

  const handleConfigChangeR = (patch: Partial<ChannelConfig>) => {
    audioEngine.updateChannelR(patch);
    setConfigR({ ...audioEngine.configR });
    setConfigL({ ...audioEngine.configL });
  };

  const handleSubModeL = (mode: SubMode) => {
    audioEngine.setSubModeL(mode);
    setConfigL({ ...audioEngine.configL });
    setConfigR({ ...audioEngine.configR });
  };

  const handleSubModeR = (mode: SubMode) => {
    audioEngine.setSubModeR(mode);
    setConfigR({ ...audioEngine.configR });
    setConfigL({ ...audioEngine.configL });
  };

  const handleToggleLink = () => {
    const linked = audioEngine.toggleLink();
    setIsLinked(linked);
    setConfigL({ ...audioEngine.configL });
    setConfigR({ ...audioEngine.configR });
  };

  const handleCopyLToR = () => {
    audioEngine.copyLToR();
    setConfigR({ ...audioEngine.configR });
  };

  const handleCopyRToL = () => {
    audioEngine.copyRToL();
    setConfigL({ ...audioEngine.configL });
  };

  const handleResetL = () => {
    audioEngine.resetChannelL();
    setConfigL({ ...audioEngine.configL });
    if (audioEngine.isLinked) {
      setConfigR({ ...audioEngine.configR });
    }
  };

  const handleResetR = () => {
    audioEngine.resetChannelR();
    setConfigR({ ...audioEngine.configR });
    if (audioEngine.isLinked) {
      setConfigL({ ...audioEngine.configL });
    }
  };

  const handleResetAll = () => {
    audioEngine.resetAll();
    setIsLinked(false);
    setConfigL({ ...audioEngine.configL });
    setConfigR({ ...audioEngine.configR });
  };

  const handlePresetSelect = (presetId: string) => {
    if (audioEngine.loadPreset(presetId)) {
      setCurrentPresetId(presetId);
      setConfigL({ ...audioEngine.configL });
      setConfigR({ ...audioEngine.configR });
    }
  };

  const handlePresetsChanged = () => {
    setPresets([...audioEngine.presets]);
    setCurrentPresetId(audioEngine.currentPresetId);
  };

  const handleAudioFileSelected = (file: File) => {
    audioEngine.loadAudioFile(file);
  };

  const currentPresetName =
    presets.find((p) => p.id === currentPresetId)?.name || 'Default';

  // 1. Initial Auth Checking State
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center font-mono text-xs text-neutral-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="tracking-widest uppercase text-[11px] text-neutral-500">
          VERIFYING HARDWARE LICENSE & SESSION...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Show Secure Access (Activation Key or Admin Login)
  if (!currentUser) {
    return (
      <SecureAccess
        initialError={authError}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setAuthError(null);
          if (user.role === 'admin') {
            setViewMode('ADMIN');
          } else {
            setViewMode('DLMS');
          }
        }}
      />
    );
  }

  // 3. Admin Panel View
  if (currentUser && viewMode === 'ADMIN') {
    return (
      <AdminPanel
        currentUser={currentUser}
        onOpenDLMS={() => setViewMode('DLMS')}
        onLogout={handleLogout}
      />
    );
  }

  // 4. Authenticated DLMS Virtual DSP Interface
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Header with Status, Global Actions, and Auth Controls */}
      <Header
        id="app-header"
        status={status}
        isLinked={isLinked}
        currentPresetName={currentPresetName}
        currentUser={currentUser}
        onOpenAdmin={() => setViewMode('ADMIN')}
        onLogout={handleLogout}
        onToggleLink={handleToggleLink}
        onOpenPresets={() => setIsPresetModalOpen(true)}
        onCopyLToR={handleCopyLToR}
        onCopyRToL={handleCopyRToL}
        onResetL={handleResetL}
        onResetR={handleResetR}
        onResetAll={handleResetAll}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        {/* Audio Context Click-to-Start Banner if not yet active */}
        {status !== 'DSP ACTIVE' && (
          <div className="bg-cyan-950/60 border border-cyan-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span className="text-cyan-200">
                Web Audio Engine membutuhkan izin pengguna untuk mulai memproses sinyal DSP.
              </span>
            </div>
            <button
              onClick={() => audioEngine.initAudioContext()}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-bold text-white transition cursor-pointer"
            >
              Aktifkan DSP AudioContext
            </button>
          </div>
        )}

        {/* Audio Source Bar (Load File, Play/Pause/Stop/Seek/Volume) */}
        <AudioSourceBar
          id="audio-source-bar"
          playbackState={playbackState}
          onAudioFileSelected={handleAudioFileSelected}
        />

        {/* Real-time Spectrum Analyzer / RTA */}
        <SpectrumRTA
          id="main-spectrum-rta"
          onSyncConfigs={() => {
            setConfigL({ ...audioEngine.configL });
            setConfigR({ ...audioEngine.configR });
          }}
        />

        {/* 2-CHANNEL STEREO DSP PROCESSING (INPUT L & INPUT R) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* INPUT L CHANNEL */}
          <ChannelDSPView
            id="dsp-channel-l"
            config={configL}
            meter={meters.L}
            onChange={handleConfigChangeL}
            onSubModeChange={handleSubModeL}
            onClearClip={() => audioEngine.channelL?.clearClip()}
          />

          {/* INPUT R CHANNEL */}
          <ChannelDSPView
            id="dsp-channel-r"
            config={configR}
            meter={meters.R}
            onChange={handleConfigChangeR}
            onSubModeChange={handleSubModeR}
            onClearClip={() => audioEngine.channelR?.clearClip()}
          />
        </div>

        {/* Architecture & Routing Diagram */}
        <RoutingDiagram />
      </main>

      {/* Preset Modal */}
      <PresetModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        presets={presets}
        currentPresetId={currentPresetId}
        onPresetSelected={handlePresetSelect}
        onPresetsChanged={handlePresetsChanged}
      />

      {/* Footer */}
      <footer className="py-4 text-center text-xs font-mono text-neutral-600 border-t border-neutral-900">
        DLMS Virtual • Digital Loudspeaker Management System • Web Audio API Realtime DSP • Offline PWA
      </footer>
    </div>
  );
}
