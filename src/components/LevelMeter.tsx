import React from 'react';
import { ChannelMeterData } from '../types';

interface LevelMeterProps {
  id?: string;
  channelId: 'L' | 'R';
  meter: ChannelMeterData;
  onClearClip?: () => void;
  vertical?: boolean;
}

export const LevelMeter: React.FC<LevelMeterProps> = ({
  id,
  channelId,
  meter,
  onClearClip,
  vertical = false,
}) => {
  // Convert dBFS (-60 to 0dB) to 0 - 100 percentage for LED bar
  const peakPct = Math.max(0, Math.min(100, ((meter.peak + 60) / 63) * 100));
  const rmsPct = Math.max(0, Math.min(100, ((meter.rms + 60) / 63) * 100));

  const compGrPct = Math.max(0, Math.min(100, (meter.compReduction / 24) * 100));
  const limGrPct = Math.max(0, Math.min(100, (meter.limiterReduction / 12) * 100));

  const peakDisplay = meter.peak <= -90 ? '-inf' : meter.peak.toFixed(1);
  const rmsDisplay = meter.rms <= -90 ? '-inf' : meter.rms.toFixed(1);

  const inDisplay = (meter.inputLevel ?? -100) <= -90 ? '-inf' : (meter.inputLevel ?? -100).toFixed(1);
  const procDisplay = (meter.processingLevel ?? -100) <= -90 ? '-inf' : (meter.processingLevel ?? -100).toFixed(1);
  const outDisplay = (meter.outputLevel ?? -100) <= -90 ? '-inf' : (meter.outputLevel ?? -100).toFixed(1);

  if (vertical) {
    return (
      <div
        id={id}
        className="flex flex-col items-center justify-between bg-neutral-900/90 border border-neutral-800 rounded-lg p-2.5 w-24 h-72 select-none shrink-0"
      >
        {/* Channel & Clip Indicator */}
        <div className="flex items-center justify-between w-full mb-1">
          <span
            className={`font-black text-xs font-mono px-1.5 py-0.5 rounded ${
              channelId === 'L' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' : 'bg-amber-950 text-amber-400 border border-amber-800/60'
            }`}
          >
            CH {channelId}
          </span>
          <button
            onClick={onClearClip}
            title={meter.isClipping ? 'Click to clear CLIP' : 'No clipping'}
            className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition ${
              meter.isClipping
                ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/50 cursor-pointer'
                : 'bg-neutral-800/80 text-neutral-600 cursor-default'
            }`}
          >
            CLIP
          </button>
        </div>

        {/* Vertical Meter Bars */}
        <div className="relative flex items-stretch gap-2 flex-1 w-full my-1 justify-center">
          {/* Scale Labels */}
          <div className="flex flex-col justify-between text-[9px] font-mono text-neutral-500 text-right pr-0.5">
            <span>+3</span>
            <span>0</span>
            <span>-6</span>
            <span>-12</span>
            <span>-24</span>
            <span>-36</span>
            <span>-60</span>
          </div>

          {/* Peak Bar */}
          <div className="relative w-3.5 bg-neutral-950 rounded-sm overflow-hidden border border-neutral-800 flex flex-col justify-end">
            <div
              className="w-full transition-all duration-75 ease-out rounded-xs"
              style={{
                height: `${peakPct}%`,
                background: 'linear-gradient(to top, #10b981 0%, #10b981 60%, #eab308 85%, #ef4444 100%)',
              }}
            />
          </div>

          {/* RMS Bar */}
          <div className="relative w-3.5 bg-neutral-950 rounded-sm overflow-hidden border border-neutral-800 flex flex-col justify-end">
            <div
              className="w-full transition-all duration-100 ease-out rounded-xs opacity-90"
              style={{
                height: `${rmsPct}%`,
                background: 'linear-gradient(to top, #059669 0%, #10b981 60%, #ca8a04 85%, #dc2626 100%)',
              }}
            />
          </div>

          {/* Gain Reduction Bars (Comp + Limiter) */}
          <div className="flex flex-col justify-between pl-1 border-l border-neutral-800/80">
            <div className="text-[8px] font-mono text-neutral-500 text-center">GR</div>
            <div className="relative w-2 h-36 bg-neutral-950 rounded-sm overflow-hidden border border-neutral-800">
              {/* Comp GR */}
              <div
                className="w-full bg-amber-500 transition-all duration-75"
                style={{ height: `${compGrPct}%` }}
              />
              {/* Limiter GR */}
              <div
                className="w-full bg-rose-500 transition-all duration-50"
                style={{ height: `${limGrPct}%` }}
              />
            </div>
            <div className="text-[8px] font-mono text-neutral-500 text-center">
              {meter.compReduction > 0 ? `-${meter.compReduction.toFixed(0)}` : '0'}
            </div>
          </div>
        </div>

        {/* Gain Structure Metrics (IN, PROC, OUT) */}
        <div className="w-full flex flex-col gap-0.5 text-[9px] font-mono text-center pt-1 border-t border-neutral-800">
          <div className="flex justify-between px-1 text-neutral-400">
            <span className="text-neutral-500">IN</span>
            <span>{inDisplay}</span>
          </div>
          <div className="flex justify-between px-1 text-neutral-400">
            <span className="text-neutral-500">PROC</span>
            <span>{procDisplay}</span>
          </div>
          <div className="flex justify-between px-1 text-neutral-300 font-semibold">
            <span className="text-neutral-500">OUT</span>
            <span>{outDisplay}</span>
          </div>
        </div>
      </div>
    );
  }

  // Horizontal Compact Level Meter (with full Gain Structure readouts)
  return (
    <div
      id={id}
      className="flex flex-col gap-1.5 bg-neutral-900/90 border border-neutral-800 rounded-lg p-2.5 w-full select-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-black text-xs px-1.5 py-0.5 rounded ${
              channelId === 'L' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' : 'bg-amber-950 text-amber-400 border border-amber-800/60'
            }`}
          >
            CH {channelId}
          </span>

          {/* Gain Structure Readouts: Input, Processing, Output, Peak, RMS */}
          <span className="text-neutral-400 text-[11px] bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
            IN: <span className="text-neutral-200">{inDisplay}</span>
          </span>

          <span className="text-neutral-400 text-[11px] bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
            PROC: <span className="text-neutral-200">{procDisplay}</span>
          </span>

          <span className="text-neutral-400 text-[11px] bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
            OUT: <strong className={meter.peak > -0.5 ? 'text-rose-400' : 'text-neutral-200'}>{outDisplay}</strong>
          </span>

          <span className="text-neutral-500 text-[11px] hidden sm:inline">
            RMS: {rmsDisplay}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(meter.compReduction > 0.2 || meter.limiterReduction > 0.2) && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300">
              GR -{(meter.compReduction + meter.limiterReduction).toFixed(1)} dB
            </span>
          )}
          <button
            onClick={onClearClip}
            title={meter.isClipping ? 'Click to clear CLIP' : 'No clipping'}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition ${
              meter.isClipping
                ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-600/50 cursor-pointer'
                : 'bg-neutral-800 text-neutral-600 cursor-default'
            }`}
          >
            CLIP
          </button>
        </div>
      </div>

      {/* Horizontal Bar with Peak and RMS */}
      <div className="relative w-full h-3.5 bg-neutral-950 rounded border border-neutral-800 overflow-hidden flex items-center">
        {/* dB markers */}
        <div className="absolute inset-0 flex justify-between px-2 text-[8px] font-mono text-neutral-600 z-10 pointer-events-none">
          <span>-60</span>
          <span>-36</span>
          <span>-24</span>
          <span>-12</span>
          <span>-6</span>
          <span>0</span>
        </div>

        {/* RMS fill */}
        <div
          className="h-full transition-all duration-75"
          style={{
            width: `${rmsPct}%`,
            background: 'linear-gradient(to right, #059669 0%, #10b981 70%, #eab308 90%, #ef4444 100%)',
          }}
        />

        {/* Peak indicator tick */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-sm shadow-white transition-all duration-50"
          style={{ left: `calc(${Math.min(99, peakPct)}% - 2px)` }}
        />
      </div>
    </div>
  );
};
