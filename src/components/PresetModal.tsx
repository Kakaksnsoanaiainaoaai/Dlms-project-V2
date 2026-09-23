import React, { useState } from 'react';
import {
  Check,
  Edit2,
  Plus,
  RotateCcw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { audioEngine } from '../audio/audio-engine';
import { DSPPreset } from '../types';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: DSPPreset[];
  currentPresetId: string;
  onPresetSelected: (presetId: string) => void;
  onPresetsChanged: () => void;
}

export const PresetModal: React.FC<PresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  currentPresetId,
  onPresetSelected,
  onPresetsChanged,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    audioEngine.savePreset(newPresetName.trim());
    setNewPresetName('');
    onPresetsChanged();
  };

  const handleStartRename = (preset: DSPPreset) => {
    setEditingId(preset.id);
    setEditingName(preset.name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      audioEngine.renamePreset(id, editingName.trim());
      onPresetsChanged();
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Yakin ingin menghapus preset ini?')) {
      audioEngine.deletePreset(id);
      onPresetsChanged();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-5 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white font-sans">
              DSP Preset Manager
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Save Current Settings Form */}
        <form onSubmit={handleSaveCurrent} className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Beri nama preset baru..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!newPresetName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white text-xs font-semibold font-mono transition"
          >
            <Plus className="w-4 h-4" />
            <span>Simpan</span>
          </button>
        </form>

        {/* Preset List */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1">
          <span className="text-[10px] font-mono uppercase text-neutral-500 font-bold block mb-1">
            DAFTAR PRESET
          </span>

          {presets.map((preset) => {
            const isCurrent = preset.id === currentPresetId;
            const isUserPreset = preset.id.startsWith('user-');
            const isEditing = editingId === preset.id;

            return (
              <div
                key={preset.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  isCurrent
                    ? 'bg-cyan-950/40 border-cyan-700/80 text-white'
                    : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                {/* Left side: title or edit input */}
                <div className="flex-1 min-w-0 pr-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="bg-neutral-900 border border-cyan-500 rounded px-2 py-1 text-xs text-white w-full outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(preset.id)}
                        className="p-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {preset.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-900 text-cyan-300 border border-cyan-600/50">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {isUserPreset ? 'User Saved Preset' : 'Factory Default'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right side buttons */}
                <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                  {!isCurrent && (
                    <button
                      onClick={() => {
                        onPresetSelected(preset.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-cyan-600 hover:text-white text-neutral-300 border border-neutral-700 transition"
                    >
                      Load
                    </button>
                  )}

                  {isUserPreset && !isEditing && (
                    <>
                      <button
                        onClick={() => handleStartRename(preset)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
                        title="Ubah Nama"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(preset.id)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-950 text-neutral-400 hover:text-rose-400 transition"
                        title="Hapus Preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-neutral-800 flex justify-between items-center text-xs text-neutral-500 font-mono">
          <span>Tersimpan di LocalStorage</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
