import React, { useEffect, useState } from 'react';

interface FrequencyControlProps {
  id?: string;
  label?: string;
  value: number; // Hz (20 - 20000)
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  unit?: string;
}

// Logarithmic conversion helpers for smooth audio frequency fader response
function freqToSlider(freq: number, minFreq: number, maxFreq: number): number {
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);
  const valLog = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
  return ((valLog - minLog) / (maxLog - minLog)) * 1000;
}

function sliderToFreq(sliderVal: number, minFreq: number, maxFreq: number): number {
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);
  const valLog = minLog + (sliderVal / 1000) * (maxLog - minLog);
  return Math.round(Math.pow(10, valLog));
}

export const FrequencyControl: React.FC<FrequencyControlProps> = ({
  id,
  label,
  value,
  onChange,
  min = 20,
  max = 20000,
  className = '',
  unit = 'Hz',
}) => {
  const [typedValue, setTypedValue] = useState<string>(Math.round(value).toString());

  // Keep local string input synchronized with outside prop changes
  useEffect(() => {
    setTypedValue(Math.round(value).toString());
  }, [value]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderVal = parseFloat(e.target.value);
    const newFreq = sliderToFreq(sliderVal, min, max);
    setTypedValue(newFreq.toString());
    onChange(newFreq);
  };

  const handleNumberBlur = () => {
    let parsed = parseInt(typedValue, 10);
    if (isNaN(parsed)) {
      parsed = value;
    } else {
      parsed = Math.max(min, Math.min(max, parsed));
    }
    setTypedValue(parsed.toString());
    onChange(parsed);
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNumberBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const str = e.target.value;
    setTypedValue(str);
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  const sliderVal = freqToSlider(value, min, max);

  return (
    <div id={id} className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs text-neutral-400 font-medium">
          <span>{label}</span>
          <span className="text-[11px] text-cyan-400 font-mono">
            {value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} kHz` : `${Math.round(value)} Hz`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Synchronized Logarithmic Slider */}
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={isNaN(sliderVal) ? 0 : Math.round(sliderVal)}
            onChange={handleSliderChange}
            aria-label={label || 'Frequency Slider'}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition"
          />
        </div>

        {/* Synchronized Editable Number Input */}
        <div className="relative flex items-center w-24">
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={typedValue}
            onChange={handleNumberChange}
            onBlur={handleNumberBlur}
            onKeyDown={handleNumberKeyDown}
            aria-label={label || 'Frequency Number Input'}
            className="w-full bg-neutral-900 border border-neutral-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-neutral-100 font-mono text-xs px-2 py-1 rounded text-right pr-6 outline-none transition"
          />
          <span className="absolute right-1.5 text-[10px] text-neutral-500 font-mono pointer-events-none">
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
};
