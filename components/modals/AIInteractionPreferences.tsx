'use client';

import React from 'react';
import { Toggle } from '@/components/ui/toggle';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';

interface AIInteractionPreferencesProps {
  className?: string;
}

export const AIInteractionPreferences: React.FC<AIInteractionPreferencesProps> = ({ className = '' }) => {
  const { 
    aiHighlighting,
    toastNotifications,
    messagePaneDefaults,
    setAiHighlighting, 
    setToastNotifications,
    setMessagePaneDefaults,
    isInitialized 
  } = usePreferenceStore();

  if (!isInitialized) {
    return null;
  }

  // Fallback to defaults if not set
  const highlighting = aiHighlighting || {
    enabled: true,
    highlightDuration: 5000,
    showDiffs: true,
    scrollToHighlight: true,
  };

  const toasts = toastNotifications || {
    enabled: true,
    style: 'attached' as const,
    animationSpeed: 'normal' as const,
    position: 'bottom' as const,
    showRetryButton: true,
  };

  const messagePane = messagePaneDefaults || {
    defaultState: 'expanded' as const,
    rememberLastState: true,
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* AI Highlighting Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-[--text-color] border-b border-[--border-color] pb-1">
          AI Interaction
        </h3>
        
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="ai-highlighting-toggle" className="text-xs text-[--text-color]">
              Highlight AI changes
            </label>
            <Toggle
              id="ai-highlighting-toggle"
              checked={highlighting.enabled}
              onChange={(enabled) => setAiHighlighting({ enabled })}
            />
          </div>
          
          {highlighting.enabled && (
            <>
              <div className="flex flex-col gap-1 ml-3">
                <label htmlFor="highlight-duration" className="text-xs text-[--text-color]">
                  Highlight duration
                </label>
                <select
                  id="highlight-duration"
                  value={highlighting.highlightDuration}
                  onChange={(e) => setAiHighlighting({ highlightDuration: Number(e.target.value) })}
                  className="px-2 py-1 bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none text-xs"
                >
                  <option value={3000}>3 seconds</option>
                  <option value={5000}>5 seconds</option>
                  <option value={10000}>10 seconds</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between ml-3">
                <label htmlFor="show-diffs-toggle" className="text-xs text-[--text-color]">
                  Show content diffs
                </label>
                <Toggle
                  id="show-diffs-toggle"
                  checked={highlighting.showDiffs}
                  onChange={(showDiffs) => setAiHighlighting({ showDiffs })}
                />
              </div>

              <div className="flex items-center justify-between ml-3">
                <label htmlFor="scroll-to-highlight" className="text-xs text-[--text-color]">
                  Auto-scroll to changes
                </label>
                <Toggle
                  id="scroll-to-highlight"
                  checked={highlighting.scrollToHighlight}
                  onChange={(scrollToHighlight) => setAiHighlighting({ scrollToHighlight })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast Notifications Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-[--text-color] border-b border-[--border-color] pb-1">
          Toast Notifications
        </h3>
        
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="toast-notifications-toggle" className="text-xs text-[--text-color]">
              Enable notifications
            </label>
            <Toggle
              id="toast-notifications-toggle"
              checked={toasts.enabled}
              onChange={(enabled) => setToastNotifications({ enabled })}
            />
          </div>
          
          {toasts.enabled && (
            <>
              <div className="flex flex-col gap-1 ml-3">
                <label htmlFor="toast-style" className="text-xs text-[--text-color]">
                  Toast style
                </label>
                <select
                  id="toast-style"
                  value={toasts.style}
                  onChange={(e) => setToastNotifications({ style: e.target.value as 'attached' | 'regular' })}
                  className="px-2 py-1 bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none text-xs"
                >
                  <option value="attached">Attached to content</option>
                  <option value="regular">Regular (floating)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 ml-3">
                <label htmlFor="animation-speed" className="text-xs text-[--text-color]">
                  Animation speed
                </label>
                <select
                  id="animation-speed"
                  value={toasts.animationSpeed}
                  onChange={(e) => setToastNotifications({ animationSpeed: e.target.value as 'slow' | 'normal' | 'fast' })}
                  className="px-2 py-1 bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none text-xs"
                >
                  <option value="slow">Slow</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 ml-3">
                <label htmlFor="toast-position" className="text-xs text-[--text-color]">
                  Position
                </label>
                <select
                  id="toast-position"
                  value={toasts.position}
                  onChange={(e) => setToastNotifications({ position: e.target.value as 'top' | 'bottom' })}
                  className="px-2 py-1 bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none text-xs"
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>

              <div className="flex items-center justify-between ml-3">
                <label htmlFor="show-retry-toggle" className="text-xs text-[--text-color]">
                  Show retry button
                </label>
                <Toggle
                  id="show-retry-toggle"
                  checked={toasts.showRetryButton}
                  onChange={(showRetryButton) => setToastNotifications({ showRetryButton })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Message Pane Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-[--text-color] border-b border-[--border-color] pb-1">
          Message Pane
        </h3>
        
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="message-pane-default" className="text-xs text-[--text-color]">
              Default state
            </label>
            <select
              id="message-pane-default"
              value={messagePane.defaultState}
              onChange={(e) => setMessagePaneDefaults({ defaultState: e.target.value as 'collapsed' | 'expanded' })}
              className="px-2 py-1 bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none text-xs"
            >
              <option value="expanded">Expanded</option>
              <option value="collapsed">Collapsed</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="remember-state-toggle" className="text-xs text-[--text-color]">
              Remember last state
            </label>
            <Toggle
              id="remember-state-toggle"
              checked={messagePane.rememberLastState}
              onChange={(rememberLastState) => setMessagePaneDefaults({ rememberLastState })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}; 