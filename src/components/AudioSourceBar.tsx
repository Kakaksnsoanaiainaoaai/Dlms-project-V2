import React, { useRef } from 'react';
import {
  FileAudio,
  FolderOpen,
  Pause,
  Play,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { audioEngine } from '../audio/audio-engine';
import { AudioPlaybackState } from '../types';

interface AudioSourceBarProps {
  id?: string;
  playbackState: AudioPlaybackState;
  onAudioFileSelected: (file: File) => void;
}

export const AudioSourceBar: React.FC<AudioSourceBarProps> = ({
  id,
  playbackState,
  onAudioFileSelected,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatTime = (secs: number): string => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAudioFileSelected(files[0]);
    }
    // reset input so same file can be reloaded if desired
    e.target.value = '';
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    audioEngine.seek(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    audioEngine.setVolume(val);
  };

  return (
    <div
      id={id}
      className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4 shadow-xl flex flex-col gap-3"
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        className="hidden"
        id="audio-file-input"
      />

      {/* Top Row: File Name, Load Button, Built-in Test Signals, Remove/Replace */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 shrink-0">
            <FileAudio className="w-4 h-4" />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono font-bold">
              AUDIO SOURCE
            </span>
            <span
              className="text-xs sm:text-sm font-medium text-neutral-200 truncate max-w-[200px] sm:max-w-xs md:max-w-md"
              title={playbackState.loaded ? playbackState.fileName : 'Belum ada file audio'}
            >
              {playbackState.loaded ? playbackState.fileName : 'Pilih file audio dari HP / Storage'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {/* Load File Button */}
          <button
            id="btn-load-audio"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm transition cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{playbackState.loaded ? 'Ganti File' : 'Load Audio'}</span>
          </button>

          {/* Built-in Signals dropdown / buttons */}
          <div className="flex items-center bg-neutral-950 rounded-lg border border-neutral-800 p-0.5">
            <button
              onClick={() => audioEngine.loadBuiltinTone('stereo-groove')}
              className="px-2 py-1 text-[11px] rounded text-neutral-300 hover:text-cyan-400 hover:bg-neutral-800 transition"
              title="Demo Music Groove (Sub + Snare + Hi-Hat)"
            >
              Groove Demo
            </button>
            <button
              onClick={() => audioEngine.loadBuiltinTone('pink-noise')}
              className="px-2 py-1 text-[11px] rounded text-neutral-300 hover:text-cyan-400 hover:bg-neutral-800 transition"
              title="Pink Noise (Ideal for Crossover/RTA Tuning)"
            >
              Pink Noise
            </button>
            <button
              onClick={() => audioEngine.loadBuiltinTone('sine-sweep')}
              className="px-2 py-1 text-[11px] rounded text-neutral-300 hover:text-cyan-400 hover:bg-neutral-800 transition"
              title="Log Sweep 20Hz - 20kHz"
            >
              20-20k Sweep
            </button>
          </div>

          {/* Remove File Button */}
          {playbackState.loaded && (
            <button
              id="btn-remove-audio"
              onClick={() => audioEngine.removeFile()}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-950/80 hover:text-rose-400 border border-neutral-700 text-neutral-400 transition cursor-pointer"
              title="Hapus / Reset Audio"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Middle Row: Transport Controls (Play, Pause, Stop), Seek Slider, Time Readout */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
        {/* Transport buttons */}
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            id="btn-play-pause"
            onClick={() => {
              if (playbackState.isPlaying) {
                audioEngine.pause();
              } else {
                audioEngine.play();
              }
            }}
            disabled={!playbackState.loaded}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition shadow-md ${
              playbackState.isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed'
            }`}
            title={playbackState.isPlaying ? 'Pause' : 'Play'}
          >
            {playbackState.isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Stop Button */}
          <button
            id="btn-stop-audio"
            onClick={() => audioEngine.stop()}
            disabled={!playbackState.loaded}
            className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-850 disabled:text-neutral-700 text-neutral-200 border border-neutral-700 flex items-center justify-center transition"
            title="Stop & Return to Start"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Timeline & Scrubber */}
        <div className="flex-1 w-full flex items-center gap-2">
          <span className="font-mono text-xs text-neutral-400 w-11 text-right shrink-0">
            {formatTime(playbackState.currentTime)}
          </span>

          <input
            id="audio-seek-slider"
            type="range"
            min={0}
            max={playbackState.duration || 100}
            step={0.1}
            value={playbackState.currentTime}
            onChange={handleSeekChange}
            disabled={!playbackState.loaded || playbackState.duration === 0}
            aria-label="Seek Audio"
            className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed"
          />

          <span className="font-mono text-xs text-neutral-500 w-11 shrink-0">
            {formatTime(playbackState.duration)}
          </span>
        </div>

        {/* Master Volume Fader */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-44 px-2 py-1 bg-neutral-950/60 rounded-lg border border-neutral-800/80">
          <button
            onClick={() => audioEngine.setVolume(playbackState.volume > 0 ? 0 : 0.8)}
            className="text-neutral-400 hover:text-white transition"
          >
            {playbackState.volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>
          <input
            id="master-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={playbackState.volume}
            onChange={handleVolumeChange}
            aria-label="Master Volume"
            className="flex-1 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="font-mono text-[11px] text-neutral-300 w-8 text-right">
            {Math.round(playbackState.volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
