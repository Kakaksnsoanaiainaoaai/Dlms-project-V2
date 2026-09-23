export type FilterType = 'Butterworth' | 'Linkwitz-Riley' | 'Bessel';
export type FilterSlope = 12 | 18 | 24 | 48; // dB/octave
export type SubMode = 'FULL RANGE' | 'SUB / LOW' | 'HIGH';

export type PEQBandType = 'peaking' | 'lowshelf' | 'highshelf' | 'highpass' | 'lowpass';

export interface PEQBandConfig {
  id: number;
  name: string;
  enabled: boolean;
  type: PEQBandType;
  frequency: number; // 20 - 20000 Hz
  gain: number; // -15 to +15 dB
  q: number; // 0.1 to 20
}

export interface GEQBandConfig {
  frequency: number; // Hz (31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k)
  gain: number; // -12 to +12 dB
}

export interface CrossoverFilterConfig {
  enabled: boolean;
  frequency: number; // 20 - 20000 Hz
  slope: FilterSlope;
  type: FilterType;
}

export interface CompressorConfig {
  enabled: boolean;
  threshold: number; // -60 to 0 dB
  ratio: number; // 1 to 20
  attack: number; // 0.001 to 1.0 s
  release: number; // 0.01 to 1.0 s
  makeupGain: number; // 0 to 24 dB
}

export interface LimiterConfig {
  enabled: boolean;
  threshold: number; // -24 to 0 dB
  attack: number; // 0.0005 to 0.1 s
  release: number; // 0.01 to 0.5 s
  ceiling: number; // -12 to 0 dB
}

export interface ChannelConfig {
  id: 'L' | 'R';
  name: string;
  bypass: boolean; // Master DSP Bypass (true = direct source audio, false = full processing chain)
  gain: number; // -48 to +12 dB
  mute: boolean;
  solo?: boolean; // Solo monitoring isolation
  phaseInverted: boolean; // Polarity: normal (false) or inverted (true)
  subMode: SubMode;
  
  // High-Pass Filter (HPF)
  hpf: CrossoverFilterConfig;
  
  // Low-Pass Filter (LPF)
  lpf: CrossoverFilterConfig;
  
  // Parametric EQ
  peqEnabled: boolean;
  peqBands: PEQBandConfig[];
  
  // Graphic EQ
  geqEnabled: boolean;
  geqBands: GEQBandConfig[];
  
  // Dynamics
  compressor: CompressorConfig;
  limiter: LimiterConfig;
  
  // Delay
  delayEnabled: boolean;
  delayMs: number; // 0 to 500 ms
}

export interface DSPPreset {
  id: string;
  name: string;
  createdAt: number;
  channels: {
    L: ChannelConfig;
    R: ChannelConfig;
  };
}

export type DSPStatus = 'DSP ACTIVE' | 'FALLBACK MODE' | 'DSP UNAVAILABLE';

export type RTASource = 'L + R' | 'IN L' | 'IN R' | 'POST L' | 'POST R';

export interface ChannelMeterData {
  inputLevel: number; // dBFS (-inf to +12)
  processingLevel: number; // dBFS (-inf to +12)
  outputLevel: number; // dBFS (-inf to +12)
  peak: number; // dBFS (-inf to 0+)
  rms: number; // dBFS (-inf to 0+)
  peakRaw: number; // 0 to 1+
  rmsRaw: number; // 0 to 1+
  isClipping: boolean;
  compReduction: number; // dB of gain reduction (positive number, e.g. 3.5 dB)
  limiterReduction: number; // dB of limiter reduction
}

export interface AudioPlaybackState {
  loaded: boolean;
  fileName: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number; // 0 to 1
  isMono: boolean;
  sampleRate: number;
}

export interface DSPDebugInfo {
  channelId: 'L' | 'R';
  isSubMode: boolean;
  hpf: {
    enabled: boolean;
    frequency: number;
    slope: FilterSlope;
    type: FilterType;
    activeStages: number;
    nodeCount: number;
  };
  lpf: {
    enabled: boolean;
    frequency: number;
    slope: FilterSlope;
    type: FilterType;
    activeStages: number;
    nodeCount: number;
  };
  crossoverNodeCount: number;
  totalChainNodeCount: number;
  chainSequence: string[];
  connections: string[];
  hasBypassPath: boolean;
  isMuted: boolean;
  isSolo: boolean;
}

