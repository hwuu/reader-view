// 存储层封装
// 职责：读写用户设置，基于 chrome.storage.sync

export interface Settings {
  theme: 'light' | 'dark' | 'sepia';
  fontSize: number;
  fontFamily: 'serif' | 'sans-serif' | 'monospace';
  lineHeight: number;
  contentWidth: number;
  showImages: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.8,
  contentWidth: 700,
  showImages: true,
};

const STORAGE_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEY] };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  try {
    const current = await loadSettings();
    const updated = { ...current, ...partial };
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
    return updated;
  } catch {
    console.error('Reader View: Failed to save settings');
    return await loadSettings();
  }
}
