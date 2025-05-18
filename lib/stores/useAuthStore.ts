import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  user: object | null; // Replace 'object' with your actual User type if available
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setUser: (user: object | null) => void; // Replace 'object' with your actual User type
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setUser: (user) => set({ user }),
})); 