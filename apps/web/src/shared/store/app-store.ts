import { create } from "zustand";

type AppState = {
  isNavigationOpen: boolean;
  setNavigationOpen: (isOpen: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  isNavigationOpen: false,
  setNavigationOpen: (isNavigationOpen) => set({ isNavigationOpen }),
}));
