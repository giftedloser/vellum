export type SegmentValue = string | number;
export type SegmentOption<T extends SegmentValue> = { label: string; value: T };

export const interfaceScaleOptions = [
  { label: "Compact", value: 80 },
  { label: "Default", value: 92 },
  { label: "Large", value: 110 },
] as const;

export const sidebarOpacityOptions = [
  { label: "Low", value: 100 },
  { label: "Medium", value: 84 },
  { label: "High", value: 65 },
] as const;

export const readingWidthOptions = [
  { label: "Narrow", value: 680 },
  { label: "Default", value: 880 },
  { label: "Wide", value: 1180 },
] as const;

export const fontScaleOptions = [
  { label: "Small", value: 85 },
  { label: "Default", value: 95 },
  { label: "Large", value: 125 },
] as const;

export function nearestPreset(value: number, options: readonly SegmentOption<number>[]) {
  return options.reduce((nearest, option) =>
    Math.abs(option.value - value) < Math.abs(nearest - value) ? option.value : nearest,
  options[0].value);
}

export function normalizeSegmentedPreferences<T extends {
  interfaceScale: number;
  sidebarOpacity: number;
  readingWidth: number;
  fontScale: number;
}>(preferences: T): T {
  return {
    ...preferences,
    interfaceScale: nearestPreset(preferences.interfaceScale, interfaceScaleOptions),
    sidebarOpacity: nearestPreset(preferences.sidebarOpacity, sidebarOpacityOptions),
    readingWidth: nearestPreset(preferences.readingWidth, readingWidthOptions),
    fontScale: nearestPreset(preferences.fontScale, fontScaleOptions),
  };
}

export function stepValue(value: number, delta: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value + delta));
}
