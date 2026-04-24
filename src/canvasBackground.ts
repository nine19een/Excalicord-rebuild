import type { CanvasBackgroundPattern, RecordingVisualSettings } from './cameraTypes';

export type CanvasBackgroundCss = {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
};

export const DEFAULT_CANVAS_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_CANVAS_BACKGROUND_PATTERN: CanvasBackgroundPattern = 'none';
export const DEFAULT_CANVAS_BACKGROUND_SPACING = 64;

export function getCanvasBackgroundCss(settings: Pick<RecordingVisualSettings, 'canvasBackgroundColor' | 'canvasBackgroundPattern' | 'canvasBackgroundSpacing'>): CanvasBackgroundCss {
  return getCanvasBackgroundCssWithSpacing(settings, clampCanvasBackgroundSpacing(settings.canvasBackgroundSpacing));
}

export function getCanvasBackgroundCssWithSpacing(
  settings: Pick<RecordingVisualSettings, 'canvasBackgroundColor' | 'canvasBackgroundPattern'>,
  resolvedSpacing: number
): CanvasBackgroundCss {
  const color = normalizeCanvasBackgroundColor(settings.canvasBackgroundColor);
  const pattern = settings.canvasBackgroundPattern ?? DEFAULT_CANVAS_BACKGROUND_PATTERN;
  const spacing = Number.isFinite(resolvedSpacing) ? Math.max(2, resolvedSpacing) : DEFAULT_CANVAS_BACKGROUND_SPACING;
  const patternColor = getCanvasPatternColor(color);

  if (pattern === 'ruled') {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${spacing}px ${spacing}px`,
    };
  }

  if (pattern === 'grid') {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${spacing}px ${spacing}px`,
    };
  }

  if (pattern === 'dots') {
    return {
      backgroundColor: color,
      backgroundImage: `radial-gradient(circle, ${getCanvasDotPatternColor(color)} 1.8px, transparent 2.18px)`,
      backgroundSize: `${spacing}px ${spacing}px`,
    };
  }

  return { backgroundColor: color, backgroundImage: 'none', backgroundSize: 'auto' };
}
export function normalizeCanvasBackgroundColor(color: string | undefined) {
  return color && color.trim() ? color : DEFAULT_CANVAS_BACKGROUND_COLOR;
}

export function clampCanvasBackgroundSpacing(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CANVAS_BACKGROUND_SPACING;
  }

  return Math.min(140, Math.max(40, Number(value)));
}

export function isDarkCanvasBackground(color: string) {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return false;
  }
  return getRelativeLuminance(rgb.red, rgb.green, rgb.blue) < 0.32;
}

export function drawCanvasBackgroundPattern(
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  settings: Pick<RecordingVisualSettings, 'canvasBackgroundColor' | 'canvasBackgroundPattern' | 'canvasBackgroundSpacing'>,
  scale = 1
) {
  const color = normalizeCanvasBackgroundColor(settings.canvasBackgroundColor);
  const pattern = settings.canvasBackgroundPattern ?? DEFAULT_CANVAS_BACKGROUND_PATTERN;
  const spacing = Math.max(2, clampCanvasBackgroundSpacing(settings.canvasBackgroundSpacing) * Math.max(scale, 0.01));
  const patternColor = getCanvasPatternColor(color);
  const dotPatternColor = getCanvasDotPatternColor(color);

  context.save();
  context.fillStyle = color;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (pattern === 'none') {
    context.restore();
    return;
  }

  context.strokeStyle = patternColor;
  context.fillStyle = patternColor;
  context.lineWidth = 1;

  if (pattern === 'ruled' || pattern === 'grid') {
    context.beginPath();
    for (let y = rect.y + spacing; y < rect.y + rect.height; y += spacing) {
      const alignedY = Math.round(y) + 0.5;
      context.moveTo(rect.x, alignedY);
      context.lineTo(rect.x + rect.width, alignedY);
    }

    if (pattern === 'grid') {
      for (let x = rect.x + spacing; x < rect.x + rect.width; x += spacing) {
        const alignedX = Math.round(x) + 0.5;
        context.moveTo(alignedX, rect.y);
        context.lineTo(alignedX, rect.y + rect.height);
      }
    }

    context.stroke();
  }

  if (pattern === 'dots') {
    context.fillStyle = dotPatternColor;
    const radius = Math.max(1.55, Math.min(2.9, spacing * 0.105));
    for (let y = rect.y + spacing / 2; y < rect.y + rect.height; y += spacing) {
      for (let x = rect.x + spacing / 2; x < rect.x + rect.width; x += spacing) {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  context.restore();
}

export function getCanvasDotPatternColor(color: string) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return 'rgba(100, 116, 139, 0.38)';
  }

  const luminance = getRelativeLuminance(rgb.red, rgb.green, rgb.blue);
  if (luminance < 0.32) {
    return 'rgba(255, 255, 255, 0.32)';
  }

  return `rgba(${Math.max(0, rgb.red - 142)}, ${Math.max(0, rgb.green - 142)}, ${Math.max(0, rgb.blue - 142)}, 0.52)`;
}
export function getCanvasPatternColor(color: string) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return 'rgba(100, 116, 139, 0.22)';
  }

  const luminance = getRelativeLuminance(rgb.red, rgb.green, rgb.blue);
  if (luminance < 0.32) {
    return 'rgba(255, 255, 255, 0.16)';
  }

  return `rgba(${Math.max(0, rgb.red - 92)}, ${Math.max(0, rgb.green - 92)}, ${Math.max(0, rgb.blue - 92)}, 0.28)`;
}

function parseHexColor(color: string) {
  const normalized = color.trim().toLowerCase();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;

  if (expanded.length !== 6) {
    return null;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { red, green, blue };
}

function getRelativeLuminance(red: number, green: number, blue: number) {
  const [r, g, b] = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}








