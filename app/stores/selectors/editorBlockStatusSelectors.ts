import { EditorBlockStatusState, EditorFeatureFlags } from '@/app/types/ai-editor.types'; // Assuming types are correctly pathed

export const selectBlockStatus = (blockId: string) => (state: EditorBlockStatusState) => state.blockStatusMap[blockId];
export const selectAllBlockStatuses = (state: EditorBlockStatusState) => state.blockStatusMap;
export const selectInteractionState = (state: EditorBlockStatusState) => state.interactionState;
export const selectTimeoutConfig = (state: EditorBlockStatusState) => state.timeoutConfig;
export const selectFeatureFlags = (state: EditorBlockStatusState) => state.featureFlags;
export const selectFeatureFlag = (flagName: keyof EditorFeatureFlags) => (state: EditorBlockStatusState) => state.featureFlags[flagName];

// Add more specific or memoized selectors here as needed, for example:
// export const selectLoadingBlockIds = (state: EditorBlockStatusState) =>
//   Object.keys(state.blockStatusMap).filter(id => state.blockStatusMap[id]?.status === 'loading'); 