import type { CameraSettings, RecordingVisualSettings } from './cameraTypes';
import type { SlideFrame } from './whiteboard/types';

export type RecordingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecordingCompositionLayout = {
  backgroundRect: RecordingRect;
  canvasRect: RecordingRect;
  cameraRect: RecordingRect;
  canvasRadius: number;
  cameraRadius: number;
  scaleX: number;
  scaleY: number;
};

const MIN_CANVAS_SCALE = 0.75;

export function getRecordingCompositionLayout(
  backgroundRect: RecordingRect,
  sourceFrame: SlideFrame,
  visualSettings: RecordingVisualSettings,
  cameraSettings: CameraSettings
): RecordingCompositionLayout {
  const safeSourceWidth = Math.max(sourceFrame.width, 1);
  const safeSourceHeight = Math.max(sourceFrame.height, 1);
  const scale = backgroundRect.width / safeSourceWidth;
  const maxPadding = Math.max(0, Math.min(backgroundRect.width, backgroundRect.height) * ((1 - MIN_CANVAS_SCALE) / 2));
  const padding = Math.min(Math.max(0, visualSettings.canvasPadding * scale), maxPadding);
  const availableRect = {
    x: backgroundRect.x + padding,
    y: backgroundRect.y + padding,
    width: Math.max(1, backgroundRect.width - padding * 2),
    height: Math.max(1, backgroundRect.height - padding * 2),
  };
  const sourceRatio = safeSourceWidth / safeSourceHeight;
  const availableRatio = availableRect.width / availableRect.height;
  const canvasWidth = availableRatio > sourceRatio ? availableRect.height * sourceRatio : availableRect.width;
  const canvasHeight = canvasWidth / sourceRatio;
  const canvasRect = {
    x: availableRect.x + (availableRect.width - canvasWidth) / 2,
    y: availableRect.y + (availableRect.height - canvasHeight) / 2,
    width: Math.max(1, canvasWidth),
    height: Math.max(1, canvasHeight),
  };
  const scaleX = canvasRect.width / safeSourceWidth;
  const scaleY = canvasRect.height / safeSourceHeight;
  const sizeScale = Math.min(scaleX, scaleY);
  const canvasRadius = Math.min(
    Math.max(0, visualSettings.canvasRadius * sizeScale),
    canvasRect.width / 2,
    canvasRect.height / 2
  );
  const rawCameraSize = Math.max(1, cameraSettings.size * sizeScale);
  const cameraSize = Math.min(rawCameraSize, canvasRect.width, canvasRect.height);
  const cameraRect = getCameraRectInCanvas(canvasRect, cameraSettings.position, cameraSize);
  const cameraRadius =
    cameraSettings.shape === 'circle'
      ? cameraRect.width / 2
      : Math.min(cameraRect.width / 2, Math.max(8 * sizeScale, cameraRect.width * 0.12));

  return {
    backgroundRect,
    canvasRect,
    cameraRect,
    canvasRadius,
    cameraRadius,
    scaleX,
    scaleY,
  };
}

export function getCameraRectInCanvas(
  canvasRect: RecordingRect,
  position: { x: number; y: number },
  size: number
): RecordingRect {
  const safeSize = Math.min(Math.max(size, 1), canvasRect.width, canvasRect.height);
  const availableX = Math.max(canvasRect.width - safeSize, 0);
  const availableY = Math.max(canvasRect.height - safeSize, 0);

  return {
    x: canvasRect.x + clamp01(position.x) * availableX,
    y: canvasRect.y + clamp01(position.y) * availableY,
    width: safeSize,
    height: safeSize,
  };
}

export function getCameraPositionFromRect(canvasRect: RecordingRect, cameraRect: RecordingRect) {
  const availableX = Math.max(canvasRect.width - cameraRect.width, 1);
  const availableY = Math.max(canvasRect.height - cameraRect.height, 1);

  return {
    x: clamp01((cameraRect.x - canvasRect.x) / availableX),
    y: clamp01((cameraRect.y - canvasRect.y) / availableY),
  };
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
