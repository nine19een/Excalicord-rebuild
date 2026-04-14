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
};

export type DragHandle = 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end';

export type StrokeElement = {
  id: string;
  type: 'draw';
  points: BoardPoint[];
};

export type RectangleElement = {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EllipseElement = {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LinearElement = {
  id: string;
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TextElement = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};

export type ImageElement = {
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

export type TextEditorState = {
  elementId: string;
  value: string;
};

export type InteractionState =
  | {
      type: 'drawing-stroke';
      pointerId: number;
      elementId: string;
    }
  | {
      type: 'drawing-shape';
      pointerId: number;
      elementId: string;
      origin: BoardPoint;
    }
  | {
      type: 'moving';
      pointerId: number;
      startPoint: BoardPoint;
      snapshot: Record<string, BoardElement>;
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
      elementId: string;
      handle: DragHandle;
      snapshot: BoardElement;
    }
  | {
      type: 'erasing';
      pointerId: number;
    };

