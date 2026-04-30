import { DEFAULT_STROKE_WIDTH } from './types';
import type { BoardElement, BoardPoint, DragHandle, LinearElement } from './types';

const MIN_BOX_SIZE = 24;
const FORTY_FIVE_DEGREES = Math.PI / 4;
const LINE_HIT_TOLERANCE = 14;
const CLOSED_SHAPE_HIT_TOLERANCE = 10;
const STROKE_HIT_EXTRA_TOLERANCE = 3;

export const TEXT_BOX_PADDING_X = 10;
export const TEXT_BOX_PADDING_Y = 8;
export const TEXT_LINE_HEIGHT_RATIO = 1.4;

export function getTextRenderLines(text: string) {
  return (text || 'Text').split('\n');
}

export function getTextLineBoxGlyphOffset(fontSize: number) {
  return (fontSize * (TEXT_LINE_HEIGHT_RATIO - 1)) / 2;
}

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

export function normalizeRotation(degrees: number) {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function hasElementTransform(element: BoardElement) {
  return Boolean((element.rotation ?? 0) % 360 || element.flipX || element.flipY);
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
      return withBoundsCenter(normalizeRect(element.x, element.y, element.width, element.height));
    case 'line':
    case 'arrow':
      return withBoundsCenter(normalizeRect(element.x1, element.y1, element.x2 - element.x1, element.y2 - element.y1));
    case 'draw': {
      if (element.points.length === 0) {
        return withBoundsCenter({ x: 0, y: 0, width: 0, height: 0 });
      }

      const xs = element.points.map((point) => point.x);
      const ys = element.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return withBoundsCenter({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    }
    default:
      return withBoundsCenter({ x: 0, y: 0, width: 0, height: 0 });
  }
}

export function getElementCenter(element: BoardElement) {
  const bounds = getElementBounds(element);
  return { x: bounds.cx, y: bounds.cy };
}

export function getTransformedElementBounds(element: BoardElement) {
  const bounds = getElementBounds(element);

  if (!hasElementTransform(element)) {
    return bounds;
  }

  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => transformPointAroundCenter(point, { x: bounds.cx, y: bounds.cy }, element));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return withBoundsCenter({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

export function getSelectionBounds(elements: BoardElement[]) {
  if (elements.length === 0) {
    return null;
  }

  return elements.reduce<ReturnType<typeof getElementBounds> | null>((bounds, element) => {
    const current = getTransformedElementBounds(element);
    if (!bounds) {
      return current;
    }

    const left = Math.min(bounds.x, current.x);
    const top = Math.min(bounds.y, current.y);
    const right = Math.max(bounds.x + bounds.width, current.x + current.width);
    const bottom = Math.max(bounds.y + bounds.height, current.y + current.height);

    return withBoundsCenter({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }, null);
}

export function hitTestElement(
  element: BoardElement,
  point: BoardPoint,
  options?: {
    closedShapeMode?: 'fill' | 'stroke';
  }
) {
  const closedShapeMode = options?.closedShapeMode ?? 'fill';
  const localPoint = hasElementTransform(element) ? inverseTransformPointAroundCenter(point, getElementCenter(element), element) : point;

  switch (element.type) {
    case 'rectangle': {
      const tolerance = getStrokeHitTolerance(element, CLOSED_SHAPE_HIT_TOLERANCE);
      const hitsStroke = hitTestRectangleStroke(element, localPoint, tolerance);
      if (closedShapeMode === 'stroke') {
        return hitsStroke;
      }
      return hitsStroke || (hasVisibleFill(element.fillColor) && hitTestRectangleArea(element, localPoint));
    }
    case 'ellipse': {
      const tolerance = getStrokeHitTolerance(element, CLOSED_SHAPE_HIT_TOLERANCE);
      const hitsStroke = hitTestEllipseStroke(element, localPoint, tolerance);
      if (closedShapeMode === 'stroke') {
        return hitsStroke;
      }
      return hitsStroke || (hasVisibleFill(element.fillColor) && hitTestEllipseArea(element, localPoint));
    }
    case 'text':
    case 'image':
      return isPointInBounds(localPoint, getElementBounds(element));
    case 'line':
    case 'arrow':
      return (
        distanceToSegment(localPoint, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <=
        getStrokeHitTolerance(element, LINE_HIT_TOLERANCE)
      );
    case 'draw': {
      const tolerance = getStrokeHitTolerance(element, LINE_HIT_TOLERANCE);
      if (element.points.length === 1) {
        return Math.hypot(localPoint.x - element.points[0].x, localPoint.y - element.points[0].y) <= tolerance;
      }

      for (let index = 0; index < element.points.length - 1; index += 1) {
        if (distanceToSegment(localPoint, element.points[index], element.points[index + 1]) <= tolerance) {
          return true;
        }
      }
      return false;
    }
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

export function moveElementBy<T extends BoardElement>(element: T, dx: number, dy: number): T {
  return offsetElement(element, dx, dy);
}

export function moveElementCenterTo<T extends BoardElement>(element: T, cx: number, cy: number): T {
  const currentCenter = getElementCenter(element);
  return moveElementBy(element, cx - currentCenter.x, cy - currentCenter.y);
}

export function rotatePointAround(point: BoardPoint, center: BoardPoint, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
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
  const bounds = getTransformedElementBounds(element);
  return getBoundsHandlePositions(bounds);
}

export function getLinearHandlePositions(element: LinearElement) {
  return [
    { key: 'start' as DragHandle, x: element.x1, y: element.y1 },
    { key: 'end' as DragHandle, x: element.x2, y: element.y2 },
  ];
}

export function getConstrainedBoxFromOrigin(origin: BoardPoint, point: BoardPoint) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    width: getSignedValue(dx, size),
    height: getSignedValue(dy, size),
  };
}

export function getConstrainedLinearPoint(anchor: BoardPoint, point: BoardPoint) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return point;
  }

  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / FORTY_FIVE_DEGREES) * FORTY_FIVE_DEGREES;

  return {
    x: anchor.x + Math.cos(snappedAngle) * length,
    y: anchor.y + Math.sin(snappedAngle) * length,
  };
}

export function resizeBoxElement(
  element: BoardElement,
  handle: DragHandle,
  point: BoardPoint,
  keepSquare = false,
  preserveAspectRatio = false
) {
  if (element.type === 'line' || element.type === 'arrow') {
    return element;
  }

  const bounds = getElementBounds(element);

  if (element.type === 'draw') {
    const targetBounds = preserveAspectRatio
      ? getAspectRatioConstrainedBounds(bounds, handle, point)
      : getResizedBounds(bounds, handle, point);
    return {
      ...element,
      points: scaleDrawPointsToBounds(element.points, bounds, targetBounds),
    };
  }

  if (keepSquare || preserveAspectRatio) {
    const anchor = getOppositeCorner(bounds, handle);
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const direction = getHandleDirection(handle);

    if (keepSquare) {
      const size = Math.max(Math.abs(dx), Math.abs(dy), MIN_BOX_SIZE);
      const constrainedPoint = {
        x: anchor.x + resolveSignedDistance(dx, size, direction.x),
        y: anchor.y + resolveSignedDistance(dy, size, direction.y),
      };
      const next = normalizeRect(anchor.x, anchor.y, constrainedPoint.x - anchor.x, constrainedPoint.y - anchor.y);

      return {
        ...element,
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      };
    }

    const aspectRatio = bounds.width / Math.max(bounds.height, 1);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    let nextWidth = absDx;
    let nextHeight = absDy;

    if (absDx / Math.max(aspectRatio, 0.0001) > absDy) {
      nextHeight = absDx / Math.max(aspectRatio, 0.0001);
    } else {
      nextWidth = absDy * aspectRatio;
    }

    const scale = Math.max(MIN_BOX_SIZE / Math.max(nextWidth, 1), MIN_BOX_SIZE / Math.max(nextHeight, 1), 1);
    nextWidth *= scale;
    nextHeight *= scale;

    const constrainedPoint = {
      x: anchor.x + resolveSignedDistance(dx, nextWidth, direction.x),
      y: anchor.y + resolveSignedDistance(dy, nextHeight, direction.y),
    };
    const next = normalizeRect(anchor.x, anchor.y, constrainedPoint.x - anchor.x, constrainedPoint.y - anchor.y);

    return {
      ...element,
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
    };
  }
  const next = getResizedBounds(bounds, handle, point);
  return {
    ...element,
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
  };
}

export function resizeLinearElement(
  element: BoardElement,
  handle: DragHandle,
  point: BoardPoint,
  snapAngle = false
) {
  if (element.type !== 'line' && element.type !== 'arrow') {
    return element;
  }

  if (handle === 'start') {
    const nextStart = snapAngle ? getConstrainedLinearPoint({ x: element.x2, y: element.y2 }, point) : point;
    return { ...element, x1: nextStart.x, y1: nextStart.y };
  }

  const nextEnd = snapAngle ? getConstrainedLinearPoint({ x: element.x1, y: element.y1 }, point) : point;
  return { ...element, x2: nextEnd.x, y2: nextEnd.y };
}

export function scaleElementToBounds(
  element: BoardElement,
  sourceBounds: ReturnType<typeof normalizeRect>,
  targetBounds: ReturnType<typeof normalizeRect>
) {
  switch (element.type) {
    case 'draw':
      return {
        ...element,
        points: element.points.map((point) => mapPointBetweenBounds(point, sourceBounds, targetBounds)),
      };
    case 'line':
    case 'arrow':
      return {
        ...element,
        x1: mapPointBetweenBounds({ x: element.x1, y: element.y1 }, sourceBounds, targetBounds).x,
        y1: mapPointBetweenBounds({ x: element.x1, y: element.y1 }, sourceBounds, targetBounds).y,
        x2: mapPointBetweenBounds({ x: element.x2, y: element.y2 }, sourceBounds, targetBounds).x,
        y2: mapPointBetweenBounds({ x: element.x2, y: element.y2 }, sourceBounds, targetBounds).y,
      };
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image': {
      const bounds = getElementBounds(element);
      const topLeft = mapPointBetweenBounds({ x: bounds.x, y: bounds.y }, sourceBounds, targetBounds);
      const bottomRight = mapPointBetweenBounds(
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        sourceBounds,
        targetBounds
      );
      const nextBounds = normalizeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      return {
        ...element,
        x: nextBounds.x,
        y: nextBounds.y,
        width: nextBounds.width,
        height: nextBounds.height,
      };
    }
    default:
      return element;
  }
}

export function getAspectRatioConstrainedBounds(
  bounds: ReturnType<typeof normalizeRect>,
  handle: DragHandle,
  point: BoardPoint
) {
  const anchor = getOppositeCorner(bounds, handle);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const direction = getHandleDirection(handle);
  const aspectRatio = bounds.width / Math.max(bounds.height, 1);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let nextWidth = absDx;
  let nextHeight = absDy;

  if (absDx / Math.max(aspectRatio, 0.0001) > absDy) {
    nextHeight = absDx / Math.max(aspectRatio, 0.0001);
  } else {
    nextWidth = absDy * aspectRatio;
  }

  const scale = Math.max(MIN_BOX_SIZE / Math.max(nextWidth, 1), MIN_BOX_SIZE / Math.max(nextHeight, 1), 1);
  nextWidth *= scale;
  nextHeight *= scale;

  const constrainedPoint = {
    x: anchor.x + resolveSignedDistance(dx, nextWidth, direction.x),
    y: anchor.y + resolveSignedDistance(dy, nextHeight, direction.y),
  };

  return normalizeRect(anchor.x, anchor.y, constrainedPoint.x - anchor.x, constrainedPoint.y - anchor.y);
}

export function duplicateElements(elements: BoardElement[], createId: () => string) {
  return elements.map((element) => ({ ...structuredClone(element), id: createId() }));
}

export function getResizedBounds(bounds: ReturnType<typeof normalizeRect>, handle: DragHandle, point: BoardPoint) {
  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;

  if (handleAffectsLeft(handle)) {
    left = Math.min(point.x, right - MIN_BOX_SIZE);
  }

  if (handleAffectsRight(handle)) {
    right = Math.max(point.x, left + MIN_BOX_SIZE);
  }

  if (handleAffectsTop(handle)) {
    top = Math.min(point.y, bottom - MIN_BOX_SIZE);
  }

  if (handleAffectsBottom(handle)) {
    bottom = Math.max(point.y, top + MIN_BOX_SIZE);
  }

  return normalizeRect(left, top, right - left, bottom - top);
}

function scaleDrawPointsToBounds(
  points: BoardPoint[],
  sourceBounds: ReturnType<typeof normalizeRect>,
  targetBounds: ReturnType<typeof normalizeRect>
) {
  return points.map((point) => mapPointBetweenBounds(point, sourceBounds, targetBounds));
}

function withBoundsCenter(bounds: ReturnType<typeof normalizeRect>) {
  return {
    ...bounds,
    cx: bounds.x + bounds.width / 2,
    cy: bounds.y + bounds.height / 2,
  };
}

function transformPointAroundCenter(point: BoardPoint, center: BoardPoint, element: BoardElement) {
  const rotation = normalizeRotation(element.rotation ?? 0);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;
  const dx = (point.x - center.x) * scaleX;
  const dy = (point.y - center.y) * scaleY;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function inverseTransformPointAroundCenter(point: BoardPoint, center: BoardPoint, element: BoardElement) {
  const rotation = normalizeRotation(element.rotation ?? 0);
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const unrotatedX = dx * cos - dy * sin;
  const unrotatedY = dx * sin + dy * cos;

  return {
    x: center.x + unrotatedX * (element.flipX ? -1 : 1),
    y: center.y + unrotatedY * (element.flipY ? -1 : 1),
  };
}

function getOppositeCorner(bounds: ReturnType<typeof normalizeRect>, handle: DragHandle) {
  switch (handle) {
    case 'nw':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
    case 'n':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case 'ne':
      return { x: bounds.x, y: bounds.y + bounds.height };
    case 'e':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
    case 'se':
      return { x: bounds.x, y: bounds.y };
    case 's':
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case 'sw':
      return { x: bounds.x + bounds.width, y: bounds.y };
    case 'w':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    default:
      return { x: bounds.x, y: bounds.y };
  }
}

function getHandleDirection(handle: DragHandle) {
  switch (handle) {
    case 'nw':
      return { x: -1, y: -1 };
    case 'n':
      return { x: 0, y: -1 };
    case 'ne':
      return { x: 1, y: -1 };
    case 'e':
      return { x: 1, y: 0 };
    case 'se':
      return { x: 1, y: 1 };
    case 's':
      return { x: 0, y: 1 };
    case 'sw':
      return { x: -1, y: 1 };
    case 'w':
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 1 };
  }
}

function getBoundsHandlePositions(bounds: ReturnType<typeof normalizeRect>) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return [
    { key: 'nw' as DragHandle, x: bounds.x, y: bounds.y },
    { key: 'n' as DragHandle, x: centerX, y: bounds.y },
    { key: 'ne' as DragHandle, x: bounds.x + bounds.width, y: bounds.y },
    { key: 'e' as DragHandle, x: bounds.x + bounds.width, y: centerY },
    { key: 'se' as DragHandle, x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { key: 's' as DragHandle, x: centerX, y: bounds.y + bounds.height },
    { key: 'sw' as DragHandle, x: bounds.x, y: bounds.y + bounds.height },
    { key: 'w' as DragHandle, x: bounds.x, y: centerY },
  ];
}

function handleAffectsLeft(handle: DragHandle) {
  return handle === 'nw' || handle === 'w' || handle === 'sw';
}

function handleAffectsRight(handle: DragHandle) {
  return handle === 'ne' || handle === 'e' || handle === 'se';
}

function handleAffectsTop(handle: DragHandle) {
  return handle === 'nw' || handle === 'n' || handle === 'ne';
}

function handleAffectsBottom(handle: DragHandle) {
  return handle === 'sw' || handle === 's' || handle === 'se';
}

function resolveSignedDistance(value: number, magnitude: number, fallbackDirection: number) {
  if (value === 0) {
    return fallbackDirection * magnitude;
  }

  return Math.sign(value) * magnitude;
}

function getSignedValue(value: number, magnitude: number) {
  if (value === 0) {
    return magnitude;
  }

  return Math.sign(value) * magnitude;
}

function getElementStrokeWidth(element: BoardElement) {
  return typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth) && element.strokeWidth > 0
    ? element.strokeWidth
    : DEFAULT_STROKE_WIDTH;
}

function getStrokeHitTolerance(element: BoardElement, baseTolerance: number) {
  return Math.max(baseTolerance, getElementStrokeWidth(element) / 2) + STROKE_HIT_EXTRA_TOLERANCE;
}

function hasVisibleFill(fillColor: string | null | undefined) {
  if (fillColor === undefined || fillColor === null) {
    return false;
  }

  const normalized = fillColor.trim().toLowerCase();
  return normalized !== '' && normalized !== 'none' && normalized !== 'transparent';
}
function hitTestRectangleArea(element: Extract<BoardElement, { type: 'rectangle' }>, point: BoardPoint) {
  return isPointInBounds(point, getElementBounds(element));
}

function hitTestRectangleStroke(
  element: Extract<BoardElement, { type: 'rectangle' }>,
  point: BoardPoint,
  tolerance: number
) {
  const bounds = getElementBounds(element);
  const outer = normalizeRect(bounds.x - tolerance, bounds.y - tolerance, bounds.width + tolerance * 2, bounds.height + tolerance * 2);

  if (!isPointInBounds(point, outer)) {
    return false;
  }

  if (bounds.width <= tolerance * 2 || bounds.height <= tolerance * 2) {
    return true;
  }

  const inner = normalizeRect(
    bounds.x + tolerance,
    bounds.y + tolerance,
    Math.max(bounds.width - tolerance * 2, 0),
    Math.max(bounds.height - tolerance * 2, 0)
  );

  return !isPointInBounds(point, inner);
}

function hitTestEllipseArea(element: Extract<BoardElement, { type: 'ellipse' }>, point: BoardPoint) {
  const bounds = getElementBounds(element);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radiusX = Math.max(bounds.width / 2, 1);
  const radiusY = Math.max(bounds.height / 2, 1);
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const value = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);

  return value <= 1;
}

function hitTestEllipseStroke(
  element: Extract<BoardElement, { type: 'ellipse' }>,
  point: BoardPoint,
  tolerance: number
) {
  const bounds = getElementBounds(element);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const outerRadiusX = Math.max(bounds.width / 2 + tolerance, 1);
  const outerRadiusY = Math.max(bounds.height / 2 + tolerance, 1);
  const innerRadiusX = bounds.width / 2 - tolerance;
  const innerRadiusY = bounds.height / 2 - tolerance;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const outerValue = (dx * dx) / (outerRadiusX * outerRadiusX) + (dy * dy) / (outerRadiusY * outerRadiusY);

  if (outerValue > 1) {
    return false;
  }

  if (innerRadiusX <= 0 || innerRadiusY <= 0) {
    return true;
  }

  const innerValue = (dx * dx) / (innerRadiusX * innerRadiusX) + (dy * dy) / (innerRadiusY * innerRadiusY);
  return innerValue >= 1;
}

function mapPointBetweenBounds(
  point: BoardPoint,
  sourceBounds: ReturnType<typeof normalizeRect>,
  targetBounds: ReturnType<typeof normalizeRect>
) {
  const normalizedX = sourceBounds.width === 0 ? 0.5 : (point.x - sourceBounds.x) / sourceBounds.width;
  const normalizedY = sourceBounds.height === 0 ? 0.5 : (point.y - sourceBounds.y) / sourceBounds.height;

  return {
    x: targetBounds.x + normalizedX * targetBounds.width,
    y: targetBounds.y + normalizedY * targetBounds.height,
  };
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

