/**
 * Color utilities for telemetry visualization.
 */

import type { ColorMode, ColorScale, DEFAULT_COLOR_SCALES } from '@/types';

/**
 * Interpolate between colors in a gradient.
 */
export function interpolateColor(
  value: number,
  min: number,
  max: number,
  colors: string[]
): string {
  // Clamp value to range
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  
  if (colors.length === 1) {
    return colors[0];
  }
  
  // Find which segment we're in
  const segmentCount = colors.length - 1;
  const segment = Math.min(Math.floor(t * segmentCount), segmentCount - 1);
  const segmentT = (t * segmentCount) - segment;
  
  // Interpolate between the two colors
  const color1 = parseColor(colors[segment]);
  const color2 = parseColor(colors[segment + 1]);
  
  const r = Math.round(color1.r + (color2.r - color1.r) * segmentT);
  const g = Math.round(color1.g + (color2.g - color1.g) * segmentT);
  const b = Math.round(color1.b + (color2.b - color1.b) * segmentT);
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Parse a hex color to RGB components.
 */
function parseColor(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Get color for a telemetry value based on color mode.
 */
export function getValueColor(
  value: number | null,
  colorMode: ColorMode,
  colorScales: Record<ColorMode, ColorScale>
): string {
  if (value === null || isNaN(value)) {
    return '#666666'; // Gray for missing data
  }
  
  const scale = colorScales[colorMode];
  return interpolateColor(value, scale.min, scale.max, scale.colors);
}

/**
 * Get the appropriate data value for the current color mode.
 */
export function getColorModeValue(
  colorMode: ColorMode,
  sample: {
    speed?: number | null;
    ax?: number | null;
    ay?: number | null;
    total_g?: number | null;
  }
): number | null {
  switch (colorMode) {
    case 'speed':
      return sample.speed ?? null;
    case 'lateral_g':
      return sample.ay ?? null;
    case 'longitudinal_g':
      return sample.ax ?? null;
    case 'total_g':
      return sample.total_g ?? null;
    case 'solid':
      return 0.5; // Middle of range for solid color
    default:
      return null;
  }
}

/**
 * Generate a color legend for the current mode.
 */
export function generateLegendStops(
  colorMode: ColorMode,
  colorScales: Record<ColorMode, ColorScale>,
  numStops: number = 5
): { value: number; color: string; label: string }[] {
  const scale = colorScales[colorMode];
  const stops: { value: number; color: string; label: string }[] = [];
  
  for (let i = 0; i < numStops; i++) {
    const t = i / (numStops - 1);
    const value = scale.min + (scale.max - scale.min) * t;
    const color = interpolateColor(value, scale.min, scale.max, scale.colors);
    
    let label: string;
    switch (colorMode) {
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
    
    stops.push({ value, color, label });
  }
  
  return stops;
}

/**
 * Create a CSS gradient string from color scale.
 */
export function createGradientCSS(
  colorMode: ColorMode,
  colorScales: Record<ColorMode, ColorScale>,
  direction: 'horizontal' | 'vertical' = 'horizontal'
): string {
  const scale = colorScales[colorMode];
  const gradientDir = direction === 'horizontal' ? 'to right' : 'to top';
  return `linear-gradient(${gradientDir}, ${scale.colors.join(', ')})`;
}
