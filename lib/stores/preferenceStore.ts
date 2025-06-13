import { create } from 'zustand';

// Define the shape of the preferences object stored in the DB
interface UserPreferences {
  theme: 'light' | 'dark';
  default_model: string;
  editorFontSize: number;
  chatFontSize: number;
  // AI Interaction preferences
  aiHighlighting?: {
    enabled: boolean;
    highlightDuration: number; // milliseconds, 0 = until clicked
    showDiffs: boolean;
    scrollToHighlight: boolean;
    customColors?: {
      addition: string;
      deletion: string;
      modification: string;
    };
  };
  // Toast notification preferences
  toastNotifications?: {
    enabled: boolean;
    style: 'attached' | 'regular';
    animationSpeed: 'slow' | 'normal' | 'fast';
    position: 'top' | 'bottom';
    showRetryButton: boolean;
  };
  // Message pane preferences
  messagePaneDefaults?: {
    defaultState: 'collapsed' | 'expanded';
    rememberLastState: boolean;
  };
}

// Define the state shape for the Zustand store (what components interact with)
interface PreferenceState {
  theme: 'light' | 'dark' | null; // Allow null initially
  default_model: string | null;    // Allow null initially
  editorFontSize: number | null;
  chatFontSize: number | null;
  // AI Interaction preferences
  aiHighlighting: {
    enabled: boolean;
    highlightDuration: number;
    showDiffs: boolean;
    scrollToHighlight: boolean;
    customColors?: {
      addition: string;
      deletion: string;
      modification: string;
    };
  } | null;
  // Toast notification preferences
  toastNotifications: {
    enabled: boolean;
    style: 'attached' | 'regular';
    animationSpeed: 'slow' | 'normal' | 'fast';
    position: 'top' | 'bottom';
    showRetryButton: boolean;
  } | null;
  // Message pane preferences
  messagePaneDefaults: {
    defaultState: 'collapsed' | 'expanded';
    rememberLastState: boolean;
  } | null;
  isPreferenceLoading: boolean;
  preferenceError: string | null;
  isInitialized: boolean;
  fetchPreferences: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  setDefaultModel: (model: string) => Promise<void>;
  setEditorFontSize: (size: number) => Promise<void>;
  setChatFontSize: (size: number) => Promise<void>;
  setAiHighlighting: (highlighting: Partial<NonNullable<PreferenceState['aiHighlighting']>>) => Promise<void>;
  setToastNotifications: (toasts: Partial<NonNullable<PreferenceState['toastNotifications']>>) => Promise<void>;
  setMessagePaneDefaults: (pane: Partial<NonNullable<PreferenceState['messagePaneDefaults']>>) => Promise<void>;
}

// Internal type for the store implementation including private helpers
type PreferenceStoreImplementation = PreferenceState & {
  _updateRemotePreference: (updatedPrefs: Partial<UserPreferences>) => Promise<void>;
};

// Define default values (used if fetch fails or returns nothing initially)
const defaultPreferencesData: UserPreferences = {
  theme: 'dark',
  default_model: 'gpt-4.1',
  editorFontSize: 1,
  chatFontSize: 1,
  aiHighlighting: {
    enabled: true,
    highlightDuration: 5000, // 5 seconds
    showDiffs: true,
    scrollToHighlight: true,
    customColors: undefined // Use theme defaults
  },
  toastNotifications: {
    enabled: true,
    style: 'attached',
    animationSpeed: 'normal',
    position: 'bottom',
    showRetryButton: true
  },
  messagePaneDefaults: {
    defaultState: 'expanded',
    rememberLastState: true
  },
};

// Use the internal type for create
export const usePreferenceStore = create<PreferenceStoreImplementation>()((set, get) => ({
  // Initial state
  theme: null, 
  default_model: null, 
  editorFontSize: null,
  chatFontSize: null,
  aiHighlighting: null,
  toastNotifications: null,
  messagePaneDefaults: null,
  isPreferenceLoading: false,
  preferenceError: null,
  isInitialized: false,

  // --- Actions --- 

  fetchPreferences: async () => {
    if (get().isPreferenceLoading || get().isInitialized) return; // Prevent multiple fetches

    set({ isPreferenceLoading: true, preferenceError: null });
    try {
      const response = await fetch('/api/preferences');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch preferences (${response.status})`);
      }
      const prefs: UserPreferences = await response.json();
      console.log('[PreferenceStore] Fetched preferences:', prefs);
      
      const theme = prefs.theme || defaultPreferencesData.theme;
      
      // Sync theme to localStorage for anti-flicker script
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {
        console.warn('[PreferenceStore] localStorage not accessible during fetch');
      }
      
      set({ 
          theme, 
          default_model: prefs.default_model || defaultPreferencesData.default_model, 
          editorFontSize: prefs.editorFontSize || defaultPreferencesData.editorFontSize,
          chatFontSize: prefs.chatFontSize || defaultPreferencesData.chatFontSize,
          aiHighlighting: prefs.aiHighlighting || defaultPreferencesData.aiHighlighting,
          toastNotifications: prefs.toastNotifications || defaultPreferencesData.toastNotifications,
          messagePaneDefaults: prefs.messagePaneDefaults || defaultPreferencesData.messagePaneDefaults,
          isInitialized: true, 
          isPreferenceLoading: false 
      });
    } catch (error: any) {
      console.error('[PreferenceStore] Error fetching preferences:', error);
      
      const defaultTheme = defaultPreferencesData.theme;
      
      // Sync default theme to localStorage even on error
      try {
        localStorage.setItem('theme', defaultTheme);
      } catch (e) {
        console.warn('[PreferenceStore] localStorage not accessible during error fallback');
      }
      
      set({ 
          preferenceError: error.message, 
          isPreferenceLoading: false, 
          // Set defaults on error after first attempt
          theme: defaultTheme,
          default_model: defaultPreferencesData.default_model,
          editorFontSize: defaultPreferencesData.editorFontSize,
          chatFontSize: defaultPreferencesData.chatFontSize,
          aiHighlighting: defaultPreferencesData.aiHighlighting,
          toastNotifications: defaultPreferencesData.toastNotifications,
          messagePaneDefaults: defaultPreferencesData.messagePaneDefaults,
          isInitialized: true, // Mark as initialized even on error to apply defaults
      });
    }
  },

  _updateRemotePreference: async (updatedPrefs: Partial<UserPreferences>) => {
      // Get current state to merge updates, falling back to defaults if null
      const currentState: UserPreferences = {
          theme: get().theme || defaultPreferencesData.theme, 
          default_model: get().default_model || defaultPreferencesData.default_model, 
          editorFontSize: get().editorFontSize || defaultPreferencesData.editorFontSize,
          chatFontSize: get().chatFontSize || defaultPreferencesData.chatFontSize,
          aiHighlighting: get().aiHighlighting || defaultPreferencesData.aiHighlighting,
          toastNotifications: get().toastNotifications || defaultPreferencesData.toastNotifications,
          messagePaneDefaults: get().messagePaneDefaults || defaultPreferencesData.messagePaneDefaults,
      };
      const newPreferences = { ...currentState, ...updatedPrefs };

      try {
          const response = await fetch('/api/preferences', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newPreferences),
          });

          if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Failed to update preferences (${response.status})`);
          }
          console.log('[PreferenceStore] Successfully updated remote preferences:', newPreferences);
          set({ preferenceError: null }); // Clear any previous error on success

      } catch (error: any) {
          console.error('[PreferenceStore] Error updating remote preferences:', error);
          set({ preferenceError: error.message });
      }
  },

  setTheme: async (theme) => {
    if (get().theme === theme) return; 
    const previousTheme = get().theme; // Store previous theme for potential rollback
    set({ theme }); // Optimistic local update
    
    // Immediately update localStorage to sync with anti-flicker script
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.warn('[PreferenceStore] localStorage not accessible for theme sync');
    }
    
    try {
      await get()._updateRemotePreference({ theme });
    } catch (error) {
      set({ theme: previousTheme }); // Rollback on error
      // Also rollback localStorage
      try {
        if (previousTheme) {
          localStorage.setItem('theme', previousTheme);
        } else {
          localStorage.removeItem('theme');
        }
      } catch (e) {
        console.warn('[PreferenceStore] localStorage not accessible for theme rollback');
      }
    }
  },

  setDefaultModel: async (model) => {
    if (get().default_model === model) return; 
    const previousModel = get().default_model; // Store previous model for potential rollback
    set({ default_model: model }); // Optimistic local update
     try {
      await get()._updateRemotePreference({ default_model: model });
    } catch (error) {
      set({ default_model: previousModel }); // Rollback on error
    }
  },

  setEditorFontSize: async (size: number) => {
    if (get().editorFontSize === size) return;
    const previousSize = get().editorFontSize;
    set({ editorFontSize: size });
    try {
      await get()._updateRemotePreference({ editorFontSize: size });
    } catch (error) {
      set({ editorFontSize: previousSize });
    }
  },

  setChatFontSize: async (size: number) => {
    if (get().chatFontSize === size) return;
    const previousSize = get().chatFontSize;
    set({ chatFontSize: size });
    try {
      await get()._updateRemotePreference({ chatFontSize: size });
    } catch (error) {
      set({ chatFontSize: previousSize });
    }
  },

  setAiHighlighting: async (highlighting: Partial<NonNullable<PreferenceState['aiHighlighting']>>) => {
    const current = get().aiHighlighting || defaultPreferencesData.aiHighlighting!;
    const updated = { ...current, ...highlighting };
    const previous = get().aiHighlighting;
    set({ aiHighlighting: updated });
    try {
      await get()._updateRemotePreference({ aiHighlighting: updated });
    } catch (error) {
      set({ aiHighlighting: previous });
    }
  },

  setToastNotifications: async (toasts: Partial<NonNullable<PreferenceState['toastNotifications']>>) => {
    const current = get().toastNotifications || defaultPreferencesData.toastNotifications!;
    const updated = { ...current, ...toasts };
    const previous = get().toastNotifications;
    set({ toastNotifications: updated });
    try {
      await get()._updateRemotePreference({ toastNotifications: updated });
    } catch (error) {
      set({ toastNotifications: previous });
    }
  },

  setMessagePaneDefaults: async (pane: Partial<NonNullable<PreferenceState['messagePaneDefaults']>>) => {
    const current = get().messagePaneDefaults || defaultPreferencesData.messagePaneDefaults!;
    const updated = { ...current, ...pane };
    const previous = get().messagePaneDefaults;
    set({ messagePaneDefaults: updated });
    try {
      await get()._updateRemotePreference({ messagePaneDefaults: updated });
    } catch (error) {
      set({ messagePaneDefaults: previous });
    }
  },

}));
