import { create } from 'zustand';

// Define the shape of the preferences object stored in the DB
interface UserPreferences {
  theme: 'light' | 'dark';
  default_model: string;
  // Add other preferences here in the future
}

// Define the state shape for the Zustand store (what components interact with)
interface PreferenceState {
  theme: 'light' | 'dark' | null; // Allow null initially
  default_model: string | null;    // Allow null initially
  isPreferenceLoading: boolean;
  preferenceError: string | null;
  isInitialized: boolean;
  fetchPreferences: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  setDefaultModel: (model: string) => Promise<void>;
}

// Internal type for the store implementation including private helpers
type PreferenceStoreImplementation = PreferenceState & {
  _updateRemotePreference: (updatedPrefs: Partial<UserPreferences>) => Promise<void>;
};

// Define default values (used if fetch fails or returns nothing initially)
const defaultPreferencesData: UserPreferences = {
  theme: 'light',
  default_model: 'gemini-2.0-flash',
};

// Use the internal type for create
export const usePreferenceStore = create<PreferenceStoreImplementation>()((set, get) => ({
  // Initial state
  theme: null, 
  default_model: null, 
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
      set({ 
          theme: prefs.theme || defaultPreferencesData.theme, 
          default_model: prefs.default_model || defaultPreferencesData.default_model, 
          isInitialized: true, 
          isPreferenceLoading: false 
      });
    } catch (error: any) {
      console.error('[PreferenceStore] Error fetching preferences:', error);
      set({ 
          preferenceError: error.message, 
          isPreferenceLoading: false, 
          // Set defaults on error after first attempt
          theme: defaultPreferencesData.theme,
          default_model: defaultPreferencesData.default_model,
          isInitialized: true, // Mark as initialized even on error to apply defaults
      });
    }
  },

  _updateRemotePreference: async (updatedPrefs: Partial<UserPreferences>) => {
      // Get current state to merge updates, falling back to defaults if null
      const currentState: UserPreferences = {
          theme: get().theme || defaultPreferencesData.theme, 
          default_model: get().default_model || defaultPreferencesData.default_model, 
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
    try {
      await get()._updateRemotePreference({ theme });
    } catch (error) {
      set({ theme: previousTheme }); // Rollback on error
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

}));
