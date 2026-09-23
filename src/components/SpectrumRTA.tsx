import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audio-engine';
import { RTASource } from '../types';
import { CheckCircle2, Zap } from 'lucide-react';

interface SpectrumRTAProps {
  id?: string;
  className?: string;
  onSyncConfigs?: () => void;
}

export const SpectrumRTA: React.FC<SpectrumRTAProps> = ({ id, className = '', onSyncConfigs }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // RTA Source state: 'L + R' | 'IN L' | 'IN R' | 'POST L' | 'POST R'
  const [source, setSource] = useState<RTASource>('POST R');
  const [displayType, setDisplayType] = useState<'CURVE' | 'BARS'>('CURVE');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showReference, setShowReference] = useState<boolean>(true); // Overlay Pre-DSP Input reference for instant attenuation comparison
  const [hoverInfo, setHoverInfo] = useState<{ freq: number; db: number; x: number; y: number } | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  // Sync state refs for requestAnimationFrame loop
  const sourceRef = useRef<RTASource>(source);
  sourceRef.current = source;
  const displayTypeRef = useRef(displayType);
  displayTypeRef.current = displayType;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const showReferenceRef = useRef(showReference);
  showReferenceRef.current = showReference;

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed buffers for 2048 FFT Size (1024 bins)
    const bufferLength = 1024;
    const freqDataMain = new Uint8Array(bufferLength);
    const freqDataSecond = new Uint8Array(bufferLength);
    const freqDataRef = new Uint8Array(bufferLength);

    const updateCanvasSize = () => {
      if (containerRef.current && canvas) {
        const rect = containerRef.current.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w > 0 && h > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);
        }
      }
    };

    updateCanvasSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateCanvasSize();
      });
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', updateCanvasSize);
    }

    const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const minFreq = 20;
    const maxFreq = 20000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);

    const freqToX = (freq: number, width: number): number => {
      const fLog = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
      return ((fLog - minLog) / (maxLog - minLog)) * width;
    };

    const render = () => {
      animId = requestAnimationFrame(render);
      if (!canvas || !ctx || !containerRef.current) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      if (width <= 0 || height <= 0) return;

      const currentSource = sourceRef.current;
      const currentDisplay = displayTypeRef.current;
      const currentShowGrid = showGridRef.current;
      const currentShowRef = showReferenceRef.current;

      // Dark background
      ctx.fillStyle = '#080d19';
      ctx.fillRect(0, 0, width, height);

      // 1. Grid Lines & Labels
      if (currentShowGrid) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1e293b';
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';

        // Frequency Grid Lines
        freqLabels.forEach((freq) => {
          const x = freqToX(freq, width);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height - 18);
          ctx.stroke();

          const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
          ctx.fillText(label, x - 8, height - 4);
        });

        // dB Horizontal Grid Lines
        const dbMarks = [0, -12, -24, -36, -48, -60];
        dbMarks.forEach((db) => {
          const y = ((0 - db) / 60) * (height - 24) + 12;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();

          ctx.fillText(`${db}dB`, 4, y - 2);
        });
      }

      // 2. Fetch data based on strictly verified RTA source
      const sampleRate = audioEngine.getPlaybackState().sampleRate || 44100;
      let binCount = bufferLength;

      // Helper to draw smooth frequency curve
      const drawCurve = (
        data: Uint8Array,
        fillColor: string,
        strokeColor: string,
        dashed: boolean = false,
        lineWidth: number = 2
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, height - 20);

        let started = false;
        const numPoints = 140; // Sample across logarithmic bands

        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints;
          const freq = Math.pow(10, minLog + t * (maxLog - minLog));
          const binIndex = Math.min(binCount - 1, Math.round((freq / (sampleRate / 2)) * binCount));
          const val = data[binIndex] || 0; // 0 to 255
          const normalized = val / 255;
          const x = t * width;
          const y = (height - 22) - normalized * (height - 35);

          if (!started) {
            ctx.lineTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.lineTo(width, height - 20);
        ctx.closePath();

        if (fillColor !== 'transparent') {
          ctx.fillStyle = fillColor;
          ctx.fill();
        }

        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = strokeColor;
        if (dashed) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.restore();
      };

      // Helper to draw Octave Bars
      const drawBars = (data: Uint8Array, color: string) => {
        const numBars = 45;
        const barWidth = width / numBars - 2;

        for (let i = 0; i < numBars; i++) {
          const t = (i + 0.5) / numBars;
          const freq = Math.pow(10, minLog + t * (maxLog - minLog));
          const binIndex = Math.min(binCount - 1, Math.round((freq / (sampleRate / 2)) * binCount));
          const val = data[binIndex] || 0;
          const normalized = val / 255;
          const barHeight = Math.max(2, normalized * (height - 35));
          const x = i * (barWidth + 2);
          const y = height - 20 - barHeight;

          ctx.fillStyle = color;
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      };

      // Helper to draw Crossover Cutoff Frequency Marker line
      const drawCutoffMarker = (freq: number, label: string, color: string) => {
        const x = freqToX(freq, width);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, height - 20);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`▲ ${label}`, Math.max(4, Math.min(width - 120, x - 15)), 28);
        ctx.restore();
      };

      // 3. Routing Data Retrieval according to user specification:
      // "INPUT L" = signal sebelum DSP
      // "INPUT R" = signal sebelum DSP
      // "POST L" = signal setelah seluruh DSP INPUT L
      // "POST R" = signal setelah seluruh DSP INPUT R
      if (currentSource === 'L + R') {
        // Stereo Post-DSP
        const postL = audioEngine.channelL?.postAnalyserNode;
        const postR = audioEngine.channelR?.postAnalyserNode;
        if (postL) {
          postL.getByteFrequencyData(freqDataMain);
          binCount = postL.frequencyBinCount;
        }
        if (postR) {
          postR.getByteFrequencyData(freqDataSecond);
        }

        if (currentDisplay === 'CURVE') {
          drawCurve(freqDataMain, 'rgba(6, 182, 212, 0.20)', '#06b6d4');
          drawCurve(freqDataSecond, 'rgba(245, 158, 11, 0.20)', '#f59e0b');
        } else {
          drawBars(freqDataMain, 'rgba(6, 182, 212, 0.55)');
          drawBars(freqDataSecond, 'rgba(245, 158, 11, 0.45)');
        }

        // Legend overlay
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.fillText('■ POST L', width - 150, 16);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('■ POST R', width - 75, 16);

      } else if (currentSource === 'IN L') {
        // PRE-DSP INPUT L
        const preL = audioEngine.channelL?.preAnalyserNode;
        if (preL) {
          preL.getByteFrequencyData(freqDataMain);
          binCount = preL.frequencyBinCount;
        }

        if (currentDisplay === 'CURVE') {
          drawCurve(freqDataMain, 'rgba(6, 182, 212, 0.25)', '#06b6d4');
        } else {
          drawBars(freqDataMain, '#06b6d4');
        }

        // Legend overlay
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.fillText('■ INPUT L', width - 110, 16);

      } else if (currentSource === 'IN R') {
        // PRE-DSP INPUT R
        const preR = audioEngine.channelR?.preAnalyserNode;
        if (preR) {
          preR.getByteFrequencyData(freqDataMain);
          binCount = preR.frequencyBinCount;
        }

        if (currentDisplay === 'CURVE') {
          drawCurve(freqDataMain, 'rgba(245, 158, 11, 0.25)', '#f59e0b');
        } else {
          drawBars(freqDataMain, '#f59e0b');
        }

        // Legend overlay
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('■ INPUT R', width - 110, 16);

      } else if (currentSource === 'POST L') {
        // POST-DSP OUTPUT L
        const postL = audioEngine.channelL?.postAnalyserNode;
        if (postL) {
          postL.getByteFrequencyData(freqDataMain);
          binCount = postL.frequencyBinCount;
        }

        // If Reference overlay is active, show pre-DSP INPUT L dashed curve behind
        if (currentShowRef) {
          const preL = audioEngine.channelL?.preAnalyserNode;
          if (preL) {
            preL.getByteFrequencyData(freqDataRef);
            drawCurve(freqDataRef, 'transparent', '#64748b', true, 1.2);
          }
        }

        if (currentDisplay === 'CURVE') {
          drawCurve(freqDataMain, 'rgba(6, 182, 212, 0.30)', '#06b6d4', false, 2.2);
        } else {
          drawBars(freqDataMain, '#06b6d4');
        }

        // Check Crossover Cutoff for Channel L
        const cfgL = audioEngine.configL;
        if (cfgL.subMode === 'HIGH' || cfgL.hpf.enabled) {
          drawCutoffMarker(
            cfgL.hpf.frequency,
            `HPF ${cfgL.hpf.frequency}Hz (${cfgL.hpf.slope}dB/oct)`,
            '#22d3ee'
          );
        }
        if (cfgL.lpf.enabled) {
          drawCutoffMarker(
            cfgL.lpf.frequency,
            `LPF ${cfgL.lpf.frequency}Hz (${cfgL.lpf.slope}dB/oct)`,
            '#06b6d4'
          );
        }

        // Legend overlay
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.fillText('■ POST L', width - 110, 16);
        if (currentShowRef) {
          ctx.fillStyle = '#64748b';
          ctx.fillText('--- IN L (REF)', width - 210, 16);
        }

      } else if (currentSource === 'POST R') {
        // POST-DSP OUTPUT R
        const postR = audioEngine.channelR?.postAnalyserNode;
        if (postR) {
          postR.getByteFrequencyData(freqDataMain);
          binCount = postR.frequencyBinCount;
        }

        // If Reference overlay is active, show pre-DSP INPUT R dashed curve behind
        if (currentShowRef) {
          const preR = audioEngine.channelR?.preAnalyserNode;
          if (preR) {
            preR.getByteFrequencyData(freqDataRef);
            drawCurve(freqDataRef, 'transparent', '#64748b', true, 1.2);
          }
        }

        if (currentDisplay === 'CURVE') {
          drawCurve(freqDataMain, 'rgba(245, 158, 11, 0.30)', '#f59e0b', false, 2.2);
        } else {
          drawBars(freqDataMain, '#f59e0b');
        }

        // Check Crossover Cutoff for Channel R
        const cfgR = audioEngine.configR;
        if (cfgR.subMode === 'SUB / LOW' || cfgR.lpf.enabled) {
          drawCutoffMarker(
            cfgR.lpf.frequency,
            `SUB LPF ${cfgR.lpf.frequency}Hz (${cfgR.lpf.slope}dB/oct ${cfgR.lpf.type})`,
            '#fbbf24'
          );
        }
        if (cfgR.hpf.enabled) {
          drawCutoffMarker(
            cfgR.hpf.frequency,
            `HPF ${cfgR.hpf.frequency}Hz (${cfgR.hpf.slope}dB/oct)`,
            '#f59e0b'
          );
        }

        // Legend overlay (strictly "POST R", never "INPUT R")
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('■ POST R', width - 110, 16);
        if (currentShowRef) {
          ctx.fillStyle = '#64748b';
          ctx.fillText('--- IN R (REF)', width - 210, 16);
        }
      }

      // Title watermark in top-left of canvas
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#475569';
      const sourceTitles: Record<RTASource, string> = {
        'L + R': 'STEREO POST-DSP RTA [CH L + CH R]',
        'IN L': 'INPUT L [PRE-DSP SOURCE SIGNAL]',
        'IN R': 'INPUT R [PRE-DSP SOURCE SIGNAL]',
        'POST L': 'POST L [POST-DSP OUTPUT TAP]',
        'POST R': 'POST R [POST-DSP OUTPUT TAP]',
      };
      ctx.fillText(sourceTitles[currentSource] || 'RTA SPECTRUM', 8, 16);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateCanvasSize);
      }
    };
  }, []);

  // Handle canvas mouse move for interactive frequency/dB inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    if (x >= 0 && x <= width && y >= 0 && y <= height - 20) {
      const minLog = Math.log10(20);
      const maxLog = Math.log10(20000);
      const freq = Math.pow(10, minLog + (x / width) * (maxLog - minLog));
      const db = -((y - 12) / (height - 24)) * 60;
      setHoverInfo({
        freq: Math.round(freq),
        db: Math.max(-60, Math.min(0, parseFloat(db.toFixed(1)))),
        x,
        y,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  /**
   * One-click Crossover Verification Scenario Setup:
   * INPUT R = SUB, LPF = 100 Hz, slope = 48 dB/oct
   * INPUT L = HIGH, HPF = 100 Hz, slope = 48 dB/oct
   * Automatically sets RTA source to "POST R" so attenuation is directly verified.
   */
  const handleRunSubCrossoverVerification = () => {
    // 1. Configure Channel R as SUB (LPF 100Hz 48dB/oct Linkwitz-Riley)
    audioEngine.setSubModeR('SUB / LOW');
    audioEngine.updateChannelR({
      lpf: {
        enabled: true,
        frequency: 100,
        slope: 48,
        type: 'Linkwitz-Riley',
      },
      hpf: {
        enabled: true,
        frequency: 25, // subsonic protection
        slope: 24,
        type: 'Butterworth',
      },
    });

    // 2. Configure Channel L as HIGH (HPF 100Hz 48dB/oct Linkwitz-Riley)
    audioEngine.setSubModeL('HIGH');
    audioEngine.updateChannelL({
      hpf: {
        enabled: true,
        frequency: 100,
        slope: 48,
        type: 'Linkwitz-Riley',
      },
      lpf: {
        enabled: false,
        frequency: 20000,
        slope: 24,
        type: 'Butterworth',
      },
    });

    // 3. Switch RTA to POST R for immediate verification
    setSource('POST R');
    setShowReference(true);

    if (onSyncConfigs) {
      onSyncConfigs();
    }

    setVerificationFeedback('TEST AKTIF: CH R = SUB 100Hz (48dB/oct) • RTA = POST R');
    setTimeout(() => {
      setVerificationFeedback(null);
    }, 4500);
  };

  return (
    <div
      id={id}
      className={`flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl select-none ${className}`}
    >
      {/* RTA Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-neutral-950/80 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-neutral-200 font-mono tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            REAL-TIME RTA / SPECTRUM
          </span>
          <span className="text-[10px] text-neutral-400 font-mono">
            {source === 'POST R' && 'Sumber: POST R (Sinyal setelah Crossover & DSP R)'}
            {source === 'POST L' && 'Sumber: POST L (Sinyal setelah Crossover & DSP L)'}
            {source === 'IN R' && 'Sumber: INPUT R (Sinyal awal sebelum DSP)'}
            {source === 'IN L' && 'Sumber: INPUT L (Sinyal awal sebelum DSP)'}
            {source === 'L + R' && 'Sumber: STEREO POST (L+R setelah DSP)'}
          </span>
        </div>

        {/* Verification Status Toast if active */}
        {verificationFeedback && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] animate-fade-in">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{verificationFeedback}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {/* Quick Sub Crossover Verification Button */}
          <button
            onClick={handleRunSubCrossoverVerification}
            title="Klik untuk setting uji coba otomatis: R=SUB 100Hz (48dB), L=HIGH 100Hz, RTA=POST R"
            className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition cursor-pointer text-[10px] font-bold"
          >
            <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="hidden sm:inline">UJI CROSSOVER SUB (100Hz 48dB)</span>
            <span className="sm:hidden">UJI SUB</span>
          </button>

          {/* RTA Source Selector Buttons: "L + R", "IN L", "IN R", "POST L", "POST R" */}
          <div className="flex bg-neutral-950 rounded-lg p-0.5 border border-neutral-800">
            <button
              onClick={() => setSource('L + R')}
              title="Tampilkan spektrum output gabungan L + R setelah DSP"
              className={`px-2 py-1 rounded transition cursor-pointer ${
                source === 'L + R'
                  ? 'bg-neutral-800 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              L + R
            </button>

            <button
              onClick={() => setSource('IN L')}
              title="Tampilkan spektrum INPUT L sebelum DSP (sinyal mentah)"
              className={`px-2 py-1 rounded transition cursor-pointer ${
                source === 'IN L'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/80 shadow-sm'
                  : 'text-neutral-400 hover:text-cyan-400'
              }`}
            >
              IN L
            </button>

            <button
              onClick={() => setSource('IN R')}
              title="Tampilkan spektrum INPUT R sebelum DSP (sinyal mentah)"
              className={`px-2 py-1 rounded transition cursor-pointer ${
                source === 'IN R'
                  ? 'bg-amber-950 text-amber-300 font-bold border border-amber-800/80 shadow-sm'
                  : 'text-neutral-400 hover:text-amber-400'
              }`}
            >
              IN R
            </button>

            <button
              onClick={() => setSource('POST L')}
              title="Tampilkan spektrum POST L setelah seluruh proses DSP & Crossover"
              className={`px-2 py-1 rounded transition cursor-pointer ${
                source === 'POST L'
                  ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-900/50'
                  : 'text-cyan-400 hover:text-cyan-300 font-medium'
              }`}
            >
              POST L
            </button>

            <button
              onClick={() => setSource('POST R')}
              title="Tampilkan spektrum POST R setelah seluruh proses DSP & Crossover (Verifikasi SUB)"
              className={`px-2 py-1 rounded transition cursor-pointer ${
                source === 'POST R'
                  ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-900/50'
                  : 'text-amber-400 hover:text-amber-300 font-medium'
              }`}
            >
              POST R
            </button>
          </div>

          {/* Reference Overlay (Pre vs Post comparison) */}
          {(source === 'POST L' || source === 'POST R') && (
            <button
              onClick={() => setShowReference(!showReference)}
              title="Tampilkan garis abu-abu putus-putus sebagai referensi sinyal INPUT sebelum difilter"
              className={`px-2 py-1 rounded border transition cursor-pointer text-[10px] ${
                showReference
                  ? 'border-neutral-600 bg-neutral-800 text-neutral-200 font-semibold'
                  : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Overlay Input Ref
            </button>
          )}

          {/* Display Mode: Curve vs Bars */}
          <div className="flex bg-neutral-950 rounded-lg p-0.5 border border-neutral-800">
            <button
              onClick={() => setDisplayType('CURVE')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                displayType === 'CURVE'
                  ? 'bg-neutral-800 text-white font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Curve
            </button>
            <button
              onClick={() => setDisplayType('BARS')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                displayType === 'BARS'
                  ? 'bg-neutral-800 text-white font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Bars
            </button>
          </div>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Grid Lines"
            className={`px-2 py-1 rounded border transition cursor-pointer text-[10px] ${
              showGrid
                ? 'border-neutral-700 bg-neutral-800 text-neutral-300'
                : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Grid
          </button>
        </div>
      </div>

      {/* Canvas Area with interactive frequency/dB readout */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-48 sm:h-56 bg-[#080d19] overflow-hidden cursor-crosshair"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Cursor Frequency / Level Tooltip */}
        {hoverInfo && (
          <div
            className="absolute pointer-events-none px-2 py-1 rounded bg-neutral-950/90 border border-neutral-700 text-neutral-200 font-mono text-[10px] shadow-lg -translate-x-1/2 -translate-y-full"
            style={{
              left: `${hoverInfo.x}px`,
              top: `${Math.max(20, hoverInfo.y - 6)}px`,
            }}
          >
            <span className="font-bold text-amber-400">{hoverInfo.freq >= 1000 ? `${(hoverInfo.freq / 1000).toFixed(2)} kHz` : `${hoverInfo.freq} Hz`}</span>
            <span className="text-neutral-500 mx-1">|</span>
            <span className="text-cyan-400">{hoverInfo.db} dBFS</span>
          </div>
        )}
      </div>

      {/* Bottom Status bar for selected mode */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-neutral-950/90 border-t border-neutral-800/80 text-[10px] font-mono text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-300">STATUS MONITORING:</span>
          {source === 'POST R' && (
            <span className="text-amber-400">
              Membaca sinyal tap <strong>POST R</strong> (setelah Gain, Phase, Delay, HPF, LPF SUB, PEQ, Comp, Limiter) sebelum Merger.
            </span>
          )}
          {source === 'POST L' && (
            <span className="text-cyan-400">
              Membaca sinyal tap <strong>POST L</strong> (setelah seluruh pemrosesan DSP L) sebelum Merger.
            </span>
          )}
          {source === 'IN R' && (
            <span className="text-amber-300">
              Membaca sinyal mentah <strong>INPUT R</strong> (sebelum melewati DSP / Crossover).
            </span>
          )}
          {source === 'IN L' && (
            <span className="text-cyan-300">
              Membaca sinyal mentah <strong>INPUT L</strong> (sebelum melewati DSP / Crossover).
            </span>
          )}
          {source === 'L + R' && (
            <span className="text-neutral-300">
              Membaca output stereo gabungan <strong>POST L (Cyan) & POST R (Amber)</strong>.
            </span>
          )}
        </div>

        <div className="text-neutral-500 hidden md:inline">
          Resolusi FFT: 2048 (1024 Bins) • Range: 20 Hz - 20 kHz
        </div>
      </div>
    </div>
  );
};
