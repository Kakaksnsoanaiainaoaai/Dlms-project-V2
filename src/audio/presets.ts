import { ChannelConfig, DSPPreset, GEQBandConfig, PEQBandConfig } from '../types';

export const ISO_GEQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export function createDefaultGEQBands(): GEQBandConfig[] {
  return ISO_GEQ_FREQUENCIES.map((freq) => ({
    frequency: freq,
    gain: 0,
  }));
}

export function createDefaultPEQBands(): PEQBandConfig[] {
  return [
    { id: 1, name: 'B1 Low Shelf', enabled: true, type: 'lowshelf', frequency: 80, gain: 0, q: 0.71 },
    { id: 2, name: 'B2 Bell Low', enabled: true, type: 'peaking', frequency: 250, gain: 0, q: 1.41 },
    { id: 3, name: 'B3 Bell Mid', enabled: true, type: 'peaking', frequency: 1000, gain: 0, q: 1.41 },
    { id: 4, name: 'B4 Bell High', enabled: true, type: 'peaking', frequency: 4000, gain: 0, q: 1.41 },
    { id: 5, name: 'B5 High Shelf', enabled: true, type: 'highshelf', frequency: 12000, gain: 0, q: 0.71 },
  ];
}

export function createDefaultChannelConfig(id: 'L' | 'R'): ChannelConfig {
  return {
    id,
    name: id === 'L' ? 'INPUT L' : 'INPUT R',
    bypass: false,
    gain: 0, // dB
    mute: false,
    phaseInverted: false,
    subMode: 'FULL RANGE',
    hpf: {
      enabled: false,
      frequency: 35,
      slope: 24,
      type: 'Linkwitz-Riley',
    },
    lpf: {
      enabled: false,
      frequency: 18000,
      slope: 24,
      type: 'Linkwitz-Riley',
    },
    peqEnabled: true,
    peqBands: createDefaultPEQBands(),
    geqEnabled: false,
    geqBands: createDefaultGEQBands(),
    compressor: {
      enabled: false,
      threshold: -18,
      ratio: 4,
      attack: 0.02,
      release: 0.2,
      makeupGain: 0,
    },
    limiter: {
      enabled: true,
      threshold: -1.0,
      attack: 0.001,
      release: 0.05,
      ceiling: -0.2,
    },
    delayEnabled: false,
    delayMs: 0,
  };
}

export const FACTORY_PRESETS: DSPPreset[] = [
  {
    id: 'flat-full-range',
    name: 'Flat Full Range (Reference)',
    createdAt: 1700000000000,
    channels: {
      L: createDefaultChannelConfig('L'),
      R: createDefaultChannelConfig('R'),
    },
  },
  {
    id: 'sub-satellite-split',
    name: '2-Way Split (L=Sub, R=High Top)',
    createdAt: 1700000001000,
    channels: {
      L: {
        ...createDefaultChannelConfig('L'),
        subMode: 'SUB / LOW',
        hpf: { enabled: true, frequency: 32, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
        gain: +1.5,
        compressor: {
          enabled: true,
          threshold: -14,
          ratio: 6,
          attack: 0.03,
          release: 0.25,
          makeupGain: 1.0,
        },
      },
      R: {
        ...createDefaultChannelConfig('R'),
        subMode: 'HIGH',
        hpf: { enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: false, frequency: 20000, slope: 24, type: 'Linkwitz-Riley' },
        gain: 0,
        delayEnabled: true,
        delayMs: 1.2, // Phase alignment delay
      },
    },
  },
  {
    id: 'pa-club-punch',
    name: 'Club Punch & Crisp Highs',
    createdAt: 1700000002000,
    channels: {
      L: {
        ...createDefaultChannelConfig('L'),
        hpf: { enabled: true, frequency: 38, slope: 24, type: 'Butterworth' },
        lpf: { enabled: false, frequency: 20000, slope: 24, type: 'Linkwitz-Riley' },
        peqBands: [
          { id: 1, name: 'B1 Low Shelf', enabled: true, type: 'peaking', frequency: 60, gain: 3.5, q: 1.8 },
          { id: 2, name: 'B2 Bell Low', enabled: true, type: 'peaking', frequency: 220, gain: -2.0, q: 2.0 },
          { id: 3, name: 'B3 Bell Mid', enabled: true, type: 'peaking', frequency: 1000, gain: 0, q: 1.41 },
          { id: 4, name: 'B4 Bell High', enabled: true, type: 'peaking', frequency: 5000, gain: 2.0, q: 1.2 },
          { id: 5, name: 'B5 High Shelf', enabled: true, type: 'highshelf', frequency: 12000, gain: 3.0, q: 0.71 },
        ],
        compressor: {
          enabled: true,
          threshold: -16,
          ratio: 3.5,
          attack: 0.015,
          release: 0.18,
          makeupGain: 1.5,
        },
      },
      R: {
        ...createDefaultChannelConfig('R'),
        hpf: { enabled: true, frequency: 38, slope: 24, type: 'Butterworth' },
        lpf: { enabled: false, frequency: 20000, slope: 24, type: 'Linkwitz-Riley' },
        peqBands: [
          { id: 1, name: 'B1 Low Shelf', enabled: true, type: 'peaking', frequency: 60, gain: 3.5, q: 1.8 },
          { id: 2, name: 'B2 Bell Low', enabled: true, type: 'peaking', frequency: 220, gain: -2.0, q: 2.0 },
          { id: 3, name: 'B3 Bell Mid', enabled: true, type: 'peaking', frequency: 1000, gain: 0, q: 1.41 },
          { id: 4, name: 'B4 Bell High', enabled: true, type: 'peaking', frequency: 5000, gain: 2.0, q: 1.2 },
          { id: 5, name: 'B5 High Shelf', enabled: true, type: 'highshelf', frequency: 12000, gain: 3.0, q: 0.71 },
        ],
        compressor: {
          enabled: true,
          threshold: -16,
          ratio: 3.5,
          attack: 0.015,
          release: 0.18,
          makeupGain: 1.5,
        },
      },
    },
  },
  {
    id: 'live-vocal-pa',
    name: 'Live Vocal PA & Speech Clarity',
    createdAt: 1700000003000,
    channels: {
      L: {
        ...createDefaultChannelConfig('L'),
        hpf: { enabled: true, frequency: 80, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: true, frequency: 16000, slope: 18, type: 'Butterworth' },
        peqBands: [
          { id: 1, name: 'B1 Low Cut', enabled: true, type: 'highpass', frequency: 100, gain: 0, q: 0.71 },
          { id: 2, name: 'B2 Mud Cut', enabled: true, type: 'peaking', frequency: 320, gain: -3.5, q: 2.5 },
          { id: 3, name: 'B3 Vocal Body', enabled: true, type: 'peaking', frequency: 1200, gain: 1.5, q: 1.8 },
          { id: 4, name: 'B4 Presence', enabled: true, type: 'peaking', frequency: 3500, gain: 3.0, q: 1.5 },
          { id: 5, name: 'B5 Air', enabled: true, type: 'highshelf', frequency: 10000, gain: 1.5, q: 0.71 },
        ],
        compressor: {
          enabled: true,
          threshold: -20,
          ratio: 4,
          attack: 0.01,
          release: 0.12,
          makeupGain: 2.5,
        },
      },
      R: {
        ...createDefaultChannelConfig('R'),
        hpf: { enabled: true, frequency: 80, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: true, frequency: 16000, slope: 18, type: 'Butterworth' },
        peqBands: [
          { id: 1, name: 'B1 Low Cut', enabled: true, type: 'highpass', frequency: 100, gain: 0, q: 0.71 },
          { id: 2, name: 'B2 Mud Cut', enabled: true, type: 'peaking', frequency: 320, gain: -3.5, q: 2.5 },
          { id: 3, name: 'B3 Vocal Body', enabled: true, type: 'peaking', frequency: 1200, gain: 1.5, q: 1.8 },
          { id: 4, name: 'B4 Presence', enabled: true, type: 'peaking', frequency: 3500, gain: 3.0, q: 1.5 },
          { id: 5, name: 'B5 Air', enabled: true, type: 'highshelf', frequency: 10000, gain: 1.5, q: 0.71 },
        ],
        compressor: {
          enabled: true,
          threshold: -20,
          ratio: 4,
          attack: 0.01,
          release: 0.12,
          makeupGain: 2.5,
        },
      },
    },
  },
  {
    id: 'crossover-split-1k',
    name: '1 kHz Crossover Test (L=HPF 1k, R=LPF 1k)',
    createdAt: 1700000004000,
    channels: {
      L: {
        ...createDefaultChannelConfig('L'),
        hpf: { enabled: true, frequency: 1000, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: false, frequency: 20000, slope: 24, type: 'Linkwitz-Riley' },
      },
      R: {
        ...createDefaultChannelConfig('R'),
        hpf: { enabled: false, frequency: 20, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { enabled: true, frequency: 1000, slope: 24, type: 'Linkwitz-Riley' },
      },
    },
  },
];

const STORAGE_KEY = 'dlms_virtual_presets_v1';

export function loadUserPresets(): DSPPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load user presets from localStorage:', err);
    return [];
  }
}

export function saveUserPresets(presets: DSPPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (err) {
    console.error('Failed to save user presets to localStorage:', err);
  }
}
