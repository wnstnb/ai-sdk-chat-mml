'use client';

import { useMemo } from 'react';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';

export interface AIPreferencesConfig {
  highlighting: {
    enabled: boolean;
    duration: number;
    showDiffs: boolean;
    scrollToHighlight: boolean;
    customColors?: {
      addition: string;
      deletion: string;
      modification: string;
    };
  };
  toasts: {
    enabled: boolean;
    style: 'attached' | 'regular';
    animationSpeed: 'slow' | 'normal' | 'fast';
    position: 'top' | 'bottom';
    showRetryButton: boolean;
    duration: number; // Computed from animationSpeed
  };
  messagePane: {
    defaultState: 'collapsed' | 'expanded';
    rememberLastState: boolean;
  };
}

/**
 * Hook that provides preference-aware configuration for AI interaction components
 */
export function useAIPreferences(): AIPreferencesConfig {
  const {
    aiHighlighting,
    toastNotifications,
    messagePaneDefaults,
    isInitialized,
  } = usePreferenceStore();

  return useMemo(() => {
    // Fallback defaults if preferences aren't loaded
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

    // Convert animation speed to duration
    const getToastDuration = (speed: 'slow' | 'normal' | 'fast'): number => {
      switch (speed) {
        case 'slow': return 5000;
        case 'normal': return 3000;
        case 'fast': return 1500;
        default: return 3000;
      }
    };

    return {
      highlighting: {
        enabled: highlighting.enabled,
        duration: highlighting.highlightDuration,
        showDiffs: highlighting.showDiffs,
        scrollToHighlight: highlighting.scrollToHighlight,
        customColors: highlighting.customColors,
      },
      toasts: {
        enabled: toasts.enabled,
        style: toasts.style,
        animationSpeed: toasts.animationSpeed,
        position: toasts.position,
        showRetryButton: toasts.showRetryButton,
        duration: getToastDuration(toasts.animationSpeed),
      },
      messagePane: {
        defaultState: messagePane.defaultState,
        rememberLastState: messagePane.rememberLastState,
      },
    };
  }, [aiHighlighting, toastNotifications, messagePaneDefaults, isInitialized]);
}

/**
 * Hook that returns only highlighting preferences
 */
export function useHighlightingPreferences() {
  const config = useAIPreferences();
  return config.highlighting;
}

/**
 * Hook that returns only toast preferences
 */
export function useToastPreferences() {
  const config = useAIPreferences();
  return config.toasts;
}

/**
 * Hook that returns only message pane preferences
 */
export function useMessagePanePreferences() {
  const config = useAIPreferences();
  return config.messagePane;
} 