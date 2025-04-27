'use client';

import { Dispatch, SetStateAction } from 'react';

export function ModelSelector({
  model,
  setModel,
}: {
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="flex items-center space-x-2">
      <label htmlFor="model-select" className="text-sm text-zinc-500 dark:text-zinc-400">
        Model:
      </label>
      <select
        id="model-select"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="text-sm rounded-md border border-zinc-200 dark:border-zinc-600 px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300"
      >
        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
        <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash</option>
        <option value="gpt-4o">GPT‑4o</option>
      </select>
    </div>
  );
}
