export type ToolType =
  | 'hand'
  | 'select'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'draw'
  | 'text'
  | 'image'
  | 'eraser';

export type BoardPoint = {
  x: number;
  y: number;
};

export type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export type DragHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

export type ColorStyle = {
  color?: string;
  opacity?: number;
};

export type LayerAction = 'bring-forward' | 'send-backward' | 'bring-to-front' | 'send-to-back';

export type ElementTransform = {
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity?: number;
};

export const MIN_VIEWPORT_ZOOM = 0.25;
export const MAX_VIEWPORT_ZOOM = 4;
export const FIT_CONTENT_MIN_ZOOM = 0.5;
export const FIT_CONTENT_MAX_ZOOM = 1.5;
export const ZOOM_BUTTON_STEP = 0.1;

export const DEFAULT_BOARD_COLOR = '#1f2937';

export const BOARD_COLOR_OPTIONS = [
  '#111827',
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#ea580c',
] as const;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'system-ui',
  fontSize: 28,
  color: '#111827',
  opacity: 1,
};

export const TEXT_FONT_OPTIONS = [
  { label: 'System', value: 'system-ui' },
  { label: 'Serif', value: 'serif' },
  { label: 'Mono', value: 'monospace' },
  { label: 'Rounded', value: 'ui-rounded, system-ui' },
] as const;

export const TEXT_SIZE_OPTIONS = [16, 20, 24, 28, 32, 40] as const;

export const TEXT_COLOR_OPTIONS = BOARD_COLOR_OPTIONS;

export type StrokeElement = ElementTransform & {
  id: string;
  type: 'draw';
  points: BoardPoint[];
  color: string;
};

export type RectangleElement = ElementTransform & {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type EllipseElement = ElementTransform & {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type LinearElement = ElementTransform & {
  id: string;
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

export type TextElement = ElementTransform & {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
};

export type ImageElement = ElementTransform & {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  fileName: string;
};

export type BoardElement =
  | StrokeElement
  | RectangleElement
  | EllipseElement
  | LinearElement
  | TextElement
  | ImageElement;
export type SlideFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Slide = {
  id: string;
  name: string;
  frame: SlideFrame;
  elements: BoardElement[];
};

export type TextEditorState = {
  elementId: string;
  value: string;
};

export type InteractionState =
  | {
      type: 'drawing-stroke';
      pointerId: number;
      elementId: string;
      initialElements: BoardElement[];
    }
  | {
      type: 'drawing-shape';
      pointerId: number;
      elementId: string;
      origin: BoardPoint;
      initialElements: BoardElement[];
    }
  | {
      type: 'moving';
      pointerId: number;
      startPoint: BoardPoint;
      snapshot: Record<string, BoardElement>;
      initialElements: BoardElement[];
    }
  | {
      type: 'selecting';
      pointerId: number;
      startPoint: BoardPoint;
      currentPoint: BoardPoint;
    }
  | {
      type: 'panning';
      pointerId: number;
      startClient: BoardPoint;
      startViewport: ViewportState;
    }
  | {
      type: 'resizing';
      pointerId: number;
      elementId: string | null;
      handle: DragHandle;
      snapshot: BoardElement | Record<string, BoardElement>;
      initialElements: BoardElement[];
      selectionBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
      selectionCenter?: BoardPoint;
      selectionRotation?: number;
      currentSelectionBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      targetIds: string[];
    }
  | {
      type: 'rotating';
      pointerId: number;
      center: BoardPoint;
      startAngle: number;
      startRotation: number;
      currentRotation: number;
      selectionBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      snapshot: Record<string, BoardElement>;
      initialElements: BoardElement[];
      targetIds: string[];
    }
  | {
      type: 'erasing';
      pointerId: number;
    };
