'use client';

import React from 'react';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { ModelSelector } from './ModelSelector'; // Assuming ModelSelector is in the same directory or adjust path
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'; // Or other icons

// Placeholder type for props if wrapped by DropdownMenuTrigger, etc.
// interface PreferencesDropdownProps {}

export const PreferencesDropdown: React.FC = () => {
  // Get state and actions from the store
  const { 
      theme, 
      default_model, 
      setTheme, 
      setDefaultModel, 
      isInitialized, // Check if preferences have been loaded
      preferenceError 
  } = usePreferenceStore();

  // Handle loading/uninitialized state
  if (!isInitialized) {
    return <div className="p-4 text-sm text-[--muted-text-color] bg-[--editor-bg] rounded-md shadow-lg w-64 outline outline-1 outline-[--muted-text-color]">Loading preferences...</div>;
  }

  // Handle error state
  if (preferenceError) {
    return <div className="p-4 text-sm text-red-600 bg-[--editor-bg] rounded-md shadow-lg w-64 outline outline-1 outline-[--muted-text-color]">Error loading preferences: {preferenceError}</div>;
  }

  // Ensure default_model has a fallback for ModelSelector if still null after init (shouldn't happen with current store logic, but safe)
  const currentModel = default_model ?? 'gemini-2.0-flash'; // Use default from store logic
  const currentTheme = theme ?? 'light'; // Use default from store logic

  return (
    <div className="p-4 bg-[--editor-bg] text-[--text-color] rounded-md shadow-lg w-64 flex flex-col gap-4 outline outline-1 outline-[--muted-text-color]">
      <h3 className="text-sm font-semibold mb-2 border-b border-[--border-color] pb-1">Preferences</h3>
      
      {/* Theme Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-[--muted-text-color]">Theme</label>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme('light')}
            disabled={currentTheme === 'light'}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors 
                        ${currentTheme === 'light' 
                            ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                            : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <SunIcon className="h-4 w-4" /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            disabled={currentTheme === 'dark'}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors 
                        ${currentTheme === 'dark' 
                            ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                            : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <MoonIcon className="h-4 w-4" /> Dark
          </button>
        </div>
      </div>

      {/* Default Model Selector */}
      <div className="flex flex-col gap-1">
         <label className="text-xs font-medium text-[--muted-text-color] mb-1">Default Model</label>
         {/* Use existing ModelSelector, pass state and action */}
         {/* NOTE: ModelSelector expects `setModel` Dispatch<SetStateAction<string>> */}
         {/* We need to adapt it or pass a wrapper function */}
         <ModelSelector 
             model={currentModel} 
             setModel={(newModel) => {
                 // Handle potential type mismatch if setModel expects direct value
                 if (typeof newModel === 'string') {
                     setDefaultModel(newModel);
                 } else {
                     // If setModel provides a function (like setState does), handle it
                     // This case might not be needed depending on ModelSelector implementation
                     setDefaultModel(newModel(currentModel)); 
                 }
             }}
         />
         <p className="text-xs text-[--muted-text-color] mt-1">
             Applied when starting new conversations.
         </p>
      </div>
    </div>
  );
};
