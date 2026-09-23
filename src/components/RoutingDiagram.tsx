import React from 'react';
import { ArrowDown, CheckCircle2, Cpu } from 'lucide-react';

export const RoutingDiagram: React.FC = () => {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs font-mono text-neutral-400">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 font-bold text-neutral-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          DSP SIGNAL ARCHITECTURE
        </span>
        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Strict Serial DSP Chain with Master Bypass A/B
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1 text-[11px] py-1 bg-neutral-950/80 rounded-lg border border-neutral-800/80 px-2 overflow-x-auto">
        <span className="px-2 py-0.5 rounded bg-neutral-800 text-white font-semibold">
          AUDIO SOURCE
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-2 py-0.5 rounded bg-neutral-800 text-cyan-400 font-semibold">
          SPLITTER (L/R)
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
          GAIN
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          POLARITY
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          DELAY
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
          HPF
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
          LPF
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          PEQ (5-BAND)
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          GEQ (10-BAND)
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          COMPRESSOR
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-850 text-neutral-300">
          LIMITER
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
          METER / RTA
        </span>
        <span className="text-neutral-600">→</span>
        <span className="px-2 py-0.5 rounded bg-neutral-800 text-white font-semibold">
          OUT
        </span>
      </div>
    </div>
  );
};
