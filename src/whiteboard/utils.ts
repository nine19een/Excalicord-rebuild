import type { BoardElement, BoardPoint, DragHandle, LinearElement } from './types';

export function generateElementId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `element-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeRect(x: number, y: number, width: number, height: number) {
  return {
    x: width >= 0 ? x : x + width,
    y: height >= 0 ? y : y + height,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

export function isPointInBounds(point: BoardPoint, bounds: ReturnType<typeof normalizeRect>) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function rectContainsBounds(
  rect: ReturnType<typeof normalizeRect>,
  bounds: ReturnType<typeof normalizeRect>
) {
  return (
    bounds.x >= rect.x &&
    bounds.y >= rect.y &&
    bounds.x + bounds.width <= rect.x + rect.width &&
    bounds.y + bounds.height <= rect.y + rect.height
  );
}

export function getElementBounds(element: BoardElement) {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image':
      return normalizeRect(element.x, element.y, element.width, element.height);
    case 'line':
    case 'arrow':
      return normalizeRect(element.x1, element.y1, element.x2 - element.x1, element.y2 - element.y1);
    case 'draw': {
      const xs = element.points.map((point) => point.x);
      const ys = element.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function hitTestElement(element: BoardElement, point: BoardPoint) {
  switch (element.type) {
    case 'rectangle':
      return hitTestRectangleOutline(element, point);
    case 'ellipse':
      return hitTestEllipseOutline(element, point);
    case 'text':
    case 'image':
      return isPointInBounds(point, getElementBounds(element));
    case 'line':
    case 'arrow':
      return distanceToSegment(point, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <= 10;
    case 'draw':
      if (element.points.length === 1) {
        return Math.hypot(point.x - element.points[0].x, point.y - element.points[0].y) <= 10;
      }

      for (let index = 0; index < element.points.length - 1; index += 1) {
        if (distanceToSegment(point, element.points[index], element.points[index + 1]) <= 10) {
          return true;
        }
      }
      return false;
    default:
      return false;
  }
}

export function offsetElement<T extends BoardElement>(element: T, dx: number, dy: number): T {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image':
      return { ...element, x: element.x + dx, y: element.y + dy } as T;
    case 'line':
    case 'arrow':
      return {
        ...element,
        x1: element.x1 + dx,
        y1: element.y1 + dy,
        x2: element.x2 + dx,
        y2: element.y2 + dy,
      } as T;
    case 'draw':
      return {
        ...element,
        points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      } as T;
    default:
      return element;
  }
}

export function normalizeBoxElement<T extends BoardElement>(element: T): T {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image': {
      const bounds = normalizeRect(element.x, element.y, element.width, element.height);
      return { ...element, ...bounds } as T;
    }
    default:
      return element;
  }
}

export function getSelectionHandlePositions(element: BoardElement) {
  const bounds = getElementBounds(element);
  return [
    { key: 'nw' as DragHandle, x: bounds.x, y: bounds.y },
    { key: 'ne' as DragHandle, x: bounds.x + bounds.width, y: bounds.y },
    { key: 'sw' as DragHandle, x: bounds.x, y: bounds.y + bounds.height },
    { key: 'se' as DragHandle, x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];
}

export function getLinearHandlePositions(element: LinearElement) {
  return [
    { key: 'start' as DragHandle, x: element.x1, y: element.y1 },
    { key: 'end' as DragHandle, x: element.x2, y: element.y2 },
  ];
}

export function resizeBoxElement(element: BoardElement, handle: DragHandle, point: BoardPoint) {
  if (element.type === 'line' || element.type === 'arrow' || element.type === 'draw') {
    return element;
  }

  const bounds = getElementBounds(element);
  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;

  if (handle === 'nw' || handle === 'sw') {
    left = point.x;
  }

  if (handle === 'ne' || handle === 'se') {
    right = point.x;
  }

  if (handle === 'nw' || handle === 'ne') {
    top = point.y;
  }

  if (handle === 'sw' || handle === 'se') {
    bottom = point.y;
  }

  const next = normalizeRect(left, top, right - left, bottom - top);
  return {
    ...element,
    x: next.x,
    y: next.y,
    width: Math.max(next.width, 24),
    height: Math.max(next.height, 24),
  };
}

export function resizeLinearElement(element: BoardElement, handle: DragHandle, point: BoardPoint) {
  if (element.type !== 'line' && element.type !== 'arrow') {
    return element;
  }

  if (handle === 'start') {
    return { ...element, x1: point.x, y1: point.y };
  }

  return { ...element, x2: point.x, y2: point.y };
}

export function duplicateElements(elements: BoardElement[], createId: () => string) {
  return elements.map((element) => ({ ...structuredClone(element), id: createId() }));
}

function hitTestRectangleOutline(element: Extract<BoardElement, { type: 'rectangle' }>, point: BoardPoint) {
  const bounds = getElementBounds(element);
  const tolerance = 8;
  const outerBounds = normalizeRect(
    bounds.x - tolerance,
    bounds.y - tolerance,
    bounds.width + tolerance * 2,
    bounds.height + tolerance * 2
  );

  if (!isPointInBounds(point, outerBounds)) {
    return false;
  }

  if (bounds.width <= tolerance * 2 || bounds.height <= tolerance * 2) {
    return true;
  }

  const innerBounds = normalizeRect(
    bounds.x + tolerance,
    bounds.y + tolerance,
    bounds.width - tolerance * 2,
    bounds.height - tolerance * 2
  );

  return !isPointInBounds(point, innerBounds);
}

function hitTestEllipseOutline(element: Extract<BoardElement, { type: 'ellipse' }>, point: BoardPoint) {
  const bounds = getElementBounds(element);
  const tolerance = 8;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radiusX = Math.max(bounds.width / 2, 1);
  const radiusY = Math.max(bounds.height / 2, 1);
  const outerRx = radiusX + tolerance;
  const outerRy = radiusY + tolerance;
  const innerRx = Math.max(radiusX - tolerance, 0.1);
  const innerRy = Math.max(radiusY - tolerance, 0.1);
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const outerValue = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy);

  if (outerValue > 1) {
    return false;
  }

  if (radiusX <= tolerance || radiusY <= tolerance) {
    return true;
  }

  const innerValue = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy);
  return innerValue >= 1;
}

function distanceToSegment(point: BoardPoint, start: BoardPoint, end: BoardPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectionX = start.x + t * dx;
  const projectionY = start.y + t * dy;

  return Math.hypot(point.x - projectionX, point.y - projectionY);
}
