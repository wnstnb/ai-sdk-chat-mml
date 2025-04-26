import { create, StateCreator } from 'zustand';

interface FollowUpState {
  followUpContext: string | null;
  setFollowUpContext: (text: string | null) => void;
}

export const useFollowUpStore = create<FollowUpState>()((set) => ({
  followUpContext: null,
  setFollowUpContext: (text: string | null) => set({ followUpContext: text }),
})); 