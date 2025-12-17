/**
 * Color utilities for telemetry visualization.
 */

import type { ColorMode, ColorScale } from '@/types';

/**
 * Interpolate between colors based on a value within a scale.
 */
export function getColorForValue(
  value: number,
  colorScale: ColorScale
): string {
  const { min, max, colors } = colorScale;
  
  if (colors.length === 1) {
    return colors[0];
  }
  
  // Normalize value to 0-1 range
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  
  // Find which segment we're in
  const segmentCount = colors.length - 1;
  const scaledValue = normalized * segmentCount;
  const segmentIndex = Math.min(Math.floor(scaledValue), segmentCount - 1);
  const segmentProgress = scaledValue - segmentIndex;
  
  // Interpolate between the two colors
  const color1 = parseColor(colors[segmentIndex]);
  const color2 = parseColor(colors[segmentIndex + 1]);
  
  const r = Math.round(color1.r + (color2.r - color1.r) * segmentProgress);
  const g = Math.round(color1.g + (color2.g - color1.g) * segmentProgress);
  const b = Math.round(color1.b + (color2.b - color1.b) * segmentProgress);
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Parse hex color to RGB components.
 */
function parseColor(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 128, g: 128, b: 128 }; // Default gray
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Create CSS gradient string for legend display.
 */
export function createGradientCSS(colorScale: ColorScale): string {
  const stops = colorScale.colors.map((color, index) => {
    const percent = (index / (colorScale.colors.length - 1)) * 100;
    return `${color} ${percent}%`;
  }).join(', ');
  
  return `linear-gradient(to right, ${stops})`;
}

/**
 * Generate legend label stops for a color scale.
 */
export function generateLegendStops(
  mode: ColorMode,
  scales: Record<ColorMode, ColorScale>
): { value: number; label: string; color: string }[] {
  const scale = scales[mode];
  const stops: { value: number; label: string; color: string }[] = [];
  
  const stepCount = Math.min(5, scale.colors.length);
  
  for (let i = 0; i < stepCount; i++) {
    const t = i / (stepCount - 1);
    const value = scale.min + (scale.max - scale.min) * t;
    
    let label: string;
    switch (mode) {
      case 'speed':
        label = `${(value * 2.237).toFixed(0)} mph`; // m/s to mph
        break;
      case 'lateral_g':
      case 'longitudinal_g':
      case 'total_g':
        label = `${value.toFixed(1)} G`;
        break;
      default:
        label = value.toFixed(1);
    }
    
    stops.push({
      value,
      label,
      color: getColorForValue(value, scale),
    });
  }
  
  return stops;
}

/**
 * Get the appropriate value from a sample based on color mode.
 */
export function getSampleValueForMode(
  sample: { speed: number; ax: number; ay: number; total_g: number },
  mode: ColorMode
): number {
  switch (mode) {
    case 'speed':
      return sample.speed;
    case 'lateral_g':
      return sample.ay;
    case 'longitudinal_g':
      return sample.ax;
    case 'total_g':
      return sample.total_g;
    case 'solid':
    default:
      return 0;
  }
}

/**
 * Convert RGB to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Darken a color by a percentage.
 */
export function darkenColor(hex: string, percent: number): string {
  const { r, g, b } = parseColor(hex);
  const factor = 1 - percent / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

/**
 * Lighten a color by a percentage.
 */
export function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = parseColor(hex);
  const factor = percent / 100;
  return rgbToHex(
    r + (255 - r) * factor,
    g + (255 - g) * factor,
    b + (255 - b) * factor
  );
}
