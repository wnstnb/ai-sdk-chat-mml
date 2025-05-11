'use client';

import { Dispatch, SetStateAction } from 'react';

interface ModelSelectorProps {
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
  disabled?: boolean;
  elementClassName?: string;
}

export function ModelSelector({
  model,
  setModel,
  disabled,
  elementClassName,
}: ModelSelectorProps) {
  const baseClasses = "font-mono text-xs rounded-md px-2 py-1 text-zinc-800 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const defaultAppearanceClasses = "border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800";

  const finalSelectClasses = elementClassName 
    ? `${baseClasses} ${elementClassName}` 
    : `${baseClasses} ${defaultAppearanceClasses}`;

  return (
    <div className="flex items-center space-x-2">
      <select
        id="model-select"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className={finalSelectClasses}
        disabled={disabled}
      >
        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
        <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash</option>
        <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro</option>
        <option value="gpt-4o">GPT‑4o</option>
      </select>
    </div>
  );
}
