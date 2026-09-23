import {
  ChannelConfig,
  ChannelMeterData,
  DSPDebugInfo,
  FilterSlope,
  FilterType,
} from '../types';

/**
 * Helper to enforce strict discrete single-channel processing on Web Audio nodes.
 * Prevents unintentional stereo upmixing or cross-channel summing.
 */
function lockDiscreteMono(node: AudioNode): void {
  try {
    node.channelCount = 1;
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'discrete';
  } catch (_) {
    // Specific browser nodes (like DynamicsCompressorNode) have fixed stereo channel layout
  }
}

/**
 * DSPChannel implements a professional-grade DLMS discrete processing channel.
 * 
 * Strict Signal Flow (Fixed Serial Chain - NEVER Disconnected or Dynamically Re-Wired):
 * 
 * INPUT (From Splitter Output 0 or 1 - Discrete Mono)
 *   │
 *   ├─→ Input Tap (Passive Analyser for Input Level Metering)
 *   ▼
 * GAIN (-48 dB to +12 dB)
 *   ▼
 * POLARITY (Normal 0° or Invert 180°)
 *   ▼
 * DELAY (0 to 1000 ms Time Alignment)
 *   ▼
 * HPF CASCADE (Stages 1..4: Cascaded Highpass filters in series)
 *   ▼
 * LPF CASCADE (Stages 1..4: Cascaded Lowpass filters in series)
 *   ▼
 * PEQ (5 Bands in Series: LowShelf, Peaking, HighShelf)
 *   ▼
 * GEQ (10 ISO Bands in Series: 31Hz to 16kHz)
 *   │
 *   ├─→ Processing Tap (Passive Analyser for Mid-chain Level Metering)
 *   ▼
 * COMPRESSOR (Dynamics Compressor + Makeup Gain)
 *   ▼
 * LIMITER (Peak Limiter + Ceiling Gain)
 *   ▼
 * OUTPUT GAIN & MASTER MUTE (Discrete Mono)
 *   │
 *   ├─→ Output Tap (Passive Analyser for RTA Spectrum & Output Peak/RMS Metering)
 *   ▼
 * OUTPUT (To Merger Input 0 or 1)
 */
export class DSPChannel {
  public readonly id: 'L' | 'R';
  private ctx: AudioContext;

  // Primary input and output endpoints
  public readonly inputNode: GainNode;
  public readonly outputNode: GainNode;

  // Passive metering and analysis taps (Zero output connections to audio path)
  public readonly inputAnalyserNode: AnalyserNode;
  public readonly processingAnalyserNode: AnalyserNode;
  public readonly analyserNode: AnalyserNode; // Post-DSP Output Analyser (for RTA & meter)

  // Serial chain processing nodes
  private gainNode: GainNode;
  private phaseNode: GainNode;
  private delayNode: DelayNode;

  // Crossover HPF (4 cascaded biquad stages in series)
  private hpfNodes: BiquadFilterNode[] = [];

  // Crossover LPF (4 cascaded biquad stages in series)
  private lpfNodes: BiquadFilterNode[] = [];

  // Parametric EQ (5 bands in series)
  private peqNodes: BiquadFilterNode[] = [];

  // Graphic EQ (10 ISO bands in series)
  private geqNodes: BiquadFilterNode[] = [];

  // Dynamics processing
  private compressorNode: DynamicsCompressorNode;
  private compMakeupNode: GainNode;
  private limiterNode: DynamicsCompressorNode;
  private limiterCeilingNode: GainNode;

  // Metering buffers & clip-hold state
  private inputBuffer: Float32Array;
  private procBuffer: Float32Array;
  private outBuffer: Float32Array;
  private clipHoldTimer: number = 0;
  private isClippingState: boolean = false;

  private currentConfig: ChannelConfig;

  constructor(id: 'L' | 'R', ctx: AudioContext, initialConfig: ChannelConfig) {
    this.id = id;
    this.ctx = ctx;
    this.currentConfig = initialConfig;

    // 1. Channel Input Node (Discrete Mono)
    this.inputNode = ctx.createGain();
    this.inputNode.gain.value = 1.0;
    lockDiscreteMono(this.inputNode);

    // 2. Input Metering Tap (passive tap before any DSP processing)
    this.inputAnalyserNode = ctx.createAnalyser();
    this.inputAnalyserNode.fftSize = 2048;
    this.inputAnalyserNode.smoothingTimeConstant = 0.8;
    this.inputBuffer = new Float32Array(this.inputAnalyserNode.fftSize);

    // 3. Gain Trim (-48 dB to +12 dB)
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1.0;
    lockDiscreteMono(this.gainNode);

    // 4. Polarity / Phase (0° normal: 1.0, 180° inverted: -1.0)
    this.phaseNode = ctx.createGain();
    this.phaseNode.gain.value = 1.0;
    lockDiscreteMono(this.phaseNode);

    // 5. Independent Time Alignment Delay (0 to 1000 ms)
    this.delayNode = ctx.createDelay(1.5);
    this.delayNode.delayTime.value = 0;
    lockDiscreteMono(this.delayNode);

    // 6. Crossover HPF Cascade (4 cascaded highpass biquad filters)
    for (let i = 0; i < 4; i++) {
      const node = ctx.createBiquadFilter();
      node.type = 'highpass';
      node.frequency.value = 10;
      node.Q.value = 0.7071;
      lockDiscreteMono(node);
      this.hpfNodes.push(node);
    }

    // 7. Crossover LPF Cascade (4 cascaded lowpass biquad filters)
    for (let i = 0; i < 4; i++) {
      const node = ctx.createBiquadFilter();
      node.type = 'lowpass';
      node.frequency.value = 20000;
      node.Q.value = 0.7071;
      lockDiscreteMono(node);
      this.lpfNodes.push(node);
    }

    // 8. Parametric EQ (5 bands in series)
    for (let i = 0; i < 5; i++) {
      const node = ctx.createBiquadFilter();
      node.type = 'peaking';
      node.gain.value = 0;
      node.frequency.value = 1000;
      node.Q.value = 1.414;
      lockDiscreteMono(node);
      this.peqNodes.push(node);
    }

    // 9. Graphic EQ (10 ISO bands in series)
    for (let i = 0; i < 10; i++) {
      const node = ctx.createBiquadFilter();
      node.type = 'peaking';
      node.gain.value = 0;
      node.frequency.value = 1000;
      node.Q.value = 1.414;
      lockDiscreteMono(node);
      this.geqNodes.push(node);
    }

    // 10. Processing Metering Tap (passive tap after HPF, LPF, PEQ, GEQ)
    this.processingAnalyserNode = ctx.createAnalyser();
    this.processingAnalyserNode.fftSize = 1024;
    this.procBuffer = new Float32Array(this.processingAnalyserNode.fftSize);

    // 11. Dynamics Compressor & Makeup Gain
    this.compressorNode = ctx.createDynamicsCompressor();
    this.compMakeupNode = ctx.createGain();
    this.compMakeupNode.gain.value = 1.0;
    lockDiscreteMono(this.compMakeupNode);

    // 12. Brickwall Peak Limiter & Ceiling Gain
    this.limiterNode = ctx.createDynamicsCompressor();
    this.limiterNode.knee.value = 0;
    this.limiterNode.ratio.value = 20;
    this.limiterCeilingNode = ctx.createGain();
    this.limiterCeilingNode.gain.value = 1.0;
    lockDiscreteMono(this.limiterCeilingNode);

    // 13. Channel Master Output Node (Gain & Mute) - Strictly Discrete Mono
    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 1.0;
    lockDiscreteMono(this.outputNode);

    // 14. Post-DSP Output Analyser Tap (for RTA spectrum and master meter)
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;
    this.outBuffer = new Float32Array(this.analyserNode.fftSize);

    // Wire the strict, unbroken serial chain
    this.wirePermanentSerialChain();

    // Apply initial configuration parameters
    this.update(initialConfig);
  }

  /**
   * Pre-DSP Analyser Node (Passive tap directly from Channel Input, before HPF, LPF, PEQ, GEQ, Comp, Limiter)
   */
  public get preAnalyserNode(): AnalyserNode {
    return this.inputAnalyserNode;
  }

  /**
   * Post-DSP Analyser Node (Passive tap directly after all DSP processing, before Merger)
   */
  public get postAnalyserNode(): AnalyserNode {
    return this.analyserNode;
  }

  /**
   * Connects the full chain once and permanently.
   * Nodes are NEVER disconnected or dynamically rewired during runtime.
   */
  private wirePermanentSerialChain(): void {
    // Input Tap (Passive monitoring)
    this.inputNode.connect(this.inputAnalyserNode);

    // Input -> Gain -> Polarity -> Delay
    this.inputNode.connect(this.gainNode);
    this.gainNode.connect(this.phaseNode);
    this.phaseNode.connect(this.delayNode);

    // Delay -> HPF Cascade (hpf0 -> hpf1 -> hpf2 -> hpf3)
    let current: AudioNode = this.delayNode;
    for (const hpf of this.hpfNodes) {
      current.connect(hpf);
      current = hpf;
    }

    // HPF Cascade -> LPF Cascade (lpf0 -> lpf1 -> lpf2 -> lpf3)
    for (const lpf of this.lpfNodes) {
      current.connect(lpf);
      current = lpf;
    }

    // LPF Cascade -> PEQ Cascade (peq0 -> peq1 -> peq2 -> peq3 -> peq4)
    for (const peq of this.peqNodes) {
      current.connect(peq);
      current = peq;
    }

    // PEQ Cascade -> GEQ Cascade (geq0 .. geq9)
    for (const geq of this.geqNodes) {
      current.connect(geq);
      current = geq;
    }

    // Processing Tap (Passive monitoring after all filter & EQ processing)
    current.connect(this.processingAnalyserNode);

    // Filter chain -> Compressor -> Makeup -> Limiter -> Ceiling -> Output
    current.connect(this.compressorNode);
    this.compressorNode.connect(this.compMakeupNode);
    this.compMakeupNode.connect(this.limiterNode);
    this.limiterNode.connect(this.limiterCeilingNode);
    this.limiterCeilingNode.connect(this.outputNode);

    // Output Tap (Passive monitoring for RTA spectrum and master meter)
    this.outputNode.connect(this.analyserNode);
  }

  /**
   * Calculates Q factors for standard audio filter alignments.
   */
  private getFilterQFactors(slope: FilterSlope, type: FilterType): number[] {
    switch (slope) {
      case 12:
        // 1 stage (2nd order, 12 dB/oct)
        if (type === 'Linkwitz-Riley') return [0.5]; // critically damped
        if (type === 'Bessel') return [0.5774];
        return [0.7071]; // Butterworth (-3dB)

      case 18:
        // 2 stages (approximating 18 dB/oct)
        if (type === 'Linkwitz-Riley') return [0.7071, 0.5];
        if (type === 'Bessel') return [0.69, 0.51];
        return [1.0, 0.5]; // Butterworth

      case 24:
        // 2 stages (4th order, 24 dB/oct)
        if (type === 'Linkwitz-Riley') {
          // Classic LR24: Two cascaded 2nd-order Butterworth filters (-6dB at fc)
          return [0.7071, 0.7071];
        }
        if (type === 'Bessel') {
          return [0.5219, 0.8055];
        }
        // Butterworth 4th order:
        return [0.5412, 1.3065];

      case 48:
        // 4 stages (8th order, 48 dB/oct)
        if (type === 'Linkwitz-Riley') {
          // Classic LR48: Two cascaded 4th-order Butterworth filters (-6dB at fc)
          return [0.5412, 1.3065, 0.5412, 1.3065];
        }
        if (type === 'Bessel') {
          return [0.506, 0.560, 0.704, 1.341];
        }
        // Butterworth 8th order:
        return [0.5098, 0.6013, 0.8999, 2.5629];

      default:
        return [0.7071, 0.7071];
    }
  }

  /**
   * Returns the number of active 2nd-order stages required for a given slope.
   */
  private getStagesForSlope(slope: FilterSlope): number {
    switch (slope) {
      case 12:
        return 1;
      case 18:
        return 2;
      case 24:
        return 2;
      case 48:
        return 4;
      default:
        return 2;
    }
  }

  /**
   * Directly sets the channel output mute state (used for Solo isolation and Mute).
   */
  public setMute(mute: boolean): void {
    const now = this.ctx.currentTime;
    this.outputNode.gain.setValueAtTime(mute ? 0 : 1.0, now);
  }

  /**
   * Realtime configuration update.
   * Modifies existing Web Audio nodes directly without disconnecting or re-wiring the graph.
   */
  public update(config: ChannelConfig): void {
    this.currentConfig = config;
    const now = this.ctx.currentTime;
    const isSub = config.subMode === 'SUB / LOW';

    // 1. Channel Master Mute
    if (config.mute) {
      this.outputNode.gain.setValueAtTime(0, now);
    } else {
      this.outputNode.gain.setValueAtTime(1.0, now);
    }

    // 2. Channel Master Bypass Mode
    // CRITICAL SUB INTEGRITY: In SUB mode, LPF MUST NEVER BE BYPASSED.
    // Full-range signal is NEVER allowed to leak through a SUB channel.
    if (config.bypass && !isSub) {
      this.gainNode.gain.setValueAtTime(1.0, now);
      this.phaseNode.gain.setValueAtTime(1.0, now);
      this.delayNode.delayTime.setValueAtTime(0, now);

      // Disable HPF stages (highpass at 10 Hz)
      for (const hpf of this.hpfNodes) {
        hpf.frequency.setValueAtTime(10, now);
        hpf.Q.setValueAtTime(0.7071, now);
      }

      // Disable LPF stages (lowpass at 20000 Hz)
      for (const lpf of this.lpfNodes) {
        lpf.frequency.setValueAtTime(20000, now);
        lpf.Q.setValueAtTime(0.7071, now);
      }

      // Disable PEQ stages
      for (const peq of this.peqNodes) {
        peq.gain.setValueAtTime(0, now);
      }

      // Disable GEQ stages
      for (const geq of this.geqNodes) {
        geq.gain.setValueAtTime(0, now);
      }

      // Disable Dynamics
      this.compressorNode.threshold.setValueAtTime(0, now);
      this.compressorNode.ratio.setValueAtTime(1.0, now);
      this.compMakeupNode.gain.setValueAtTime(1.0, now);
      this.limiterNode.threshold.setValueAtTime(0, now);
      this.limiterNode.ratio.setValueAtTime(1.0, now);
      this.limiterCeilingNode.gain.setValueAtTime(1.0, now);
      return;
    }

    // 3. Channel Gain Trim (-48 dB to +12 dB)
    const linearGain = Math.pow(10, Math.max(-48, Math.min(12, config.gain)) / 20);
    this.gainNode.gain.setValueAtTime(linearGain, now);

    // 4. Polarity / Phase Invert (0° normal: 1.0, 180° inverted: -1.0)
    this.phaseNode.gain.setValueAtTime(config.phaseInverted ? -1.0 : 1.0, now);

    // 5. Independent Time Alignment Delay (0 to 1000 ms)
    const delaySec = config.delayEnabled ? Math.max(0, Math.min(1.0, config.delayMs / 1000)) : 0;
    this.delayNode.delayTime.setValueAtTime(delaySec, now);

    // 6. Crossover HPF Update (Cascaded Stages in Series)
    if (config.hpf.enabled) {
      const hpfFreq = Math.max(20, Math.min(20000, config.hpf.frequency));
      const hpfStages = this.getStagesForSlope(config.hpf.slope);
      const hpfQList = this.getFilterQFactors(config.hpf.slope, config.hpf.type);

      for (let i = 0; i < 4; i++) {
        const node = this.hpfNodes[i];
        node.type = 'highpass';
        if (i < hpfStages) {
          node.frequency.setValueAtTime(hpfFreq, now);
          node.Q.setValueAtTime(hpfQList[i] ?? 0.7071, now);
        } else {
          // Transparent pass-through stage: highpass at 10 Hz (passes everything down to 20 Hz flat)
          node.frequency.setValueAtTime(10, now);
          node.Q.setValueAtTime(0.7071, now);
        }
      }
    } else {
      // HPF disabled: all stages transparent wire (10 Hz highpass)
      for (const node of this.hpfNodes) {
        node.type = 'highpass';
        node.frequency.setValueAtTime(10, now);
        node.Q.setValueAtTime(0.7071, now);
      }
    }

    // 7. Crossover LPF Update (Cascaded Stages in Series)
    // MANDATORY SUB INTEGRITY: In SUB mode, LPF is ALWAYS active and enforced.
    const isLpfActive = isSub || config.lpf.enabled;
    const lpfFreq = isSub
      ? Math.max(20, Math.min(250, config.lpf.frequency || 80))
      : Math.max(20, Math.min(20000, config.lpf.frequency));
    const lpfSlope = config.lpf.slope;
    const lpfType = config.lpf.type;
    const lpfStages = this.getStagesForSlope(lpfSlope);
    const lpfQList = this.getFilterQFactors(lpfSlope, lpfType);

    if (isLpfActive) {
      for (let i = 0; i < 4; i++) {
        const node = this.lpfNodes[i];
        node.type = 'lowpass';
        if (i < lpfStages) {
          // Active cascaded stage
          node.frequency.setValueAtTime(lpfFreq, now);
          node.Q.setValueAtTime(lpfQList[i] ?? 0.7071, now);
        } else {
          // Inactive stages: transparent lowpass at 20000 Hz (0.00 dB flat in bass/mid)
          node.frequency.setValueAtTime(20000, now);
          node.Q.setValueAtTime(0.7071, now);
        }
      }
    } else {
      // LPF disabled: all stages transparent wire (20000 Hz lowpass)
      for (const node of this.lpfNodes) {
        node.type = 'lowpass';
        node.frequency.setValueAtTime(20000, now);
        node.Q.setValueAtTime(0.7071, now);
      }
    }

    // 8. Parametric EQ (5 Bands)
    config.peqBands.forEach((band, idx) => {
      const node = this.peqNodes[idx];
      if (!node) return;

      if (config.peqEnabled && band.enabled) {
        node.type = band.type;
        node.frequency.setValueAtTime(Math.max(20, Math.min(20000, band.frequency)), now);
        node.gain.setValueAtTime(Math.max(-15, Math.min(15, band.gain)), now);
        node.Q.setValueAtTime(Math.max(0.1, Math.min(25, band.q)), now);
      } else {
        node.type = 'peaking';
        node.gain.setValueAtTime(0, now);
        node.frequency.setValueAtTime(1000, now);
        node.Q.setValueAtTime(1.0, now);
      }
    });

    // 9. Graphic EQ (10 ISO Bands)
    config.geqBands.forEach((band, idx) => {
      const node = this.geqNodes[idx];
      if (!node) return;

      node.type = 'peaking';
      node.frequency.setValueAtTime(band.frequency, now);
      node.Q.setValueAtTime(1.414, now);
      if (config.geqEnabled) {
        node.gain.setValueAtTime(Math.max(-12, Math.min(12, band.gain)), now);
      } else {
        node.gain.setValueAtTime(0, now);
      }
    });

    // 10. Dynamics Compressor & Makeup Gain
    const comp = config.compressor;
    if (comp.enabled) {
      this.compressorNode.threshold.setValueAtTime(comp.threshold, now);
      this.compressorNode.ratio.setValueAtTime(comp.ratio, now);
      this.compressorNode.attack.setValueAtTime(Math.max(0.001, comp.attack), now);
      this.compressorNode.release.setValueAtTime(Math.max(0.01, comp.release), now);
      this.compMakeupNode.gain.setValueAtTime(Math.pow(10, comp.makeupGain / 20), now);
    } else {
      this.compressorNode.threshold.setValueAtTime(0, now);
      this.compressorNode.ratio.setValueAtTime(1.0, now);
      this.compMakeupNode.gain.setValueAtTime(1.0, now);
    }

    // 11. Brickwall Peak Limiter & Ceiling Gain
    const lim = config.limiter;
    if (lim.enabled) {
      this.limiterNode.threshold.setValueAtTime(lim.threshold, now);
      this.limiterNode.ratio.setValueAtTime(20.0, now);
      this.limiterNode.attack.setValueAtTime(Math.max(0.0005, lim.attack), now);
      this.limiterNode.release.setValueAtTime(Math.max(0.01, lim.release), now);
      this.limiterCeilingNode.gain.setValueAtTime(Math.pow(10, lim.ceiling / 20), now);
    } else {
      this.limiterNode.threshold.setValueAtTime(0, now);
      this.limiterNode.ratio.setValueAtTime(1.0, now);
      this.limiterCeilingNode.gain.setValueAtTime(1.0, now);
    }
  }

  /**
   * Returns comprehensive DSP debug information for real-time audit.
   */
  public getDebugInfo(): DSPDebugInfo {
    const isSub = this.currentConfig.subMode === 'SUB / LOW';
    const lpfStages = this.getStagesForSlope(this.currentConfig.lpf.slope);
    const hpfStages = this.getStagesForSlope(this.currentConfig.hpf.slope);

    return {
      channelId: this.id,
      isSubMode: isSub,
      hpf: {
        enabled: this.currentConfig.hpf.enabled,
        frequency: this.currentConfig.hpf.frequency,
        slope: this.currentConfig.hpf.slope,
        type: this.currentConfig.hpf.type,
        activeStages: this.currentConfig.hpf.enabled ? hpfStages : 0,
        nodeCount: this.hpfNodes.length,
      },
      lpf: {
        enabled: isSub ? true : this.currentConfig.lpf.enabled,
        frequency: isSub ? Math.min(250, this.currentConfig.lpf.frequency) : this.currentConfig.lpf.frequency,
        slope: this.currentConfig.lpf.slope,
        type: this.currentConfig.lpf.type,
        activeStages: (isSub || this.currentConfig.lpf.enabled) ? lpfStages : 0,
        nodeCount: this.lpfNodes.length,
      },
      crossoverNodeCount: this.hpfNodes.length + this.lpfNodes.length,
      totalChainNodeCount: 32, // 1+1+1+1+4+4+5+10+1+1+1+1+1
      chainSequence: [
        'inputNode (GainNode)',
        'gainNode (GainNode)',
        'phaseNode (GainNode)',
        'delayNode (DelayNode)',
        'hpfNodes[0..3] (4x BiquadFilterNode cascade)',
        'lpfNodes[0..3] (4x BiquadFilterNode cascade)',
        'peqNodes[0..4] (5x BiquadFilterNode cascade)',
        'geqNodes[0..9] (10x BiquadFilterNode cascade)',
        'compressorNode (DynamicsCompressorNode)',
        'compMakeupNode (GainNode)',
        'limiterNode (DynamicsCompressorNode)',
        'limiterCeilingNode (GainNode)',
        'outputNode (GainNode)',
      ],
      connections: [
        'inputNode -> gainNode',
        'gainNode -> phaseNode',
        'phaseNode -> delayNode',
        'delayNode -> hpfNode[0]',
        'hpfNode[0] -> hpfNode[1] -> hpfNode[2] -> hpfNode[3]',
        'hpfNode[3] -> lpfNode[0]',
        'lpfNode[0] -> lpfNode[1] -> lpfNode[2] -> lpfNode[3]',
        'lpfNode[3] -> peqNode[0]',
        'peqNode[0] -> peqNode[1] -> peqNode[2] -> peqNode[3] -> peqNode[4]',
        'peqNode[4] -> geqNode[0]',
        'geqNode[0] -> ... -> geqNode[9]',
        'geqNode[9] -> compressorNode',
        'compressorNode -> compMakeupNode',
        'compMakeupNode -> limiterNode',
        'limiterNode -> limiterCeilingNode',
        'limiterCeilingNode -> outputNode',
      ],
      hasBypassPath: false,
      isMuted: this.currentConfig.mute,
      isSolo: !!this.currentConfig.solo,
    };
  }

  /**
   * Helper to analyze time-domain buffer for precise Peak & RMS dBFS values.
   */
  private analyzeBuffer(analyser: AnalyserNode, buffer: Float32Array): { peakDb: number; rmsDb: number; peakRaw: number; rmsRaw: number } {
    analyser.getFloatTimeDomainData(buffer as any);
    let peak = 0;
    let sumSquares = 0;

    for (let i = 0; i < buffer.length; i++) {
      const absVal = Math.abs(buffer[i]);
      if (absVal > peak) peak = absVal;
      sumSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const peakDb = peak > 1e-5 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 1e-5 ? 20 * Math.log10(rms) : -100;

    return { peakDb, rmsDb, peakRaw: peak, rmsRaw: rms };
  }

  /**
   * Collects all real-time metering metrics across Gain Structure stages.
   */
  public getMeterData(): ChannelMeterData {
    const inMetrics = this.analyzeBuffer(this.inputAnalyserNode, this.inputBuffer);
    const procMetrics = this.analyzeBuffer(this.processingAnalyserNode, this.procBuffer);
    const outMetrics = this.analyzeBuffer(this.analyserNode, this.outBuffer);

    // Peak clipping detection with 1.5s visual hold
    const now = Date.now();
    if (outMetrics.peakRaw >= 0.99 && !this.currentConfig.mute) {
      this.isClippingState = true;
      this.clipHoldTimer = now + 1500;
    } else if (now > this.clipHoldTimer) {
      this.isClippingState = false;
    }

    // Gain reduction metrics
    let compRed = 0;
    if (this.currentConfig.compressor.enabled && typeof this.compressorNode.reduction === 'number') {
      compRed = Math.abs(this.compressorNode.reduction);
    }

    let limRed = 0;
    if (this.currentConfig.limiter.enabled && typeof this.limiterNode.reduction === 'number') {
      limRed = Math.abs(this.limiterNode.reduction);
    }

    return {
      inputLevel: inMetrics.peakDb,
      processingLevel: procMetrics.peakDb,
      outputLevel: outMetrics.peakDb,
      peak: outMetrics.peakDb,
      rms: outMetrics.rmsDb,
      peakRaw: outMetrics.peakRaw,
      rmsRaw: outMetrics.rmsRaw,
      isClipping: this.isClippingState,
      compReduction: compRed,
      limiterReduction: limRed,
    };
  }

  public clearClip(): void {
    this.isClippingState = false;
    this.clipHoldTimer = 0;
  }
}
