import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language, VehicleConfig } from "@car-schematic/shared";

export type HighlightSource = "search" | "assistant";
export type ViewMode = "normal" | "xray" | "exploded";
export type CameraPreset = "isometric" | "front" | "rear" | "left" | "right" | "top";

const DEFAULT_EXPLODE = 0.6;

interface Request<T> {
  value: T;
  nonce: number;
}

interface SelectOptions {
  focus?: boolean;
  additive?: boolean;
}

interface ExplorerState {
  language: Language;
  vehicleId: string | null;
  config: VehicleConfig | null;
  selectedId: string | null;
  selectedIds: string[];
  hiddenIds: string[];
  isolatedIds: string[] | null;
  viewMode: ViewMode;
  explode: number;
  highlightIds: string[];
  highlightSource: HighlightSource | null;
  bookmarks: Record<string, string[]>;
  focusRequest: Request<string[]> | null;
  cameraRequest: Request<CameraPreset> | null;
  assistantRequest: Request<string> | null;
  setLanguage: (language: Language) => void;
  openVehicle: (vehicleId: string, config: VehicleConfig, selectedId: string | null) => void;
  setConfig: (config: VehicleConfig) => void;
  select: (componentId: string | null, options?: SelectOptions) => void;
  focusOn: (componentIds: string[]) => void;
  setHidden: (componentIds: string[], isHidden: boolean) => void;
  toggleHidden: (componentId: string) => void;
  showAll: () => void;
  isolate: (componentIds: string[] | null, options?: { focus?: boolean }) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setExplode: (explode: number) => void;
  highlight: (componentIds: string[], source: HighlightSource) => void;
  clearHighlights: () => void;
  toggleBookmark: (componentId: string) => void;
  requestCamera: (preset: CameraPreset) => void;
  askAssistant: (text: string) => void;
}

let nonce = 0;
function request<T>(value: T): Request<T> {
  nonce += 1;
  return { value, nonce };
}

export const useExplorer = create<ExplorerState>()(
  persist(
    (set) => ({
      language: "en",
      vehicleId: null,
      config: null,
      selectedId: null,
      selectedIds: [],
      hiddenIds: [],
      isolatedIds: null,
      viewMode: "normal",
      explode: DEFAULT_EXPLODE,
      highlightIds: [],
      highlightSource: null,
      bookmarks: {},
      focusRequest: null,
      cameraRequest: null,
      assistantRequest: null,
      setLanguage: (language) => set({ language }),
      openVehicle: (vehicleId, config, selectedId) =>
        set({
          vehicleId,
          config,
          selectedId,
          selectedIds: selectedId ? [selectedId] : [],
          hiddenIds: [],
          isolatedIds: null,
          highlightIds: [],
          highlightSource: null,
        }),
      setConfig: (config) => set({ config, hiddenIds: [], isolatedIds: null, highlightIds: [], highlightSource: null }),
      select: (componentId, options) =>
        set((state) => {
          if (componentId === null) return { selectedId: null, selectedIds: [] };
          let selectedIds = [componentId];
          let selectedId: string | null = componentId;
          if (options?.additive) {
            const isAlreadySelected = state.selectedIds.includes(componentId);
            selectedIds = isAlreadySelected ? state.selectedIds.filter((id) => id !== componentId) : [...state.selectedIds, componentId];
            selectedId = isAlreadySelected ? (selectedIds[selectedIds.length - 1] ?? null) : componentId;
          }
          return {
            selectedId,
            selectedIds,
            hiddenIds: state.hiddenIds.filter((id) => id !== componentId),
            focusRequest: options?.focus && selectedId ? request(selectedIds) : state.focusRequest,
          };
        }),
      focusOn: (componentIds) => set({ focusRequest: request(componentIds) }),
      setHidden: (componentIds, isHidden) =>
        set((state) => ({
          hiddenIds: isHidden ? [...new Set([...state.hiddenIds, ...componentIds])] : state.hiddenIds.filter((id) => !componentIds.includes(id)),
          selectedIds: isHidden ? state.selectedIds.filter((id) => !componentIds.includes(id)) : state.selectedIds,
          selectedId: isHidden && state.selectedId && componentIds.includes(state.selectedId) ? null : state.selectedId,
        })),
      toggleHidden: (componentId) =>
        set((state) => {
          const isHidden = state.hiddenIds.includes(componentId);
          return {
            hiddenIds: isHidden ? state.hiddenIds.filter((id) => id !== componentId) : [...state.hiddenIds, componentId],
            selectedIds: isHidden ? state.selectedIds : state.selectedIds.filter((id) => id !== componentId),
            selectedId: !isHidden && state.selectedId === componentId ? null : state.selectedId,
          };
        }),
      showAll: () => set({ hiddenIds: [], isolatedIds: null }),
      isolate: (componentIds, options) =>
        set((state) => {
          const isolatedIds = componentIds && componentIds.length > 0 ? componentIds : null;
          return {
            isolatedIds,
            hiddenIds: isolatedIds ? state.hiddenIds.filter((id) => !isolatedIds.includes(id)) : state.hiddenIds,
            focusRequest: options?.focus && isolatedIds ? request(isolatedIds) : state.focusRequest,
          };
        }),
      setViewMode: (viewMode) => set({ viewMode }),
      setExplode: (explode) => set({ explode: Math.min(1, Math.max(0, explode)) }),
      highlight: (componentIds, source) => set({ highlightIds: componentIds, highlightSource: componentIds.length > 0 ? source : null }),
      clearHighlights: () => set({ highlightIds: [], highlightSource: null }),
      toggleBookmark: (componentId) =>
        set((state) => {
          if (!state.vehicleId) return {};
          const current = state.bookmarks[state.vehicleId] ?? [];
          const next = current.includes(componentId) ? current.filter((id) => id !== componentId) : [...current, componentId];
          return { bookmarks: { ...state.bookmarks, [state.vehicleId]: next } };
        }),
      requestCamera: (preset) => set({ cameraRequest: request(preset) }),
      askAssistant: (text) => set({ assistantRequest: request(text) }),
    }),
    {
      name: "car-schematic",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ language: state.language, bookmarks: state.bookmarks }),
    },
  ),
);
