import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * 職員室の見た目。
 *
 * 既定の真っ白は、長く見る画面としてまぶしい。ここだけ変えられるようにする。
 * 3D の背景色だけを対象にし、UI（パネルや文字）の配色は変えない。
 */
export interface OfficeTheme {
  id: string;
  name: string;
  background: string;
}

export const OFFICE_THEMES: OfficeTheme[] = [
  { id: 'white', name: '白', background: '#FAFCFB' },
  { id: 'paper', name: '生成り', background: '#F1E9DC' },
  { id: 'grass', name: '若草', background: '#E4EEE0' },
  { id: 'sky', name: '空', background: '#DEEAF5' },
  { id: 'dusk', name: '夕', background: '#F2E2D8' },
  { id: 'chalk', name: '黒板', background: '#20423A' },
  { id: 'ink', name: '墨', background: '#262B31' }
];

export const DEFAULT_OFFICE_THEME = OFFICE_THEMES[0];

interface AppearanceState {
  themeId: string;
  setThemeId: (id: string) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_OFFICE_THEME.id,
      setThemeId: (themeId) => set({ themeId })
    }),
    { name: 'appearance-storage', storage: createJSONStorage(() => localStorage) }
  )
);

export function getOfficeTheme(id: string): OfficeTheme {
  return OFFICE_THEMES.find((t) => t.id === id) || DEFAULT_OFFICE_THEME;
}

/** React の外（3D 側）から現在の背景色を読む。 */
export function getOfficeBackground(): string {
  return getOfficeTheme(useAppearanceStore.getState().themeId).background;
}
