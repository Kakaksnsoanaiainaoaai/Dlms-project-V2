import {
  AudioPlaybackState,
  ChannelConfig,
  ChannelMeterData,
  DSPDebugInfo,
  DSPPreset,
  DSPStatus,
} from '../types';
import { DSPChannel } from './dsp-channel';
import { createDefaultChannelConfig, FACTORY_PRESETS, loadUserPresets, saveUserPresets } from './presets';

type StateListener = (state: AudioPlaybackState) => void;
type MeterListener = (meters: { L: ChannelMeterData; R: ChannelMeterData }) => void;
type StatusListener = (status: DSPStatus) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private status: DSPStatus = 'DSP UNAVAILABLE';

  // Nodes
  private audioElement: HTMLAudioElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  private masterGainNode: GainNode | null = null;
  public masterAnalyserNode: AnalyserNode | null = null;

  // Channels
  public channelL: DSPChannel | null = null;
  public channelR: DSPChannel | null = null;

  // Configurations
  public configL: ChannelConfig;
  public configR: ChannelConfig;
  public isLinked: boolean = false;

  // Presets
  public presets: DSPPreset[] = [];
  public currentPresetId: string = 'flat-full-range';

  // Playback state
  private playbackState: AudioPlaybackState = {
    loaded: false,
    fileName: '',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isPaused: false,
    volume: 1.0,
    isMono: false,
    sampleRate: 44100,
  };

  // Listeners
  private stateListeners: Set<StateListener> = new Set();
  private meterListeners: Set<MeterListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  // Metering loop
  private meterAnimFrame: number | null = null;

  // Generator Tone nodes (for test signals)
  private activeTestToneSource: AudioNode | null = null;

  constructor() {
    this.configL = createDefaultChannelConfig('L');
    this.configR = createDefaultChannelConfig('R');
    this.initPresets();
  }

  private initPresets(): void {
    const user = loadUserPresets();
    this.presets = [...FACTORY_PRESETS, ...user];
  }

  public getStatus(): DSPStatus {
    return this.status;
  }

  public getPlaybackState(): AudioPlaybackState {
    return { ...this.playbackState };
  }

  /**
   * Initializes the AudioContext and the full Web Audio DSP chain.
   */
  public async initAudioContext(): Promise<boolean> {
    if (this.ctx && this.status === 'DSP ACTIVE') {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return true;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) {
        this.setStatus('DSP UNAVAILABLE');
        return false;
      }

      this.ctx = new AudioCtxClass();

      // Audio Element for streaming local audio files
      if (!this.audioElement) {
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = 'anonymous';
        this.audioElement.preload = 'auto';

        this.audioElement.addEventListener('timeupdate', () => {
          if (this.audioElement) {
            this.playbackState.currentTime = this.audioElement.currentTime;
            this.notifyState();
          }
        });

        this.audioElement.addEventListener('durationchange', () => {
          if (this.audioElement) {
            this.playbackState.duration = this.audioElement.duration || 0;
            this.notifyState();
          }
        });

        this.audioElement.addEventListener('play', () => {
          this.playbackState.isPlaying = true;
          this.playbackState.isPaused = false;
          this.notifyState();
        });

        this.audioElement.addEventListener('pause', () => {
          this.playbackState.isPlaying = false;
          this.playbackState.isPaused = true;
          this.notifyState();
        });

        this.audioElement.addEventListener('ended', () => {
          this.playbackState.isPlaying = false;
          this.playbackState.isPaused = false;
          this.playbackState.currentTime = 0;
          this.notifyState();
        });

        this.audioElement.addEventListener('error', (e) => {
          console.error('Audio element error:', e);
          this.playbackState.isPlaying = false;
          this.playbackState.isPaused = false;
          this.notifyState();
        });
      }

      // 1. Media Element Source
      this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioElement);

      // 2. Channel Splitter (2 discrete channels: 0 = Left, 1 = Right)
      // Strictly isolates stereo into independent L and R channels
      this.splitterNode = this.ctx.createChannelSplitter(2);
      this.mediaSourceNode.connect(this.splitterNode);

      // 4. Create DSP Channels
      this.channelL = new DSPChannel('L', this.ctx, this.configL);
      this.channelR = new DSPChannel('R', this.ctx, this.configR);

      // Splitter output 0 (Left) -> Channel L input ONLY (Strict Left path)
      this.splitterNode.connect(this.channelL.inputNode, 0, 0);

      // Splitter output 1 (Right) -> Channel R input ONLY (Strict Right path)
      this.splitterNode.connect(this.channelR.inputNode, 1, 0);

      // 5. Channel Merger (Merges Channel L to output 0 and Channel R to output 1)
      this.mergerNode = this.ctx.createChannelMerger(2);
      this.channelL.outputNode.connect(this.mergerNode, 0, 0);
      this.channelR.outputNode.connect(this.mergerNode, 0, 1);

      // 6. Master Gain
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.value = 1.0;
      this.mergerNode.connect(this.masterGainNode);

      // 7. Output to Destination directly from Master Gain (speakers / headphones)
      this.masterGainNode.connect(this.ctx.destination);

      // 8. Master Analyser (Post Master Gain TAP ONLY - does NOT connect to destination)
      this.masterAnalyserNode = this.ctx.createAnalyser();
      this.masterAnalyserNode.fftSize = 2048;
      this.masterGainNode.connect(this.masterAnalyserNode);

      this.playbackState.sampleRate = this.ctx.sampleRate;

      // Ensure state is running
      if (this.ctx.state === 'suspended') {
        this.setStatus('FALLBACK MODE');
        await this.ctx.resume();
      }

      if (this.ctx.state === 'running') {
        this.setStatus('DSP ACTIVE');
      } else {
        this.setStatus('FALLBACK MODE');
      }

      // Start metering animation loop
      this.startMeterLoop();

      return true;
    } catch (err) {
      console.error('Failed to initialize AudioContext & DSP:', err);
      this.setStatus('DSP UNAVAILABLE');
      return false;
    }
  }

  private setStatus(status: DSPStatus): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  /**
   * Loads user audio file via File object.
   */
  public async loadAudioFile(file: File): Promise<void> {
    await this.initAudioContext();
    this.stopTestTone();

    if (!this.audioElement) return;

    try {
      const objectUrl = URL.createObjectURL(file);
      this.audioElement.src = objectUrl;
      this.audioElement.load();

      this.playbackState.loaded = true;
      this.playbackState.fileName = file.name;
      this.playbackState.currentTime = 0;
      this.playbackState.duration = 0;
      this.playbackState.isPlaying = false;
      this.playbackState.isPaused = false;
      this.notifyState();
    } catch (err) {
      console.error('Error loading audio file:', err);
      alert('Gagal memuat file audio. Format mungkin tidak didukung.');
    }
  }

  /**
   * Generates built-in synthesized test tone (Pink Noise, Sine 1kHz, Sine Sweep, Stereo Demo)
   */
  public async loadBuiltinTone(type: 'pink-noise' | 'sine-1k' | 'sine-sweep' | 'stereo-groove'): Promise<void> {
    await this.initAudioContext();
    if (!this.ctx || !this.splitterNode) return;

    this.stopAudio();
    this.stopTestTone();

    const sampleRate = this.ctx.sampleRate;
    const duration = type === 'sine-sweep' ? 10 : 8;
    const numChannels = 2;
    const buffer = this.ctx.createBuffer(numChannels, sampleRate * duration, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    if (type === 'pink-noise') {
      // Paul Kellet's filtered pink noise generator
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < left.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        left[i] = pink;
        right[i] = pink;
      }
    } else if (type === 'sine-1k') {
      for (let i = 0; i < left.length; i++) {
        const s = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0.35;
        left[i] = s;
        right[i] = s;
      }
    } else if (type === 'sine-sweep') {
      // Logarithmic sine sweep 20 Hz -> 20,000 Hz
      const fStart = 20;
      const fEnd = 20000;
      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const freq = fStart * Math.pow(fEnd / fStart, t / duration);
        const phase = (2 * Math.PI * fStart * (Math.pow(fEnd / fStart, t / duration) - 1)) / (Math.log(fEnd / fStart) / duration);
        const s = Math.sin(phase) * 0.35;
        left[i] = s;
        right[i] = s;
      }
    } else if (type === 'stereo-groove') {
      // Synthesized rhythmic stereo groove (sub kick + bassline + snare noise + stereo hi-hat)
      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const beatTime = t % 0.5;
        const barTime = t % 2.0;

        // Sub kick on beat 0 and 1.0 (sub bass 55Hz dropping to 40Hz)
        let kick = 0;
        if (barTime < 0.25 || (barTime >= 1.0 && barTime < 1.25)) {
          const kt = barTime < 0.25 ? barTime : barTime - 1.0;
          const kf = 90 * Math.exp(-kt * 25) + 45;
          kick = Math.sin(2 * Math.PI * kf * kt) * Math.exp(-kt * 10) * 0.5;
        }

        // Snare / clap on beat 0.5 and 1.5
        let snare = 0;
        if ((barTime >= 0.5 && barTime < 0.75) || (barTime >= 1.5 && barTime < 1.75)) {
          const st = barTime >= 1.5 ? barTime - 1.5 : barTime - 0.5;
          const noise = (Math.random() * 2 - 1) * Math.exp(-st * 16);
          const tone = Math.sin(2 * Math.PI * 180 * st) * Math.exp(-st * 20);
          snare = (noise * 0.6 + tone * 0.4) * 0.35;
        }

        // Bass synth groove (80Hz - 160Hz)
        const bassNote = Math.floor(barTime * 4) % 4 === 2 ? 82.4 : 55.0;
        const bass = Math.sin(2 * Math.PI * bassNote * t) * 0.2;

        // Stereo high-hat (pan alternating Left / Right)
        const hatTime = t % 0.125;
        const hat = (Math.random() * 2 - 1) * Math.exp(-hatTime * 60) * 0.15;
        const hatPanL = Math.sin(t * 8) > 0 ? 0.9 : 0.2;
        const hatPanR = Math.sin(t * 8) <= 0 ? 0.9 : 0.2;

        left[i] = (kick + bass * 0.8 + snare * 0.7 + hat * hatPanL) * 0.6;
        right[i] = (kick + bass * 0.8 + snare * 0.7 + hat * hatPanR) * 0.6;
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Connect source -> Splitter (Splitter isolates Left to Ch L and Right to Ch R)
    source.connect(this.splitterNode);
    source.start();
    this.activeTestToneSource = source;

    this.playbackState.loaded = true;
    this.playbackState.fileName = `Built-in: ${type.toUpperCase()}`;
    this.playbackState.duration = duration;
    this.playbackState.currentTime = 0;
    this.playbackState.isPlaying = true;
    this.playbackState.isPaused = false;
    this.notifyState();
  }

  private stopTestTone(): void {
    if (this.activeTestToneSource) {
      try {
        (this.activeTestToneSource as AudioBufferSourceNode).stop();
        this.activeTestToneSource.disconnect();
      } catch (_) {}
      this.activeTestToneSource = null;
    }
  }

  public async play(): Promise<void> {
    await this.initAudioContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.activeTestToneSource) {
      this.playbackState.isPlaying = true;
      this.playbackState.isPaused = false;
      this.notifyState();
      return;
    }

    if (this.audioElement && this.playbackState.loaded) {
      try {
        await this.audioElement.play();
        this.playbackState.isPlaying = true;
        this.playbackState.isPaused = false;
        this.notifyState();
      } catch (err) {
        console.error('Play failed:', err);
      }
    }
  }

  public pause(): void {
    if (this.activeTestToneSource) {
      this.stopTestTone();
      this.playbackState.isPlaying = false;
      this.playbackState.isPaused = true;
      this.notifyState();
      return;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.playbackState.isPlaying = false;
      this.playbackState.isPaused = true;
      this.notifyState();
    }
  }

  public stop(): void {
    this.stopTestTone();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.playbackState.isPlaying = false;
    this.playbackState.isPaused = false;
    this.playbackState.currentTime = 0;
    this.notifyState();
  }

  public stopAudio(): void {
    this.stop();
  }

  public seek(seconds: number): void {
    if (this.audioElement && this.playbackState.loaded) {
      const clamped = Math.max(0, Math.min(this.playbackState.duration, seconds));
      this.audioElement.currentTime = clamped;
      this.playbackState.currentTime = clamped;
      this.notifyState();
    }
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1.0, vol));
    this.playbackState.volume = clamped;
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
    this.notifyState();
  }

  public removeFile(): void {
    this.stop();
    if (this.audioElement) {
      this.audioElement.src = '';
    }
    this.playbackState.loaded = false;
    this.playbackState.fileName = '';
    this.playbackState.duration = 0;
    this.playbackState.currentTime = 0;
    this.notifyState();
  }

  private applyChannelMuteAndSolo(): void {
    const soloL = !!this.configL.solo;
    const soloR = !!this.configR.solo;

    let muteL = !!this.configL.mute;
    let muteR = !!this.configR.mute;

    if (soloL && !soloR) {
      muteR = true;
    } else if (soloR && !soloL) {
      muteL = true;
    }

    this.channelL?.setMute(muteL);
    this.channelR?.setMute(muteR);
  }

  /**
   * Channel L parameter update
   */
  public updateChannelL(newConfig: Partial<ChannelConfig>): void {
    this.configL = { ...this.configL, ...newConfig };
    this.channelL?.update(this.configL);

    // If LINK L/R is active, replicate matching settings to Channel R
    if (this.isLinked) {
      this.configR = {
        ...this.configR,
        ...newConfig,
        id: 'R',
        name: 'INPUT R',
      };
      this.channelR?.update(this.configR);
    }
    this.applyChannelMuteAndSolo();
  }

  /**
   * Channel R parameter update
   */
  public updateChannelR(newConfig: Partial<ChannelConfig>): void {
    this.configR = { ...this.configR, ...newConfig };
    this.channelR?.update(this.configR);

    // If LINK L/R is active, replicate matching settings to Channel L
    if (this.isLinked) {
      this.configL = {
        ...this.configL,
        ...newConfig,
        id: 'L',
        name: 'INPUT L',
      };
      this.channelL?.update(this.configL);
    }
    this.applyChannelMuteAndSolo();
  }

  /**
   * Gets real-time DSP debug audit info for both channels
   */
  public getDebugInfo(): { L: DSPDebugInfo | null; R: DSPDebugInfo | null } {
    return {
      L: this.channelL ? this.channelL.getDebugInfo() : null,
      R: this.channelR ? this.channelR.getDebugInfo() : null,
    };
  }

  /**
   * Sub Mode quick switcher for Channel L
   */
  public setSubModeL(mode: 'FULL RANGE' | 'SUB / LOW' | 'HIGH'): void {
    if (mode === 'FULL RANGE') {
      this.updateChannelL({
        subMode: mode,
        hpf: { ...this.configL.hpf, enabled: false },
        lpf: { ...this.configL.lpf, enabled: false },
      });
    } else if (mode === 'SUB / LOW') {
      this.updateChannelL({
        subMode: mode,
        hpf: { ...this.configL.hpf, enabled: true, frequency: 32, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { ...this.configL.lpf, enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
      });
    } else if (mode === 'HIGH') {
      this.updateChannelL({
        subMode: mode,
        hpf: { ...this.configL.hpf, enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { ...this.configL.lpf, enabled: false },
      });
    }
  }

  /**
   * Sub Mode quick switcher for Channel R
   */
  public setSubModeR(mode: 'FULL RANGE' | 'SUB / LOW' | 'HIGH'): void {
    if (mode === 'FULL RANGE') {
      this.updateChannelR({
        subMode: mode,
        hpf: { ...this.configR.hpf, enabled: false },
        lpf: { ...this.configR.lpf, enabled: false },
      });
    } else if (mode === 'SUB / LOW') {
      this.updateChannelR({
        subMode: mode,
        hpf: { ...this.configR.hpf, enabled: true, frequency: 32, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { ...this.configR.lpf, enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
      });
    } else if (mode === 'HIGH') {
      this.updateChannelR({
        subMode: mode,
        hpf: { ...this.configR.hpf, enabled: true, frequency: 100, slope: 24, type: 'Linkwitz-Riley' },
        lpf: { ...this.configR.lpf, enabled: false },
      });
    }
  }

  /**
   * Link / Copy / Reset utilities
   */
  public toggleLink(): boolean {
    this.isLinked = !this.isLinked;
    if (this.isLinked) {
      // Synchronize R with L immediately upon linking
      this.copyLToR();
    }
    return this.isLinked;
  }

  public copyLToR(): void {
    this.configR = {
      ...JSON.parse(JSON.stringify(this.configL)),
      id: 'R',
      name: 'INPUT R',
    };
    this.channelR?.update(this.configR);
  }

  public copyRToL(): void {
    this.configL = {
      ...JSON.parse(JSON.stringify(this.configR)),
      id: 'L',
      name: 'INPUT L',
    };
    this.channelL?.update(this.configL);
  }

  public resetChannelL(): void {
    this.configL = createDefaultChannelConfig('L');
    this.channelL?.update(this.configL);
    if (this.isLinked) {
      this.copyLToR();
    }
  }

  public resetChannelR(): void {
    this.configR = createDefaultChannelConfig('R');
    this.channelR?.update(this.configR);
    if (this.isLinked) {
      this.copyRToL();
    }
  }

  public resetAll(): void {
    this.configL = createDefaultChannelConfig('L');
    this.configR = createDefaultChannelConfig('R');
    this.channelL?.update(this.configL);
    this.channelR?.update(this.configR);
    this.isLinked = false;
  }

  /**
   * Preset management
   */
  public loadPreset(presetId: string): boolean {
    const found = this.presets.find((p) => p.id === presetId);
    if (!found) return false;

    this.currentPresetId = presetId;
    this.configL = {
      ...JSON.parse(JSON.stringify(found.channels.L)),
      id: 'L',
      name: 'INPUT L',
    };
    this.configR = {
      ...JSON.parse(JSON.stringify(found.channels.R)),
      id: 'R',
      name: 'INPUT R',
    };
    this.channelL?.update(this.configL);
    this.channelR?.update(this.configR);
    return true;
  }

  public savePreset(name: string): DSPPreset {
    const newPreset: DSPPreset = {
      id: 'user-' + Date.now(),
      name,
      createdAt: Date.now(),
      channels: {
        L: JSON.parse(JSON.stringify(this.configL)),
        R: JSON.parse(JSON.stringify(this.configR)),
      },
    };

    const userPresets = loadUserPresets();
    userPresets.push(newPreset);
    saveUserPresets(userPresets);

    this.presets = [...FACTORY_PRESETS, ...userPresets];
    this.currentPresetId = newPreset.id;
    return newPreset;
  }

  public renamePreset(id: string, newName: string): boolean {
    const userPresets = loadUserPresets();
    const target = userPresets.find((p) => p.id === id);
    if (!target) return false;

    target.name = newName;
    saveUserPresets(userPresets);
    this.presets = [...FACTORY_PRESETS, ...userPresets];
    return true;
  }

  public deletePreset(id: string): boolean {
    let userPresets = loadUserPresets();
    const initialLen = userPresets.length;
    userPresets = userPresets.filter((p) => p.id !== id);
    if (userPresets.length === initialLen) return false; // Can't delete factory presets

    saveUserPresets(userPresets);
    this.presets = [...FACTORY_PRESETS, ...userPresets];
    if (this.currentPresetId === id) {
      this.currentPresetId = 'flat-full-range';
    }
    return true;
  }

  /**
   * Metering continuous loop
   */
  private startMeterLoop(): void {
    if (this.meterAnimFrame !== null) return;

    const loop = () => {
      if (this.channelL && this.channelR && this.meterListeners.size > 0) {
        const dataL = this.channelL.getMeterData();
        const dataR = this.channelR.getMeterData();
        this.meterListeners.forEach((fn) => fn({ L: dataL, R: dataR }));
      }
      this.meterAnimFrame = requestAnimationFrame(loop);
    };

    this.meterAnimFrame = requestAnimationFrame(loop);
  }

  // Listener subscriptions
  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getPlaybackState());
    return () => this.stateListeners.delete(listener);
  }

  public subscribeMeters(listener: MeterListener): () => void {
    this.meterListeners.add(listener);
    return () => this.meterListeners.delete(listener);
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private notifyState(): void {
    const s = this.getPlaybackState();
    this.stateListeners.forEach((fn) => fn(s));
  }
}

export const audioEngine = new AudioEngine();
