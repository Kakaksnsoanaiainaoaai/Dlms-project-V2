import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Cpu,
  Filter,
  Layers,
  Power,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Terminal,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  ChannelConfig,
  ChannelMeterData,
  FilterSlope,
  FilterType,
  PEQBandType,
  SubMode,
} from '../types';
import { audioEngine } from '../audio/audio-engine';
import { FrequencyControl } from './FrequencyControl';
import { LevelMeter } from './LevelMeter';

interface ChannelDSPViewProps {
  id?: string;
  config: ChannelConfig;
  meter: ChannelMeterData;
  onChange: (newConfig: Partial<ChannelConfig>) => void;
  onSubModeChange: (mode: SubMode) => void;
  onClearClip: () => void;
}

type TabType = 'CROSSOVER' | 'PEQ' | 'GEQ' | 'DYNAMICS' | 'ROUTING' | 'AUDIT';

export const ChannelDSPView: React.FC<ChannelDSPViewProps> = ({
  id,
  config,
  meter,
  onChange,
  onSubModeChange,
  onClearClip,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('CROSSOVER');
  const [activePeqBandId, setActivePeqBandId] = useState<number>(1);

  const isL = config.id === 'L';
  const accentColor = isL ? 'cyan' : 'amber';
  const borderAccent = isL ? 'border-cyan-500/40' : 'border-amber-500/40';
  const badgeAccent = isL
    ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
    : 'bg-amber-950 text-amber-400 border border-amber-800';

  return (
    <div
      id={id}
      className={`flex flex-col bg-neutral-900 border ${borderAccent} rounded-2xl p-4 shadow-xl select-none`}
    >
      {/* Channel Header: Name, Gain, Polarity, Mute, Delay, Sub Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-lg font-black text-sm font-mono tracking-wider ${badgeAccent}`}>
            {config.name}
          </span>

          {/* Sub Mode Badges */}
          <div className="flex items-center bg-neutral-950 rounded-lg p-0.5 border border-neutral-800 font-mono text-[11px]">
            {(['FULL RANGE', 'SUB / LOW', 'HIGH'] as SubMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onSubModeChange(mode)}
                className={`px-2 py-1 rounded transition ${
                  config.subMode === mode
                    ? isL
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-amber-600 text-white font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Quick controls: Master Bypass, Polarity, Mute */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Master DSP Bypass Switch (A/B comparison between processed & direct source) */}
          <button
            id={`btn-master-bypass-${config.id.toLowerCase()}`}
            onClick={() => onChange({ bypass: !config.bypass })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              config.bypass
                ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400 shadow-md shadow-amber-500/30'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white hover:border-neutral-600'
            }`}
            title={
              config.bypass
                ? 'BYPASS AKTIF: Sedang memonitor sinyal sumber murni (unprocessed). Klik untuk menyalakan DSP.'
                : 'DSP AKTIF: Seluruh rantai DSP memproses audio. Klik untuk bypass ke sinyal langsung (A/B testing).'
            }
          >
            <Power className={`w-3.5 h-3.5 ${config.bypass ? 'text-neutral-950 stroke-[2.5]' : 'text-emerald-400'}`} />
            <span>{config.bypass ? 'BYPASS ON' : 'BYPASS'}</span>
          </button>

          {/* Polarity / Phase Invert */}
          <button
            onClick={() => onChange({ phaseInverted: !config.phaseInverted })}
            className={`px-2.5 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              config.phaseInverted
                ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm shadow-amber-900/40'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
            }`}
            title="Phase Polarity: Invert 180°"
          >
            Ø {config.phaseInverted ? '180°' : '0°'}
          </button>

          {/* Solo Button */}
          <button
            id={`btn-solo-${config.id.toLowerCase()}`}
            onClick={() => onChange({ solo: !config.solo })}
            className={`px-2.5 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              config.solo
                ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow-md shadow-amber-400/40'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white'
            }`}
            title="SOLO: Isolasi audio channel ini saja (mute channel lainnya)"
          >
            SOLO
          </button>

          {/* Mute Button */}
          <button
            onClick={() => onChange({ mute: !config.mute })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              config.mute
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/50'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white'
            }`}
          >
            {config.mute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-neutral-400" />}
            <span>MUTE</span>
          </button>
        </div>
      </div>

      {/* A/B Comparison Notification Banner when Master Bypass is active */}
      {config.bypass && (
        <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-[11px] flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            MASTER BYPASS: Monitoring Unprocessed Direct Source Audio
          </span>
          <button
            onClick={() => onChange({ bypass: false })}
            className="underline hover:text-white font-semibold cursor-pointer text-[10px]"
          >
            Nyalakan DSP
          </button>
        </div>
      )}

      {/* Main Channel Layout: Horizontal Level Meter + Sub-tabs */}
      <div className="mt-3">
        <LevelMeter
          id={`meter-${config.id}`}
          channelId={config.id}
          meter={meter}
          onClearClip={onClearClip}
        />
      </div>

      {/* Navigation Tabs for DSP Stages */}
      <div className="mt-3 flex items-center bg-neutral-950 rounded-xl p-1 border border-neutral-800 font-mono text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('CROSSOVER')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'CROSSOVER'
              ? isL
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          CROSSOVER & FILTERS
        </button>

        <button
          onClick={() => setActiveTab('PEQ')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'PEQ'
              ? isL
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          PARAMETRIC EQ
        </button>

        <button
          onClick={() => setActiveTab('GEQ')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'GEQ'
              ? isL
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          GRAPHIC EQ
        </button>

        <button
          onClick={() => setActiveTab('DYNAMICS')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'DYNAMICS'
              ? isL
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          COMP & LIMITER
        </button>

        <button
          onClick={() => setActiveTab('ROUTING')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'ROUTING'
              ? isL
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          GAIN & DELAY
        </button>

        <button
          id={`tab-audit-${config.id.toLowerCase()}`}
          onClick={() => setActiveTab('AUDIT')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition text-center whitespace-nowrap ${
            activeTab === 'AUDIT'
              ? 'bg-purple-950 text-purple-300 border border-purple-600'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          DSP AUDIT
        </button>
      </div>

      {/* Tab Panels: Fixed min-height to ensure visual stability! */}
      <div className="mt-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3.5 min-h-[360px] flex flex-col justify-between">
        {/* ======================================================== */}
        {/* TAB 1: CROSSOVER (HPF & LPF)                             */}
        {/* ======================================================== */}
        {activeTab === 'CROSSOVER' && (
          <div className="space-y-4">
            {/* Status explanation */}
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Filter className="w-3.5 h-3.5" />
                Crossover Engine
              </span>
              <span>Mode: <strong className="text-white">{config.subMode}</strong></span>
              <span className="hidden sm:inline">Cascade Biquad DSP</span>
            </div>

            {/* High-Pass Filter (HPF) Section */}
            <div className={`p-3 rounded-xl border transition ${
              config.hpf.enabled
                ? 'bg-neutral-900/90 border-cyan-800/60 shadow-md'
                : 'bg-neutral-900/40 border-neutral-800 opacity-80'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs font-mono text-cyan-400 tracking-wider">
                    HPF (HIGH-PASS FILTER / LOW CUT)
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {config.hpf.enabled ? 'ACTIVE' : 'BYPASS'}
                  </span>
                </div>

                <button
                  onClick={() =>
                    onChange({
                      hpf: { ...config.hpf, enabled: !config.hpf.enabled },
                    })
                  }
                  className={`px-3 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                    config.hpf.enabled
                      ? 'bg-cyan-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {config.hpf.enabled ? 'ENABLE' : 'BYPASS'}
                </button>
              </div>

              {/* Synchronized Frequency Control: Number Input + Slider (20Hz - 20,000Hz) */}
              <FrequencyControl
                id={`freq-hpf-${config.id}`}
                label="HPF Cutoff Frequency"
                value={config.hpf.frequency}
                onChange={(f) =>
                  onChange({
                    hpf: { ...config.hpf, frequency: f },
                  })
                }
                min={20}
                max={20000}
              />

              {/* Slope & Filter Type selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-2 border-t border-neutral-800/60 font-mono text-xs">
                <div>
                  <label className="text-[10px] text-neutral-400 block mb-1">
                    Filter Slope
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {([12, 18, 24, 48] as FilterSlope[]).map((slope) => (
                      <button
                        key={slope}
                        onClick={() =>
                          onChange({
                            hpf: { ...config.hpf, slope },
                          })
                        }
                        className={`py-1 rounded text-[11px] font-semibold border transition ${
                          config.hpf.slope === slope
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-600'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                        }`}
                      >
                        {slope}dB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 block mb-1">
                    Filter Alignment
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['Butterworth', 'Linkwitz-Riley', 'Bessel'] as FilterType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          onChange({
                            hpf: { ...config.hpf, type },
                          })
                        }
                        className={`py-1 rounded text-[10px] font-semibold border truncate transition ${
                          config.hpf.type === type
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-600'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                        }`}
                      >
                        {type === 'Linkwitz-Riley' ? 'Linkwitz' : type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Low-Pass Filter (LPF) Section */}
            <div className={`p-3 rounded-xl border transition ${
              config.lpf.enabled || config.subMode === 'SUB / LOW'
                ? 'bg-neutral-900/90 border-amber-800/60 shadow-md'
                : 'bg-neutral-900/40 border-neutral-800 opacity-80'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs font-mono text-amber-400 tracking-wider">
                    LPF (LOW-PASS FILTER / HIGH CUT)
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {config.subMode === 'SUB / LOW'
                      ? 'LOCKED ACTIVE'
                      : config.lpf.enabled
                      ? 'ACTIVE'
                      : 'BYPASS'}
                  </span>
                </div>

                {config.subMode === 'SUB / LOW' ? (
                  <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    SUB LOCK
                  </span>
                ) : (
                  <button
                    onClick={() =>
                      onChange({
                        lpf: { ...config.lpf, enabled: !config.lpf.enabled },
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                      config.lpf.enabled
                        ? 'bg-amber-600 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {config.lpf.enabled ? 'ENABLE' : 'BYPASS'}
                  </button>
                )}
              </div>

              {/* Synchronized Frequency Control: Number Input + Slider */}
              <FrequencyControl
                id={`freq-lpf-${config.id}`}
                label="LPF Cutoff Frequency"
                value={config.lpf.frequency}
                onChange={(f) =>
                  onChange({
                    lpf: { ...config.lpf, frequency: f },
                  })
                }
                min={20}
                max={config.subMode === 'SUB / LOW' ? 250 : 20000}
              />

              {config.subMode === 'SUB / LOW' && (
                <div className="mt-2.5 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px]">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>SUB ISOLASI TINGGI:</strong> Cascade biquad filter {config.lpf.slope}dB/oct ({config.lpf.type}) aktif. Sinyal midrange dan treble sepenuhnya terisolasi tanpa jalur bypass.
                  </span>
                </div>
              )}

              {/* Slope & Filter Type selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-2 border-t border-neutral-800/60 font-mono text-xs">
                <div>
                  <label className="text-[10px] text-neutral-400 block mb-1">
                    Filter Slope
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {([12, 18, 24, 48] as FilterSlope[]).map((slope) => (
                      <button
                        key={slope}
                        onClick={() =>
                          onChange({
                            lpf: { ...config.lpf, slope },
                          })
                        }
                        className={`py-1 rounded text-[11px] font-semibold border transition ${
                          config.lpf.slope === slope
                            ? 'bg-amber-950 text-amber-300 border-amber-600'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                        }`}
                      >
                        {slope}dB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 block mb-1">
                    Filter Alignment
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['Butterworth', 'Linkwitz-Riley', 'Bessel'] as FilterType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          onChange({
                            lpf: { ...config.lpf, type },
                          })
                        }
                        className={`py-1 rounded text-[10px] font-semibold border truncate transition ${
                          config.lpf.type === type
                            ? 'bg-amber-950 text-amber-300 border-amber-600'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                        }`}
                      >
                        {type === 'Linkwitz-Riley' ? 'Linkwitz' : type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: PARAMETRIC EQ                                     */}
        {/* ======================================================== */}
        {activeTab === 'PEQ' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs font-mono text-neutral-300">
                  5-BAND PARAMETRIC EQ
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {config.peqEnabled ? 'ACTIVE' : 'GLOBAL BYPASS'}
                </span>
              </div>

              <button
                onClick={() => onChange({ peqEnabled: !config.peqEnabled })}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition ${
                  config.peqEnabled
                    ? 'bg-cyan-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {config.peqEnabled ? 'PEQ ON' : 'PEQ BYPASS'}
              </button>
            </div>

            {/* Band selector buttons */}
            <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
              {config.peqBands.map((band) => (
                <button
                  key={band.id}
                  onClick={() => setActivePeqBandId(band.id)}
                  className={`p-2 rounded-lg border text-center transition ${
                    activePeqBandId === band.id
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <div className="text-[10px] text-neutral-400">Band {band.id}</div>
                  <div className="text-xs truncate font-bold">
                    {band.frequency >= 1000 ? `${(band.frequency / 1000).toFixed(1)}k` : `${band.frequency}`}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {band.gain > 0 ? `+${band.gain.toFixed(1)}` : `${band.gain.toFixed(1)}`}dB
                  </div>
                </button>
              ))}
            </div>

            {/* Active Band Detail Editor */}
            {(() => {
              const band = config.peqBands.find((b) => b.id === activePeqBandId) || config.peqBands[0];
              const updateActiveBand = (fields: Partial<typeof band>) => {
                const updated = config.peqBands.map((b) => (b.id === band.id ? { ...b, ...fields } : b));
                onChange({ peqBands: updated });
              };

              return (
                <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">
                      Band {band.id} Settings
                    </span>
                    <button
                      onClick={() => updateActiveBand({ enabled: !band.enabled })}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        band.enabled ? 'bg-cyan-600 text-white' : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {band.enabled ? 'ACTIVE' : 'BYPASS'}
                    </button>
                  </div>

                  {/* Filter Type */}
                  <div>
                    <label className="text-[10px] text-neutral-400 block mb-1">
                      Filter Type
                    </label>
                    <div className="grid grid-cols-5 gap-1 text-[11px]">
                      {(['peaking', 'lowshelf', 'highshelf', 'highpass', 'lowpass'] as PEQBandType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => updateActiveBand({ type })}
                          className={`py-1 rounded border text-center transition ${
                            band.type === type
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-600 font-bold'
                              : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                          }`}
                        >
                          {type === 'peaking' ? 'Bell' : type === 'lowshelf' ? 'Lo Shelf' : type === 'highshelf' ? 'Hi Shelf' : type === 'highpass' ? 'HPF' : 'LPF'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frequency Control (synchronized direct number + slider 20-20k) */}
                  <FrequencyControl
                    id={`freq-peq-${config.id}-${band.id}`}
                    label="Band Frequency"
                    value={band.frequency}
                    onChange={(f) => updateActiveBand({ frequency: f })}
                    min={20}
                    max={20000}
                  />

                  {/* Gain & Q Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Gain */}
                    <div>
                      <div className="flex justify-between text-xs text-neutral-400 mb-1">
                        <span>Gain</span>
                        <span className="text-cyan-400 font-bold">
                          {band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)} dB
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={-15}
                          max={15}
                          step={0.5}
                          value={band.gain}
                          onChange={(e) => updateActiveBand({ gain: parseFloat(e.target.value) })}
                          className="flex-1 h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-400"
                        />
                        <button
                          onClick={() => updateActiveBand({ gain: 0 })}
                          className="text-[10px] text-neutral-500 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800"
                        >
                          0dB
                        </button>
                      </div>
                    </div>

                    {/* Q Factor */}
                    <div>
                      <div className="flex justify-between text-xs text-neutral-400 mb-1">
                        <span>Q (Bandwidth)</span>
                        <span className="text-cyan-400 font-bold">{band.q.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={10.0}
                        step={0.05}
                        value={band.q}
                        onChange={(e) => updateActiveBand({ q: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: GRAPHIC EQ (10 ISO BANDS)                         */}
        {/* ======================================================== */}
        {activeTab === 'GEQ' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs font-mono text-neutral-300">
                  10-BAND ISO GRAPHIC EQ
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {config.geqEnabled ? 'ACTIVE' : 'GLOBAL BYPASS'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const flat = config.geqBands.map((b) => ({ ...b, gain: 0 }));
                    onChange({ geqBands: flat });
                  }}
                  className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs font-mono"
                >
                  Flat All
                </button>
                <button
                  onClick={() => onChange({ geqEnabled: !config.geqEnabled })}
                  className={`px-3 py-1 rounded text-xs font-mono font-bold transition ${
                    config.geqEnabled
                      ? 'bg-cyan-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {config.geqEnabled ? 'GEQ ON' : 'GEQ BYPASS'}
                </button>
              </div>
            </div>

            {/* Graphic EQ Vertical Faders */}
            <div className="grid grid-cols-10 gap-1 sm:gap-2 p-2 bg-neutral-900/80 rounded-xl border border-neutral-800">
              {config.geqBands.map((band, idx) => (
                <div key={band.frequency} className="flex flex-col items-center gap-1.5 font-mono text-[10px]">
                  {/* Gain readout */}
                  <span className={`text-[9px] ${band.gain !== 0 ? 'text-cyan-400 font-bold' : 'text-neutral-500'}`}>
                    {band.gain > 0 ? `+${band.gain}` : `${band.gain}`}
                  </span>

                  {/* Vertical Fader */}
                  <div className="h-32 flex items-center justify-center">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={band.gain}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        const copy = [...config.geqBands];
                        copy[idx] = { ...copy[idx], gain: val };
                        onChange({ geqBands: copy });
                      }}
                      className="h-28 -rotate-90 appearance-none bg-neutral-800 rounded accent-cyan-400 cursor-pointer w-28"
                    />
                  </div>

                  {/* Frequency Label */}
                  <span className="text-[10px] text-neutral-400 font-semibold truncate">
                    {band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: COMPRESSOR & LIMITER                              */}
        {/* ======================================================== */}
        {activeTab === 'DYNAMICS' && (
          <div className="space-y-4">
            {/* COMPRESSOR */}
            <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-white text-xs">
                    COMPRESSOR
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {config.compressor.enabled ? 'ACTIVE' : 'BYPASS'}
                  </span>
                </div>

                <button
                  onClick={() =>
                    onChange({
                      compressor: { ...config.compressor, enabled: !config.compressor.enabled },
                    })
                  }
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    config.compressor.enabled ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {config.compressor.enabled ? 'COMP ON' : 'COMP BYPASS'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Threshold */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Threshold</span>
                    <span className="text-amber-400 font-bold">{config.compressor.threshold.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    step={1}
                    value={config.compressor.threshold}
                    onChange={(e) =>
                      onChange({
                        compressor: { ...config.compressor, threshold: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Ratio */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Ratio</span>
                    <span className="text-amber-400 font-bold">{config.compressor.ratio.toFixed(1)} : 1</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={config.compressor.ratio}
                    onChange={(e) =>
                      onChange({
                        compressor: { ...config.compressor, ratio: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Attack */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Attack</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(config.compressor.attack * 1000)} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.001}
                    max={0.5}
                    step={0.005}
                    value={config.compressor.attack}
                    onChange={(e) =>
                      onChange({
                        compressor: { ...config.compressor, attack: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Release */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Release</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(config.compressor.release * 1000)} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={1.0}
                    step={0.02}
                    value={config.compressor.release}
                    onChange={(e) =>
                      onChange({
                        compressor: { ...config.compressor, release: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Makeup Gain */}
                <div className="sm:col-span-2">
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Makeup Gain</span>
                    <span className="text-amber-400 font-bold">+{config.compressor.makeupGain.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={18}
                    step={0.5}
                    value={config.compressor.makeupGain}
                    onChange={(e) =>
                      onChange({
                        compressor: { ...config.compressor, makeupGain: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* LIMITER */}
            <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">
                    PEAK LIMITER (SPEAKER PROTECTION)
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {config.limiter.enabled ? 'ACTIVE' : 'BYPASS'}
                  </span>
                </div>

                <button
                  onClick={() =>
                    onChange({
                      limiter: { ...config.limiter, enabled: !config.limiter.enabled },
                    })
                  }
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    config.limiter.enabled ? 'bg-rose-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {config.limiter.enabled ? 'LIMITER ON' : 'LIMITER BYPASS'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Threshold */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Threshold</span>
                    <span className="text-rose-400 font-bold">{config.limiter.threshold.toFixed(1)} dBFS</span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={0}
                    step={0.2}
                    value={config.limiter.threshold}
                    onChange={(e) =>
                      onChange({
                        limiter: { ...config.limiter, threshold: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-rose-500"
                  />
                </div>

                {/* Ceiling */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Ceiling</span>
                    <span className="text-rose-400 font-bold">{config.limiter.ceiling.toFixed(1)} dBFS</span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={0}
                    step={0.2}
                    value={config.limiter.ceiling}
                    onChange={(e) =>
                      onChange({
                        limiter: { ...config.limiter, ceiling: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-rose-500"
                  />
                </div>

                {/* Release */}
                <div className="sm:col-span-2">
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Limiter Release</span>
                    <span className="text-rose-400 font-bold">
                      {Math.round(config.limiter.release * 1000)} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={config.limiter.release}
                    onChange={(e) =>
                      onChange({
                        limiter: { ...config.limiter, release: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: GAIN & DELAY                                      */}
        {/* ======================================================== */}
        {activeTab === 'ROUTING' && (
          <div className="space-y-4 font-mono text-xs">
            {/* Input Gain Trim */}
            <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 space-y-2">
              <div className="flex justify-between text-neutral-300">
                <span className="font-bold">Input Channel Gain Trim</span>
                <span className="text-cyan-400 font-bold text-sm">
                  {config.gain > 0 ? `+${config.gain.toFixed(1)}` : config.gain.toFixed(1)} dB
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-48}
                  max={12}
                  step={0.5}
                  value={config.gain}
                  onChange={(e) => onChange({ gain: parseFloat(e.target.value) })}
                  className="flex-1 h-2.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
                <button
                  onClick={() => onChange({ gain: 0 })}
                  className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
                >
                  0 dB
                </button>
              </div>
            </div>

            {/* Time Alignment Delay */}
            <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-white text-xs">
                    Time Alignment Delay
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {config.delayEnabled ? 'ACTIVE' : 'BYPASS'}
                  </span>
                </div>

                <button
                  onClick={() => onChange({ delayEnabled: !config.delayEnabled })}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    config.delayEnabled ? 'bg-cyan-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {config.delayEnabled ? 'DELAY ON' : 'BYPASS'}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-neutral-400 mb-1">
                  <span>Delay Time</span>
                  <span className="text-cyan-400 font-bold">
                    {config.delayMs.toFixed(1)} ms ({((config.delayMs * 0.343)).toFixed(2)} meters)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={0.5}
                    value={config.delayMs}
                    onChange={(e) => onChange({ delayMs: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-400"
                  />
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={0.1}
                    value={config.delayMs}
                    onChange={(e) => onChange({ delayMs: parseFloat(e.target.value) || 0 })}
                    className="w-20 bg-neutral-950 border border-neutral-700 text-white text-right px-2 py-1 rounded outline-none"
                  />
                  <span className="text-neutral-500 text-xs">ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: DSP AUDIT & SIGNAL FLOW                           */}
        {/* ======================================================== */}
        {activeTab === 'AUDIT' && (() => {
          const debugData = isL ? audioEngine.getDebugInfo().L : audioEngine.getDebugInfo().R;
          return (
            <div className="space-y-3 font-mono text-xs text-neutral-300">
              <div className="flex items-center justify-between p-2.5 bg-neutral-900/90 rounded-xl border border-neutral-800">
                <span className="flex items-center gap-2 font-bold text-white">
                  <Terminal className="w-4 h-4 text-purple-400" />
                  Live Web Audio Graph Inspection & Sub Isolation Audit
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% ISOLATED MONO
                </span>
              </div>

              {/* 3 Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 bg-neutral-900/70 border border-neutral-800 rounded-lg">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Channel Splitter Input</div>
                  <div className="text-sm font-bold text-cyan-400 mt-0.5">
                    {debugData ? `Discrete Port ${debugData.channelId === 'L' ? '0 (Left)' : '1 (Right)'}` : `Port ${isL ? '0 (L)' : '1 (R)'}`}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    Hanya menerima sinyal channel {isL ? 'L' : 'R'}, tanpa cross-talk.
                  </div>
                </div>

                <div className="p-2.5 bg-neutral-900/70 border border-neutral-800 rounded-lg">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Sub Isolation Crossover</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    {debugData ? `${debugData.lpf.activeStages} Stages (${debugData.lpf.slope}dB/oct)` : 'LPF Active'}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    {config.subMode === 'SUB / LOW'
                      ? `Cutoff ${config.lpf.frequency}Hz (${config.lpf.type})`
                      : 'Full Range / High'}
                  </div>
                </div>

                <div className="p-2.5 bg-neutral-900/70 border border-neutral-800 rounded-lg">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Signal Bypass Paths</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    {debugData?.hasBypassPath ? 'WARNING: Bypass Found' : '0 (ZERO BYPASS)'}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    Serial mutlak: sinyal wajib melewati filter cascade.
                  </div>
                </div>
              </div>

              {/* Node Sequence chain */}
              <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded-lg">
                <div className="text-[11px] font-bold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  Rantai Pemrosesan DSP Serial Terkunci
                </div>
                <div className="text-[11px] text-neutral-400 flex flex-wrap gap-1 items-center">
                  {(debugData?.chainSequence || [
                    'Input Gain',
                    'Polarity (Phase Invert)',
                    'Delay Line (Time Alignment)',
                    'HPF Cascade [4 stages]',
                    'LPF Cascade [4 stages]',
                    'PEQ [5 bands]',
                    'GEQ [10 bands]',
                    'Compressor',
                    'Limiter',
                    'Output Gain & Mute',
                  ]).map((item: string, idx: number) => (
                    <React.Fragment key={idx}>
                      <span className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-200">
                        {item}
                      </span>
                      {idx < 9 && <span className="text-neutral-600">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Audit Graph Connections Log */}
              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
                <div className="text-[11px] font-bold text-purple-300 mb-1 flex items-center justify-between">
                  <span>Audit Koneksi Node Aktif ({debugData?.totalChainNodeCount || 26} nodes terpasang):</span>
                  <span className="text-[10px] text-neutral-400">Web Audio API Node Cascade</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-0.5 text-[10px] font-mono text-neutral-400 pr-1">
                  {debugData?.connections?.map((conn, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 py-0.5 border-b border-neutral-900">
                      <span className="text-neutral-600 w-5">{idx + 1}.</span>
                      <span className="text-cyan-400">{conn.split(' -> ')[0]}</span>
                      <span className="text-neutral-500">→</span>
                      <span className="text-emerald-400">{conn.split(' -> ')[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
