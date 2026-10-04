// NocoQuality's own palette is first, so it is the fallback and the default without a config.yml setting:
// the online Hub keeps a runtime configuration that this repository does not deploy.
export const themePresets = [
  { id: 'nocoquality', labelKey: 'appearance.themes.nocoquality' },
  { id: 'compact', labelKey: 'appearance.themes.compact' },
  { id: 'default', labelKey: 'appearance.themes.default' },
] as const;

export type ThemePresetId = (typeof themePresets)[number]['id'];
export const defaultThemePreset: ThemePresetId = 'nocoquality';
