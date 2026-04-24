import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CameraSettings, RecordingVisualSettings } from '../cameraTypes';
import { getCameraPositionFromRect } from '../recordingLayout';
import { clampCanvasBackgroundSpacing, getCanvasBackgroundCssWithSpacing, getCanvasDotPatternColor, getCanvasPatternColor, isDarkCanvasBackground, normalizeCanvasBackgroundColor } from '../canvasBackground';
import type {
  BoardElement,
  BoardPoint,
  DragHandle,
  InteractionState,
  ColorStyle,
  LinearElement,
  Slide,
  SlideFrame,
  TextEditorState,
  TextElement,
  TextStyle,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_STROKE_STYLE,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_WIDTH,
  MAX_CORNER_RADIUS,
  MAX_STROKE_WIDTH,
  MIN_CORNER_RADIUS,
  MIN_STROKE_WIDTH,
} from '../whiteboard/types';
import {
  generateElementId,
  getConstrainedBoxFromOrigin,
  getConstrainedLinearPoint,
  getElementBounds,
  getElementCenter,
  getAspectRatioConstrainedBounds,
  getTransformedElementBounds,
  hasElementTransform,
  moveElementCenterTo,
  normalizeRotation,
  getResizedBounds,
  hitTestElement,
  isPointInBounds,
  normalizeBoxElement,
  normalizeRect,
  offsetElement,
  rectContainsBounds,
  rotatePointAround,
} from '../whiteboard/utils';
type ImageCropState = {
  elementId: string;
  rect: { x: number; y: number; width: number; height: number };
};

type CropHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type CropInteraction = {
  pointerId: number;
  handle: CropHandle;
  initialRect: { x: number; y: number; width: number; height: number };
  imageBounds: { x: number; y: number; width: number; height: number };
};

type WhiteboardStageProps = {
  activeTool: ToolType;
  elements: BoardElement[];
  slides: Slide[];
  freeboardElements: BoardElement[];
  activeSlideId: string | null;
  recordingFrame: SlideFrame | null;
  recordingOverlayStatus: 'idle' | 'preparing' | 'recording' | 'paused';
  recordingActiveSlideId: string | null;
  recordingSlideTransition: RecordingSlideTransition | null;
  recordingSlideTransitionNow: number;
  recordingVisualSettings: RecordingVisualSettings;
  imageCrop: ImageCropState | null;
  onImageCropChange: (state: ImageCropState | null) => void;
  onConfirmImageCrop: () => void;
  onCancelImageCrop: () => void;
  cameraSettings: CameraSettings;
  cameraStream: MediaStream | null;
  onCameraSettingsChange: (patch: Partial<CameraSettings>) => void;
  onRecordingPointerChange: (state: { point: BoardPoint; pressed: boolean; visible: boolean } | null) => void;
  selectedIds: string[];
  selectedBounds: ReturnType<typeof getElementBounds> | null;
  textDefaults: TextStyle;
  shapeDefaults: ColorStyle;
  textEditor: TextEditorState | null;
  viewport: ViewportState;
  onActiveSlideChange: (slideId: string | null) => void;
  onActiveToolChange: (tool: ToolType) => void;
  onCommitElementsChange: (previous: BoardElement[], next: BoardElement[]) => void;
  onCommitElementOwnerMigration: (
    previous: BoardElement[],
    next: BoardElement[],
    ownerMap: Record<string, string | null>
  ) => void;
  getScopeElements: (slideId: string | null) => BoardElement[];
  onElementsChange: React.Dispatch<React.SetStateAction<BoardElement[]>>;
  onSelectedIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onTextEditorChange: (state: TextEditorState | null) => void;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>;
};

type RecordingSlideSnapshot = {
  frame: SlideFrame;
  elements: BoardElement[];
  name?: string;
};

type RecordingSlideTransition = {
  fromSlideId: string;
  toSlideId: string;
  fromIndex: number;
  toIndex: number;
  firstIndex: number;
  lastIndex: number;
  direction: 'next' | 'prev';
  startTime: number;
  duration: number;
  snapshots: RecordingSlideSnapshot[];
};

type ElementSnapshot = Record<string, BoardElement>;

type SelectionOverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  rotation: number;
};

type LockedGroupSelectionBox = SelectionOverlayBox & {
  idsKey: string;
};
const OWNER_ENTER_THRESHOLD = 2 / 3;
const OWNER_EXIT_THRESHOLD = 1 / 3;
const ROTATE_HANDLE_OFFSET = 34;
const ROTATE_HANDLE_RADIUS = 9;

function WhiteboardStage({
  activeTool,
  elements,
  slides,
  freeboardElements,
  activeSlideId,
  recordingFrame,
  recordingOverlayStatus,
  recordingActiveSlideId,
  recordingSlideTransition,
  recordingSlideTransitionNow,
  recordingVisualSettings,
  imageCrop,
  onImageCropChange,
  onConfirmImageCrop,
  onCancelImageCrop,
  cameraSettings,
  cameraStream,
  onCameraSettingsChange,
  onRecordingPointerChange,
  selectedIds,
  selectedBounds,
  textDefaults,
  shapeDefaults,
  textEditor,
  viewport,
  onActiveSlideChange,
  onActiveToolChange,
  onCommitElementsChange,
  onCommitElementOwnerMigration,
  getScopeElements,
  onElementsChange,
  onSelectedIdsChange,
  onTextEditorChange,
  onViewportChange,
}: WhiteboardStageProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraDragRef = useRef<{
    canvasRect: SlideFrame;
    size: number;
    offset: BoardPoint;
  } | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const [cropInteraction, setCropInteraction] = useState<CropInteraction | null>(null);
  const [isCameraDragging, setIsCameraDragging] = useState(false);
  const [provisionalOwners, setProvisionalOwners] = useState<Record<string, string | null>>({});
  const provisionalOwnersRef = useRef<Record<string, string | null>>({});
  const [lockedGroupSelectionBox, setLockedGroupSelectionBox] = useState<LockedGroupSelectionBox | null>(null);
  const selectedIdsKey = selectedIds.join('|');

  const selectedSingleElement =
    selectedIds.length === 1 ? elements.find((element) => element.id === selectedIds[0]) ?? null : null;

  const editingElement: TextElement | null =
    textEditor &&
    ((elements.find((element) => element.id === textEditor.elementId && element.type === 'text') as TextElement | undefined) ??
      null);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = cameraStream;
    if (cameraStream) {
      video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    if (selectedIds.length <= 1 || lockedGroupSelectionBox?.idsKey !== selectedIdsKey) {
      setLockedGroupSelectionBox(null);
    }
  }, [lockedGroupSelectionBox?.idsKey, selectedIds.length, selectedIdsKey]);


  const selectedSingleElementIsLinear =
    selectedSingleElement?.type === 'line' || selectedSingleElement?.type === 'arrow';
  const selectedElementUsesCustomSelection =
    selectedSingleElement &&
    (selectedSingleElementIsLinear ||
      (!hasElementTransform(selectedSingleElement) &&
        (selectedSingleElement.type === 'rectangle' || selectedSingleElement.type === 'ellipse')));

  const allowBoundsDrag = !(
    selectedSingleElement &&
    (selectedSingleElement.type === 'line' || selectedSingleElement.type === 'arrow')
  );

  useLayoutEffect(() => {
    if (!editingElement || !textEditorRef.current) {
      setEditorHeight(null);
      return;
    }

    const textarea = textEditorRef.current;
    textarea.style.height = '0px';
    const nextHeight = getTextEditorContentHeight(textarea, editingElement.fontSize);
    textarea.style.height = `${nextHeight}px`;
    setEditorHeight((current) => (current === nextHeight ? current : nextHeight));
  }, [editingElement, textEditor?.value]);

  const activeEditorHeight = editingElement ? editorHeight ?? editingElement.height : null;



  const getTextEditorContentHeight = (textarea: HTMLTextAreaElement, fontSize: number) => {
    const minimumHeight = Math.ceil(fontSize * 1.4 + 16);
    return Math.max(textarea.scrollHeight, minimumHeight);
  };

  const editingBounds =
    editingElement && activeEditorHeight
      ? {
          x: editingElement.x,
          y: editingElement.y,
          width: editingElement.width,
          height: activeEditorHeight,
        }
      : null;

  const isMarqueeSelecting = interaction?.type === 'selecting';

  const activeSlideDrawingElement =
    activeSlideId && (interaction?.type === 'drawing-shape' || interaction?.type === 'drawing-stroke')
      ? elements.find((element) => element.id === interaction.elementId) ?? null
      : null;

  const selectionBox =
    isMarqueeSelecting
      ? normalizeRect(
          interaction.startPoint.x,
          interaction.startPoint.y,
          interaction.currentPoint.x - interaction.startPoint.x,
          interaction.currentPoint.y - interaction.startPoint.y
        )
      : null;

  const selectionPreviewElements = useMemo(() => {
    if (!selectionBox) {
      return [];
    }

    return elements.filter((element) => rectContainsBounds(selectionBox, getTransformedElementBounds(element)));
  }, [elements, selectionBox]);

  const stagedCollections = useMemo(
    () => distributeElementsByOwner(slides, freeboardElements, elements, provisionalOwners),
    [elements, freeboardElements, provisionalOwners, slides]
  );

  const cropImageElement = imageCrop
    ? elements.find((element): element is Extract<BoardElement, { type: 'image' }> => element.id === imageCrop.elementId && element.type === 'image') ?? null
    : null;
  const cropImageBounds = cropImageElement
    ? normalizeRect(cropImageElement.x, cropImageElement.y, cropImageElement.width, cropImageElement.height)
    : null;
  const cropControlsStyle = imageCrop && cropImageBounds
    ? {
        left: `${(cropImageBounds.x + cropImageBounds.width / 2) * viewport.zoom + viewport.x}px`,
        top: `${(cropImageBounds.y + cropImageBounds.height) * viewport.zoom + viewport.y + 14}px`,
      }
    : null;

  const selectionOverlayBox = (() => {
    if (
      interaction?.type === 'resizing' &&
      interaction.handle !== 'start' &&
      interaction.handle !== 'end' &&
      interaction.selectionBounds &&
      interaction.selectionCenter &&
      interaction.selectionRotation !== undefined
    ) {
      return createSelectionOverlayBoxFromLocalBounds(
        interaction.currentSelectionBounds ?? interaction.selectionBounds,
        interaction.selectionCenter,
        interaction.selectionRotation
      );
    }

    if (interaction?.type === 'rotating') {
      return {
        ...interaction.selectionBounds,
        centerX: interaction.center.x,
        centerY: interaction.center.y,
        rotation: interaction.currentRotation,
      } satisfies SelectionOverlayBox;
    }

    if (selectedSingleElement) {
      const bounds = getElementBounds(selectedSingleElement);
      const center = getElementCenter(selectedSingleElement);
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        centerX: center.x,
        centerY: center.y,
        rotation: normalizeRotation(selectedSingleElement.rotation ?? 0),
      } satisfies SelectionOverlayBox;
    }

    if (lockedGroupSelectionBox?.idsKey === selectedIdsKey && selectedIds.length > 1) {
      return lockedGroupSelectionBox;
    }

    if (selectedBounds && selectedIds.length > 1) {
      return {
        x: selectedBounds.x,
        y: selectedBounds.y,
        width: selectedBounds.width,
        height: selectedBounds.height,
        centerX: selectedBounds.x + selectedBounds.width / 2,
        centerY: selectedBounds.y + selectedBounds.height / 2,
        rotation: 0,
      } satisfies SelectionOverlayBox;
    }

    return null;
  })();

  const shouldRenderSelectionBox = Boolean(
    selectionOverlayBox &&
      !editingElement &&
      !isMarqueeSelecting &&
      (!selectedElementUsesCustomSelection || (!selectedSingleElementIsLinear && interaction?.type === 'rotating') || selectedIds.length > 1)
  );

  const selectionOverlayClassName =
    selectedIds.length > 1
      ? 'board-stage__group-bounds'
      : selectedSingleElement?.type === 'image'
        ? 'board-stage__selected-bounds board-stage__selected-bounds--solid'
        : 'board-stage__selected-bounds';

  const getWorldPoint = (event: React.PointerEvent | React.MouseEvent): BoardPoint => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (event.clientX - rect.left - viewport.x) / viewport.zoom,
      y: (event.clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  const handleCropHandlePointerDown = (event: React.PointerEvent<SVGRectElement>, handle: CropHandle) => {
    if (!imageCrop || !cropImageBounds) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropInteraction({
      pointerId: event.pointerId,
      handle,
      initialRect: imageCrop.rect,
      imageBounds: cropImageBounds,
    });
  };
  const getSlideAtPoint = (point: BoardPoint) => {
    for (let index = slides.length - 1; index >= 0; index -= 1) {
      const slide = slides[index];
      if (isPointInBounds(point, slide.frame)) {
        return slide;
      }
    }

    return null;
  };

  const updateProvisionalOwners = (nextElements: BoardElement[], targetIds: string[]) => {
    const targetSet = new Set(targetIds);
    const nextOwners = nextElements.reduce<Record<string, string | null>>((owners, element) => {
      if (!targetSet.has(element.id)) {
        return owners;
      }

      owners[element.id] = resolveElementOwner(element, slides, provisionalOwnersRef.current[element.id] ?? activeSlideId);
      return owners;
    }, {});

    provisionalOwnersRef.current = nextOwners;
    setProvisionalOwners(nextOwners);
  };

  const clearProvisionalOwners = () => {
    provisionalOwnersRef.current = {};
    setProvisionalOwners({});
  };

  const activeSlide = activeSlideId ? slides.find((slide) => slide.id === activeSlideId) ?? null : null;
  const recordingOverlayFrame = recordingOverlayStatus === 'idle' ? null : recordingFrame;
  const recordingPresentationStrip =
    recordingOverlayFrame
      ? getRecordingPresentationStrip(
          recordingOverlayFrame,
          slides,
          recordingActiveSlideId ?? activeSlideId,
          recordingSlideTransition,
          recordingSlideTransitionNow || performance.now()
        )
      : null;
  const cameraFrame = recordingOverlayFrame ?? activeSlide?.frame ?? getVisibleWorldFrame(surfaceRef.current, viewport);
  const cameraRect = cameraFrame ? getCameraWorldRect(cameraSettings, cameraFrame) : null;
  const cameraOverlayStyle =
    cameraRect && cameraSettings.enabled
      ? ({
          left: `${cameraRect.x * viewport.zoom + viewport.x}px`,
          top: `${cameraRect.y * viewport.zoom + viewport.y}px`,
          width: `${cameraRect.width * viewport.zoom}px`,
          height: `${cameraRect.height * viewport.zoom}px`,
          borderRadius:
            cameraSettings.shape === 'circle'
              ? '999px'
              : `${Math.round(cameraRect.radius * viewport.zoom)}px`,
        } as React.CSSProperties)
      : undefined;

  const handleCameraPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cameraRect || !cameraFrame) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getWorldPoint(event);
    cameraDragRef.current = {
      canvasRect: cameraFrame,
      size: cameraRect.width,
      offset: {
        x: point.x - cameraRect.x,
        y: point.y - cameraRect.y,
      },
    };
    setIsCameraDragging(true);
  };

  const handleCameraPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = cameraDragRef.current;
    if (!drag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = getWorldPoint(event);
    const nextX = point.x - drag.offset.x;
    const nextY = point.y - drag.offset.y;
    const clampedRect = {
      x: Math.min(Math.max(nextX, drag.canvasRect.x), drag.canvasRect.x + Math.max(drag.canvasRect.width - drag.size, 0)),
      y: Math.min(Math.max(nextY, drag.canvasRect.y), drag.canvasRect.y + Math.max(drag.canvasRect.height - drag.size, 0)),
      width: drag.size,
      height: drag.size,
    };

    onCameraSettingsChange({
      position: getCameraPositionFromRect(drag.canvasRect, clampedRect),
    });
  };

  const handleCameraPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cameraDragRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cameraDragRef.current = null;
    setIsCameraDragging(false);
  };

  const getTopElementAtPoint = (point: BoardPoint) => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];
      const closedShapeMode = element.type === 'rectangle' || element.type === 'ellipse' ? 'fill' : undefined;

      if (hitTestElement(element, point, { closedShapeMode })) {
        return element;
      }
    }

    return null;
  };

  const getResizeCursor = (handle: DragHandle) =>
    (handle === 'start' || handle === 'end') && selectedSingleElementIsLinear && selectedSingleElement
      ? getLinearEndpointCursor(selectedSingleElement)
      : getDragHandleCursor(handle);

  const getHoverCursorForPoint = (point: BoardPoint) => {
    if (activeTool !== 'select' || editingElement) {
      return null;
    }

    if (getRotationHandleHit(point)) {
      return 'grab';
    }

    const linearHandle = getLinearResizeHandle(point);
    if (linearHandle && selectedSingleElement) {
      return getResizeCursor(linearHandle);
    }

    const boxHandle = getBoxResizeHandle(point);
    if (boxHandle) {
      return getResizeCursor(boxHandle);
    }

    if (selectedSingleElement?.type === 'draw' && selectedBounds && isPointInBounds(point, selectedBounds)) {
      return 'move';
    }

    if (selectedIds.length > 1 && selectionOverlayBox && isPointInsideSelectionOverlayBox(point, selectionOverlayBox)) {
      return 'move';
    }

    const hitElement = getTopElementAtPoint(point);
    return hitElement ? 'move' : null;
  };

  const getRotationHandleHit = (point: BoardPoint) => {
    if (!selectionOverlayBox || selectedIds.length === 0) {
      return false;
    }

    if (selectedSingleElementIsLinear && selectedSingleElement) {
      const geometry = getLinearRotationHandleGeometry(selectedSingleElement);
      return isPointInBounds(point, normalizeRect(geometry.handle.x - 10, geometry.handle.y - 10, 20, 20));
    }

    const center = { x: selectionOverlayBox.centerX, y: selectionOverlayBox.centerY };
    const localPoint = rotatePointAround(point, center, -selectionOverlayBox.rotation);
    const handleX = selectionOverlayBox.x + selectionOverlayBox.width / 2;
    const handleY = selectionOverlayBox.y - 34;
    return isPointInBounds(localPoint, normalizeRect(handleX - 10, handleY - 10, 20, 20));
  };

  const eraseAtPoint = (point: BoardPoint) => {
    const target = getTopElementAtPoint(point);
    if (!target) {
      return;
    }

    const nextElements = elements.filter((element) => element.id !== target.id);
    onCommitElementsChange(elements, nextElements);
    onSelectedIdsChange((current) => current.filter((id) => id !== target.id));

    if (textEditor?.elementId === target.id) {
      onTextEditorChange(null);
    }
  };

  const getBoxResizeHandle = (point: BoardPoint): DragHandle | null => {
    if (selectedSingleElement && selectionOverlayBox) {
      if (selectedSingleElement.type === 'line' || selectedSingleElement.type === 'arrow') {
        return null;
      }

      return getSelectionBoxResizeHandle(point, selectionOverlayBox);
    }

    if (selectedIds.length > 1 && selectionOverlayBox) {
      return getSelectionBoxResizeHandle(point, selectionOverlayBox);
    }

    return null;
  };

  const getLinearResizeHandle = (point: BoardPoint): DragHandle | null => {
    if (!selectedSingleElement || (selectedSingleElement.type !== 'line' && selectedSingleElement.type !== 'arrow')) {
      return null;
    }

    const handles = getVisualLinearHandlePositions(selectedSingleElement);
    return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 8, handle.y - 8, 16, 16)))?.key ?? null;
  };


  const commitTextEdit = (nextValue: string) => {
    if (!textEditor || !editingElement) {
      return;
    }

    if (!nextValue.trim()) {
      const nextElements = elements.filter((element) => element.id !== textEditor.elementId);
      onCommitElementsChange(elements, nextElements);
      onSelectedIdsChange((current) => current.filter((id) => id !== textEditor.elementId));
      onTextEditorChange(null);
      return;
    }

    const measuredHeight = textEditorRef.current
      ? getTextEditorContentHeight(textEditorRef.current, editingElement.fontSize)
      : null;
    const nextHeight = measuredHeight ?? activeEditorHeight ?? editingElement.height;
    const nextElements = elements.map((element) =>
      element.id === textEditor.elementId && element.type === 'text'
        ? {
            ...element,
            text: nextValue,
            height: nextHeight,
          }
        : element
    );

    onCommitElementsChange(elements, nextElements);
    onTextEditorChange(null);
    onActiveToolChange('select');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editingElement) {
      commitTextEdit(textEditor?.value ?? editingElement.text);
      return;
    }

    const point = getWorldPoint(event);
    onRecordingPointerChange({ point, pressed: true, visible: true });
    if (imageCrop) {
      return;
    }

    const targetScopeId = getSlideAtPoint(point)?.id ?? null;
    const isCreationTool =
      activeTool === 'draw' ||
      activeTool === 'rectangle' ||
      activeTool === 'ellipse' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'text';

    const scopeElements = targetScopeId === activeSlideId ? elements : getScopeElements(targetScopeId);

    if (activeTool === 'select' && selectionOverlayBox && selectedIds.length > 0 && getRotationHandleHit(point)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const snapshot = Object.fromEntries(
        elements
          .filter((element) => selectedIds.includes(element.id))
          .map((element) => [element.id, structuredClone(element)])
      ) as ElementSnapshot;
      const center = {
        x: selectionOverlayBox.centerX,
        y: selectionOverlayBox.centerY,
      };

      setInteraction({
        type: 'rotating',
        pointerId: event.pointerId,
        center,
        startAngle: getAngleDegrees(center, point),
        startRotation: selectionOverlayBox.rotation,
        currentRotation: selectionOverlayBox.rotation,
        selectionBounds: {
          x: selectionOverlayBox.x,
          y: selectionOverlayBox.y,
          width: selectionOverlayBox.width,
          height: selectionOverlayBox.height,
        },
        snapshot,
        initialElements: structuredClone(elements),
        targetIds: [...selectedIds],
      });
      return;
    }

    if (isCreationTool && targetScopeId !== activeSlideId) {
      onActiveSlideChange(targetScopeId);
    }

    if (activeTool === 'select' && targetScopeId !== activeSlideId) {
      onActiveSlideChange(targetScopeId);
      return;
    }

    const hitElement = getTopElementAtPoint(point);

    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === 'hand') {
      if (recordingOverlayStatus !== 'idle') {
        return;
      }

      setInteraction({
        type: 'panning',
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewport,
      });
      return;
    }

    if (activeTool === 'eraser') {
      eraseAtPoint(point);
      setInteraction({ type: 'erasing', pointerId: event.pointerId });
      return;
    }

    if (activeTool === 'draw') {
      const strokeId = generateElementId();
      const nextStroke: BoardElement = {
        id: strokeId,
        type: 'draw',
        points: [point],
        color: shapeDefaults.color ?? '#1f2937',
        opacity: clampOpacity(shapeDefaults.opacity),
        strokeWidth: clampStrokeWidth(shapeDefaults.strokeWidth),
        strokeStyle: normalizeStrokeStyle(shapeDefaults.strokeStyle),
      };
      onElementsChange([...scopeElements, nextStroke]);
      onSelectedIdsChange([]);
      setInteraction({
        type: 'drawing-stroke',
        pointerId: event.pointerId,
        elementId: strokeId,
        initialElements: structuredClone(scopeElements),
      });
      return;
    }

    if (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'line' || activeTool === 'arrow') {
      const nextId = generateElementId();
      const nextElement: BoardElement =
        activeTool === 'rectangle' || activeTool === 'ellipse'
          ? {
              id: nextId,
              type: activeTool,
              x: point.x,
              y: point.y,
              width: 0,
              height: 0,
              color: shapeDefaults.color ?? '#1f2937',
              opacity: clampOpacity(shapeDefaults.opacity),
              strokeWidth: clampStrokeWidth(shapeDefaults.strokeWidth),
              strokeStyle: normalizeStrokeStyle(shapeDefaults.strokeStyle),
              fillColor: normalizeFillColor(shapeDefaults.fillColor),
              ...(activeTool === 'rectangle' ? { cornerRadius: clampCornerRadius(shapeDefaults.cornerRadius) } : {}),
            }
          : {
              id: nextId,
              type: activeTool,
              x1: point.x,
              y1: point.y,
              x2: point.x,
              y2: point.y,
              color: shapeDefaults.color ?? '#1f2937',
              opacity: clampOpacity(shapeDefaults.opacity),
              strokeWidth: clampStrokeWidth(shapeDefaults.strokeWidth),
              strokeStyle: normalizeStrokeStyle(shapeDefaults.strokeStyle),
            };

      onElementsChange([...scopeElements, nextElement]);
      onSelectedIdsChange([nextId]);
      setInteraction({
        type: 'drawing-shape',
        pointerId: event.pointerId,
        elementId: nextId,
        origin: point,
        initialElements: structuredClone(scopeElements),
      });
      return;
    }

    if (activeTool === 'text') {
      const nextId = generateElementId();
      const nextText: BoardElement = {
        id: nextId,
        type: 'text',
        x: point.x,
        y: point.y,
        width: 220,
        height: 72,
        text: 'Text',
        ...textDefaults,
      };

      const nextElements = [...scopeElements, nextText];
      onCommitElementsChange(scopeElements, nextElements);
      onSelectedIdsChange([nextId]);
      onTextEditorChange({ elementId: nextId, value: 'Text' });
      return;
    }

    const linearHandle = getLinearResizeHandle(point);
    if (linearHandle && selectedSingleElement) {
      const bounds = getElementBounds(selectedSingleElement);
      setInteraction({
        type: 'resizing',
        pointerId: event.pointerId,
        elementId: selectedSingleElement.id,
        handle: linearHandle,
        snapshot: selectedSingleElement,
        initialElements: structuredClone(elements),
        selectionBounds: bounds,
        selectionCenter: { x: bounds.cx, y: bounds.cy },
        selectionRotation: normalizeRotation(selectedSingleElement.rotation ?? 0),
        targetIds: [selectedSingleElement.id],
      });
      return;
    }

    const boxHandle = getBoxResizeHandle(point);
    if (boxHandle) {
      if (selectedSingleElement) {
        const bounds = selectionOverlayBox
          ? {
              x: selectionOverlayBox.x,
              y: selectionOverlayBox.y,
              width: selectionOverlayBox.width,
              height: selectionOverlayBox.height,
            }
          : getElementBounds(selectedSingleElement);
        const center = selectionOverlayBox
          ? { x: selectionOverlayBox.centerX, y: selectionOverlayBox.centerY }
          : getElementCenter(selectedSingleElement);

        setInteraction({
          type: 'resizing',
          pointerId: event.pointerId,
          elementId: selectedSingleElement.id,
          handle: boxHandle,
          snapshot: selectedSingleElement,
          initialElements: structuredClone(elements),
          selectionBounds: bounds,
          selectionCenter: center,
          selectionRotation: selectionOverlayBox?.rotation ?? normalizeRotation(selectedSingleElement.rotation ?? 0),
          targetIds: [selectedSingleElement.id],
        });
        return;
      }

      if (selectedBounds && selectedIds.length > 1) {
        const snapshot = Object.fromEntries(
          elements
            .filter((element) => selectedIds.includes(element.id))
            .map((element) => [element.id, structuredClone(element)])
        ) as ElementSnapshot;
        const bounds = selectionOverlayBox
          ? {
              x: selectionOverlayBox.x,
              y: selectionOverlayBox.y,
              width: selectionOverlayBox.width,
              height: selectionOverlayBox.height,
            }
          : structuredClone(selectedBounds);
        const center = selectionOverlayBox
          ? { x: selectionOverlayBox.centerX, y: selectionOverlayBox.centerY }
          : { x: selectedBounds.x + selectedBounds.width / 2, y: selectedBounds.y + selectedBounds.height / 2 };

        setInteraction({
          type: 'resizing',
          pointerId: event.pointerId,
          elementId: null,
          handle: boxHandle,
          snapshot,
          initialElements: structuredClone(elements),
          selectionBounds: bounds,
          selectionCenter: center,
          selectionRotation: selectionOverlayBox?.rotation ?? 0,
          targetIds: [...selectedIds],
        });
        return;
      }
    }

    if (allowBoundsDrag && selectedBounds && selectedIds.length > 0 && isPointInBounds(point, selectedBounds)) {
      const snapshot = Object.fromEntries(
        elements
          .filter((element) => selectedIds.includes(element.id))
          .map((element) => [element.id, structuredClone(element)])
      ) as ElementSnapshot;

      setInteraction({
        type: 'moving',
        pointerId: event.pointerId,
        startPoint: point,
        snapshot,
        initialElements: structuredClone(elements),
      });
      return;
    }

    if (hitElement) {
      const nextSelection = selectedIds.includes(hitElement.id) ? selectedIds : [hitElement.id];
      onSelectedIdsChange(nextSelection);

      const snapshot = Object.fromEntries(
        elements
          .filter((element) => nextSelection.includes(element.id))
          .map((element) => [element.id, structuredClone(element)])
      ) as ElementSnapshot;

      setInteraction({
        type: 'moving',
        pointerId: event.pointerId,
        startPoint: point,
        snapshot,
        initialElements: structuredClone(elements),
      });
      return;
    }

    onSelectedIdsChange([]);
    setInteraction({
      type: 'selecting',
      pointerId: event.pointerId,
      startPoint: point,
      currentPoint: point,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = getWorldPoint(event);
    onRecordingPointerChange({ point, pressed: interaction?.pointerId === event.pointerId, visible: true });

    if (cropInteraction && cropInteraction.pointerId === event.pointerId && imageCrop) {
      onImageCropChange({
        ...imageCrop,
        rect: getResizedCropRect(cropInteraction.initialRect, cropInteraction.imageBounds, cropInteraction.handle, point),
      });
      return;
    }

    if (!interaction || interaction.pointerId !== event.pointerId) {
      setHoverCursor(getHoverCursorForPoint(point));
      return;
    }

    switch (interaction.type) {
      case 'drawing-stroke':
        onElementsChange((current) =>
          current.map((element) =>
            element.id === interaction.elementId && element.type === 'draw'
              ? { ...element, points: [...element.points, point] }
              : element
          )
        );
        break;
      case 'drawing-shape':
        onElementsChange((current) =>
          current.map((element) => {
            if (element.id !== interaction.elementId) {
              return element;
            }

            if (element.type === 'rectangle' || element.type === 'ellipse') {
              if (event.shiftKey) {
                const constrained = getConstrainedBoxFromOrigin(interaction.origin, point);
                return {
                  ...element,
                  width: constrained.width,
                  height: constrained.height,
                };
              }

              return {
                ...element,
                width: point.x - interaction.origin.x,
                height: point.y - interaction.origin.y,
              };
            }

            if (element.type === 'line' || element.type === 'arrow') {
              const nextPoint = event.shiftKey ? getConstrainedLinearPoint(interaction.origin, point) : point;
              return {
                ...element,
                x2: nextPoint.x,
                y2: nextPoint.y,
              };
            }

            return element;
          })
        );
        break;
      case 'moving': {
        const dx = point.x - interaction.startPoint.x;
        const dy = point.y - interaction.startPoint.y;
        const targetIds = Object.keys(interaction.snapshot);
        const nextElements = elements.map((element) => {
          const snapshot = interaction.snapshot[element.id];
          return snapshot ? offsetElement(snapshot, dx, dy) : element;
        });
        onElementsChange(nextElements);
        updateProvisionalOwners(nextElements, targetIds);
        break;
      }
      case 'rotating': {
        const angle = getAngleDegrees(interaction.center, point);
        const rawDelta = angle - interaction.startAngle;
        const delta = event.shiftKey ? Math.round(rawDelta / 15) * 15 : rawDelta;
        const snapshotMap = interaction.snapshot as ElementSnapshot;
        const nextElements = elements.map((element) => {
          const snapshot = snapshotMap[element.id];
          return snapshot ? rotateElementSnapshotAround(snapshot, interaction.center, delta) : element;
        });

        onElementsChange(nextElements);
        updateProvisionalOwners(nextElements, interaction.targetIds);
        setInteraction({ ...interaction, currentRotation: normalizeRotation(interaction.startRotation + delta) });
        break;
      }
      case 'selecting':
        setInteraction({ ...interaction, currentPoint: point });
        break;
      case 'panning':
        onViewportChange({
          x: interaction.startViewport.x + (event.clientX - interaction.startClient.x),
          y: interaction.startViewport.y + (event.clientY - interaction.startClient.y),
          zoom: interaction.startViewport.zoom,
        });
        break;
      case 'resizing': {
        if (!interaction.selectionBounds || !Array.isArray(interaction.targetIds) || interaction.targetIds.length === 0) {
          break;
        }

        if (interaction.handle === 'start' || interaction.handle === 'end') {
          const nextElements = elements.map((element) => {
            if (element.id !== interaction.elementId) {
              return element;
            }

            return resizeLinearElementFromVisualPoint(interaction.snapshot as BoardElement, interaction.handle, point, event.shiftKey);
          });
          onElementsChange(nextElements);
          updateProvisionalOwners(nextElements, interaction.targetIds);
          break;
        }

        if (!interaction.selectionCenter || interaction.selectionRotation === undefined) {
          break;
        }

        const preserveAspectRatio =
          event.shiftKey &&
          (interaction.targetIds.length > 1 ||
            ((interaction.snapshot as BoardElement).type === 'rectangle' ||
              (interaction.snapshot as BoardElement).type === 'ellipse' ||
              (interaction.snapshot as BoardElement).type === 'image' ||
              (interaction.snapshot as BoardElement).type === 'draw'));
        const nextBounds = getOrientedResizedBounds(
          interaction.selectionBounds,
          interaction.selectionCenter,
          interaction.selectionRotation,
          interaction.handle,
          point,
          preserveAspectRatio
        );
        const snapshotMap = interaction.targetIds.length > 1 ? (interaction.snapshot as ElementSnapshot) : null;
        const nextElements = elements.map((element) => {
          const snapshot = snapshotMap ? snapshotMap[element.id] : element.id === interaction.elementId ? (interaction.snapshot as BoardElement) : null;
          return snapshot
            ? resizeElementWithSelectionMapping(
                snapshot,
                interaction.selectionBounds!,
                nextBounds,
                interaction.selectionCenter!,
                interaction.selectionRotation!
              )
            : element;
        });

        onElementsChange(nextElements);
        updateProvisionalOwners(nextElements, interaction.targetIds);
        setInteraction({ ...interaction, currentSelectionBounds: nextBounds });
        break;
      }
      case 'erasing':
        eraseAtPoint(point);
        break;
      default:
        break;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropInteraction && cropInteraction.pointerId === event.pointerId) {
      setCropInteraction(null);
      return;
    }

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.type === 'drawing-stroke') {
      onCommitElementsChange(interaction.initialElements, elements);
    }

    if (interaction.type === 'drawing-shape') {
      const nextElements = elements.map((element) =>
        element.id === interaction.elementId ? normalizeBoxElement(element) : element
      );
      onElementsChange(nextElements);
      onCommitElementsChange(interaction.initialElements, nextElements);
      onActiveToolChange('select');
    }

    if (interaction.type === 'moving' || interaction.type === 'resizing' || interaction.type === 'rotating') {
      if (interaction.type === 'rotating' && interaction.targetIds.length > 1) {
        setLockedGroupSelectionBox({
          ...interaction.selectionBounds,
          centerX: interaction.center.x,
          centerY: interaction.center.y,
          rotation: interaction.currentRotation,
          idsKey: interaction.targetIds.join('|'),
        });
      } else if (interaction.type === 'resizing' && interaction.targetIds.length > 1 && interaction.selectionCenter && interaction.selectionRotation !== undefined) {
        setLockedGroupSelectionBox({
          ...createSelectionOverlayBoxFromLocalBounds(
            interaction.currentSelectionBounds ?? interaction.selectionBounds!,
            interaction.selectionCenter,
            interaction.selectionRotation
          ),
          idsKey: interaction.targetIds.join('|'),
        });
      } else if (interaction.type === 'moving') {
        setLockedGroupSelectionBox(null);
      }

      const ownerMap = provisionalOwnersRef.current;
      if (Object.keys(ownerMap).length > 0) {
        onCommitElementOwnerMigration(interaction.initialElements, elements, ownerMap);
      } else {
        onCommitElementsChange(interaction.initialElements, elements);
      }
    }

    if (interaction.type === 'selecting') {
      const nextSelection = selectionPreviewElements.map((element) => element.id);
      onSelectedIdsChange(nextSelection);
    }

    setInteraction(null);
    clearProvisionalOwners();
    onRecordingPointerChange({ point: getWorldPoint(event), pressed: false, visible: true });
  };

  const handleStageDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = getWorldPoint(event);
    if (imageCrop) {
      return;
    }

    const targetScopeId = getSlideAtPoint(point)?.id ?? null;

    if (targetScopeId !== activeSlideId) {
      onActiveSlideChange(targetScopeId);
      return;
    }

    const hitElement = getTopElementAtPoint(point);
    if (hitElement?.type !== 'text') {
      return;
    }

    onSelectedIdsChange([hitElement.id]);
    onTextEditorChange({ elementId: hitElement.id, value: hitElement.text });
  };

  const stageCursorStyle =
    interaction?.type === 'panning'
      ? { cursor: 'grabbing' }
      : activeTool === 'select' && hoverCursor
        ? { cursor: hoverCursor }
        : undefined;
  const canvasBackgroundColor = normalizeCanvasBackgroundColor(recordingVisualSettings.canvasBackgroundColor);
  const canvasBackgroundPattern = recordingVisualSettings.canvasBackgroundPattern ?? 'none';
  const canvasBackgroundSpacing = clampCanvasBackgroundSpacing(recordingVisualSettings.canvasBackgroundSpacing);
  const effectiveCanvasBackgroundSpacing = Math.max(2, canvasBackgroundSpacing * viewport.zoom);
  const canvasPatternColor = getCanvasPatternColor(canvasBackgroundColor);
  const canvasDotPatternColor = getCanvasDotPatternColor(canvasBackgroundColor);
  const isDarkCanvasBackgroundColor = isDarkCanvasBackground(canvasBackgroundColor);
  const slideBackgroundPatternIdPrefix = `board-canvas-background-${canvasBackgroundPattern}-${canvasBackgroundColor.replace(/[^a-z0-9]/gi, '')}-${Math.round(canvasBackgroundSpacing)}`;
  const getSlideBackgroundPatternId = (key: string) => `${slideBackgroundPatternIdPrefix}-${key.replace(/[^a-z0-9]/gi, '') || 'slide'}`;
  const getSlideFrameFill = (patternId: string) => canvasBackgroundPattern === 'none' ? canvasBackgroundColor : `url(#${patternId})`;
  const getSlideFrameStyle = (patternId: string, active = false) => ({
    fill: getSlideFrameFill(patternId),
    stroke: active ? 'rgba(109, 93, 252, 0.98)' : isDarkCanvasBackgroundColor ? 'rgba(255, 255, 255, 0.38)' : 'rgba(15, 23, 42, 0.26)',
    filter: 'none',
  }) as React.CSSProperties;
  const slideTitleStyle = { fill: isDarkCanvasBackgroundColor ? 'rgba(241, 245, 249, 0.76)' : 'rgba(51, 65, 85, 0.66)' } as React.CSSProperties;
  const activeSlideTitleStyle = { fill: isDarkCanvasBackgroundColor ? 'rgba(255, 255, 255, 0.94)' : 'rgba(31, 41, 55, 0.9)', fontWeight: 800 } as React.CSSProperties;
  const stageStyle = {
    ...(stageCursorStyle ?? {}),
    ...getCanvasBackgroundCssWithSpacing(recordingVisualSettings, effectiveCanvasBackgroundSpacing),
    '--board-grid-size': `${24 * viewport.zoom}px`,
  } as React.CSSProperties;

  return (
    <div
      ref={surfaceRef}
      className={`board-stage board-stage--${activeTool}`}
      style={stageStyle}
      onDoubleClick={handleStageDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setHoverCursor(null);
        onRecordingPointerChange(null);
      }}
    >
      <svg className="board-stage__svg">
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          <defs>
            {slides.map((slide) => (
              <clipPath key={`${slide.id}-clip`} id={getSlideClipId(slide.id)}>
                <rect {...slide.frame} />
              </clipPath>
            ))}
            {canvasBackgroundPattern !== 'none' ? (
              <>
                {slides.map((slide) => renderCanvasBackgroundPattern(getSlideBackgroundPatternId(slide.id), canvasBackgroundPattern, canvasBackgroundColor, canvasPatternColor, canvasDotPatternColor, canvasBackgroundSpacing, viewport.zoom, slide.frame.x, slide.frame.y))}
                {recordingPresentationStrip?.slides.map(({ key, displayFrame }) => renderCanvasBackgroundPattern(getSlideBackgroundPatternId(`recording-${key}`), canvasBackgroundPattern, canvasBackgroundColor, canvasPatternColor, canvasDotPatternColor, canvasBackgroundSpacing, viewport.zoom, displayFrame.x, displayFrame.y))}
              </>
            ) : null}
            <mask id="freeboard-slide-mask" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">
              <rect x="-100000" y="-100000" width="200000" height="200000" fill="white" />
              {slides.map((slide) => (
                <rect key={`${slide.id}-mask`} {...slide.frame} fill="black" />
              ))}
            </mask>
            {recordingOverlayFrame ? (
              <mask id="recording-overlay-mask" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">
                <rect x="-100000" y="-100000" width="200000" height="200000" fill="white" />
                <rect {...recordingOverlayFrame} fill="black" />
              </mask>
            ) : null}
            {recordingPresentationStrip?.slides.map(({ clipId, displayFrame }) => (
              <clipPath key={clipId} id={clipId}>
                <rect {...displayFrame} />
              </clipPath>
            ))}
          </defs>

          {recordingPresentationStrip
            ? recordingPresentationStrip.slides.map(({ key, displayFrame }) => (
                <rect
                  key={`${key}-frame`}
                  className="board-slide-frame"
                  {...displayFrame}
                  style={getSlideFrameStyle(getSlideBackgroundPatternId(`recording-${key}`))}
                />
              ))
            : slides.map((slide) => (
                <g key={`${slide.id}-frame-shell`}>
                  {!recordingOverlayFrame ? (
                    <text
                      className="board-slide-title"
                      style={slide.id === activeSlideId ? activeSlideTitleStyle : slideTitleStyle}
                      x={slide.frame.x + slide.frame.width / 2}
                      y={slide.frame.y - 18}
                      textAnchor="middle"
                    >
                      {slide.name}
                    </text>
                  ) : null}
                  <rect
                    className={`board-slide-frame${slide.id === activeSlideId ? ' board-slide-frame--active' : ''}`}
                    {...slide.frame}
                    style={getSlideFrameStyle(getSlideBackgroundPatternId(slide.id), slide.id === activeSlideId)}
                  />
                </g>
              ))}

          {recordingPresentationStrip
            ? recordingPresentationStrip.slides.map(({ key, snapshot, displayFrame, clipId }) => (
                <g key={`${key}-elements`} clipPath={`url(#${clipId})`}>
                  <g
                    transform={`translate(${displayFrame.x} ${displayFrame.y}) scale(${displayFrame.width / Math.max(snapshot.frame.width, 1)} ${displayFrame.height / Math.max(snapshot.frame.height, 1)}) translate(${-snapshot.frame.x} ${-snapshot.frame.y})`}
                  >
                    {snapshot.elements.map((element) =>
                      element.id === activeSlideDrawingElement?.id || (editingElement?.type === 'text' && element.id === editingElement.id)
                        ? null
                        : renderElement(element)
                    )}
                  </g>
                </g>
              ))
            : stagedCollections.slides.map((slide) => (
                <g key={`${slide.id}-elements`} clipPath={`url(#${getSlideClipId(slide.id)})`}>
                  {slide.elements.map((element) =>
                    element.id === activeSlideDrawingElement?.id || (editingElement?.type === 'text' && element.id === editingElement.id)
                      ? null
                      : renderElement(element)
                  )}
                </g>
              ))}

          {activeSlideDrawingElement ? renderElement(activeSlideDrawingElement) : null}

          <g mask="url(#freeboard-slide-mask)">
            {stagedCollections.freeboardElements.map((element) =>
              editingElement?.type === 'text' && element.id === editingElement.id ? null : renderElement(element)
            )}
          </g>

          {recordingOverlayFrame ? (
            <rect
              className="board-recording-dim"
              x="-100000"
              y="-100000"
              width="200000"
              height="200000"
              mask="url(#recording-overlay-mask)"
            />
          ) : null}

          {recordingOverlayFrame ? (
            <rect
              className={`board-recording-frame board-recording-frame--${recordingOverlayStatus}`}
              {...getRecordingOutlineFrame(recordingOverlayFrame)}
            />
          ) : null}

          {recordingPresentationStrip?.slides.map(({ key, name, displayFrame }) => (
            <text
              key={`${key}-title`}
              className="board-slide-title"
              style={slideTitleStyle}
              x={displayFrame.x + displayFrame.width / 2}
              y={displayFrame.y + displayFrame.height + 12}
              textAnchor="middle"
              dominantBaseline="hanging"
            >
              {name}
            </text>
          ))}

          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              className="board-stage__selection-area"
            />
          )}

          {selectionPreviewElements.map((element) => renderPreviewOverlay(element))}


          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              className="board-stage__selection-box"
            />
          )}

          {!isMarqueeSelecting && editingBounds ? (
            <rect
              x={editingBounds.x}
              y={editingBounds.y}
              width={editingBounds.width}
              height={editingBounds.height}
              className="board-stage__editing-bounds"
            />
          ) : null}

          {!imageCrop && shouldRenderSelectionBox && selectionOverlayBox
            ? renderSelectionOverlay(selectionOverlayBox, selectionOverlayClassName, true, true)
            : selectionOverlayBox && !editingElement && !isMarqueeSelecting
              ? selectedSingleElementIsLinear && selectedSingleElement
                ? renderLinearRotationHandle(selectedSingleElement)
                : renderSelectionOverlay(selectionOverlayBox, selectionOverlayClassName, false, true)
              : null}


          {!imageCrop && !editingElement && !isMarqueeSelecting && selectedSingleElement && selectionOverlayBox
            ? shouldUseSelectionBoxResizeHandles(selectedSingleElement)
              ? renderSelectionResizeHandles(
                  selectionOverlayBox,
                  selectedSingleElement.type === 'image'
                    ? 'board-stage__handle board-stage__handle--image'
                    : 'board-stage__handle'
                )
              : renderHandles(selectedSingleElement)
            : null}

          {!imageCrop && !editingElement && !isMarqueeSelecting && !selectedSingleElement && selectionOverlayBox && selectedIds.length > 1
            ? renderSelectionResizeHandles(selectionOverlayBox, 'board-stage__handle')
            : null}

          {imageCrop && cropImageBounds ? renderImageCropOverlay(imageCrop.rect, cropImageBounds, handleCropHandlePointerDown) : null}
        </g>
      </svg>

      {imageCrop && cropControlsStyle ? (
        <div className="board-image-crop-actions" style={cropControlsStyle} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="board-image-crop-action board-image-crop-action--confirm" onClick={onConfirmImageCrop} aria-label="确认裁剪">
            ✓
          </button>
          <button type="button" className="board-image-crop-action board-image-crop-action--cancel" onClick={onCancelImageCrop} aria-label="取消裁剪">
            ×
          </button>
        </div>
      ) : null}

      {cameraSettings.enabled && cameraOverlayStyle ? (
        <div
          className={`board-camera-overlay board-camera-overlay--${cameraSettings.shape}${
            isCameraDragging ? ' board-camera-overlay--dragging' : ''
          }`}
          style={cameraOverlayStyle}
          onPointerDown={handleCameraPointerDown}
          onPointerMove={handleCameraPointerMove}
          onPointerUp={handleCameraPointerUp}
          onPointerCancel={handleCameraPointerUp}
        >
          {cameraStream ? (
            <video ref={cameraVideoRef} className="board-camera-overlay__video" muted playsInline autoPlay />
          ) : (
            <div className="board-camera-overlay__placeholder">Camera</div>
          )}
        </div>
      ) : null}

      {editingElement?.type === 'text' && (
        <textarea
          ref={textEditorRef}
          className="board-text-editor"
          value={textEditor?.value ?? ''}
          autoFocus
          style={{
            left: `${editingElement.x * viewport.zoom + viewport.x}px`,
            top: `${editingElement.y * viewport.zoom + viewport.y}px`,
            width: `${editingElement.width}px`,
            height: `${activeEditorHeight ?? editingElement.height}px`,
            transform: `scale(${viewport.zoom})`,
            transformOrigin: 'top left',
            fontFamily: editingElement.fontFamily,
            fontSize: `${editingElement.fontSize}px`,
            color: editingElement.color,
          }}
          onChange={(event) =>
            onTextEditorChange({
              elementId: editingElement.id,
              value: event.target.value,
            })
          }
          onBlur={(event) => commitTextEdit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              commitTextEdit(event.currentTarget.value);
              return;
            }

            if (event.key === 'Enter' && event.shiftKey) {
              event.preventDefault();
              commitTextEdit(event.currentTarget.value);
              return;
            }

            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commitTextEdit(event.currentTarget.value);
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}



function getVisibleWorldFrame(surface: HTMLDivElement | null, viewport: ViewportState): SlideFrame {
  const width = surface?.clientWidth ?? window.innerWidth;
  const height = surface?.clientHeight ?? window.innerHeight;

  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: width / viewport.zoom,
    height: height / viewport.zoom,
  };
}

function getRecordingPresentationStrip(
  frame: SlideFrame,
  slides: Slide[],
  activeSlideId: string | null,
  transition: RecordingSlideTransition | null,
  now: number
) {
  const step = getRecordingPresentationStep(frame.width);

  if (transition) {
    const visualCenterIndex = getRecordingVisualCenterIndex(transition, now);
    return {
      slides: transition.snapshots.map((snapshot, index) => {
        const absoluteIndex = transition.firstIndex + index;
        return {
          key: `recording-slide-${Math.round(transition.startTime)}-${absoluteIndex}`,
          snapshot,
          name: snapshot.name?.trim() || `Slide ${absoluteIndex + 1}`,
          displayFrame: getRecordingPresentationDisplayFrame(frame, absoluteIndex, visualCenterIndex, step),
          clipId: getRecordingPresentationClipId(transition, absoluteIndex),
          isPrimary: absoluteIndex === transition.toIndex,
        };
      }),
    };
  }

  const activeIndex = activeSlideId ? slides.findIndex((slide) => slide.id === activeSlideId) : -1;
  if (activeIndex < 0) {
    return null;
  }

  const firstIndex = Math.max(0, activeIndex - 1);
  const lastIndex = Math.min(slides.length - 1, activeIndex + 1);

  return {
    slides: slides.slice(firstIndex, lastIndex + 1).map((slide, index) => {
      const absoluteIndex = firstIndex + index;
      return {
        key: `recording-slide-${slide.id}`,
        snapshot: {
          frame: slide.frame,
          elements: slide.elements,
          name: slide.name,
        },
        name: slide.name?.trim() || `Slide ${absoluteIndex + 1}`,
        displayFrame: getRecordingPresentationDisplayFrame(frame, absoluteIndex, activeIndex, step),
        clipId: `recording-presentation-${slide.id}`,
        isPrimary: absoluteIndex === activeIndex,
      };
    }),
  };
}

function getRecordingVisualCenterIndex(transition: RecordingSlideTransition, now: number) {
  const progress = getRecordingTransitionProgress(transition, now);
  const eased = easeRecordingTransition(progress);
  return transition.fromIndex + (transition.toIndex - transition.fromIndex) * eased;
}

function getRecordingPresentationDisplayFrame(
  frame: SlideFrame,
  slideIndex: number,
  visualCenterIndex: number,
  step: number
) {
  return {
    x: frame.x + (slideIndex - visualCenterIndex) * step,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

function getRecordingTransitionProgress(transition: RecordingSlideTransition, now: number) {
  return Math.min(1, Math.max(0, (now - transition.startTime) / Math.max(transition.duration, 1)));
}

function easeRecordingTransition(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getRecordingTransitionGap(width: number) {
  return width * 0.12;
}

function getRecordingPresentationStep(width: number) {
  return width + getRecordingTransitionGap(width);
}

function getRecordingPresentationClipId(transition: RecordingSlideTransition, index: number) {
  return `recording-slide-transition-${Math.round(transition.startTime)}-${index}`;
}

function getCameraWorldRect(settings: CameraSettings, frame: SlideFrame) {
  const size = Math.min(settings.size, Math.max(48, Math.min(frame.width, frame.height)));
  const availableX = Math.max(frame.width - size, 0);
  const availableY = Math.max(frame.height - size, 0);

  return {
    x: frame.x + clamp01(settings.position.x) * availableX,
    y: frame.y + clamp01(settings.position.y) * availableY,
    width: size,
    height: size,
    radius: settings.shape === 'circle' ? size / 2 : Math.min(size / 2, Math.max(8, size * 0.12)),
  };
}

function getRecordingOutlineFrame(frame: SlideFrame) {
  const offset = 0;
  return {
    x: frame.x - offset,
    y: frame.y - offset,
    width: frame.width + offset * 2,
    height: frame.height + offset * 2,
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampOpacity(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 1;
}

function clampStrokeWidth(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, value))
    : DEFAULT_STROKE_WIDTH;
}

function clampCornerRadius(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_CORNER_RADIUS, Math.max(MIN_CORNER_RADIUS, value))
    : DEFAULT_CORNER_RADIUS;
}

function clampCornerRadiusForSize(value: number | undefined, width: number, height: number) {
  return Math.min(clampCornerRadius(value), Math.max(0, Math.abs(width) / 2), Math.max(0, Math.abs(height) / 2));
}

function normalizeStrokeStyle(value: unknown) {
  return value === 'dashed' || value === 'dotted' || value === 'solid' ? value : DEFAULT_STROKE_STYLE;
}

function normalizeFillColor(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return DEFAULT_FILL_COLOR;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none' || normalized === 'transparent' ? DEFAULT_FILL_COLOR : value;
}

function distributeElementsByOwner(
  slides: Slide[],
  freeboardElements: BoardElement[],
  activeElements: BoardElement[],
  ownerMap: Record<string, string | null>
) {
  const migratingIds = new Set(Object.keys(ownerMap));

  if (migratingIds.size === 0) {
    return { slides, freeboardElements };
  }

  const migratingElements = new Map(
    activeElements.filter((element) => migratingIds.has(element.id)).map((element) => [element.id, element])
  );

  const nextSlides = slides.map((slide) => {
    const retainedElements = slide.elements
      .filter((element) => !migratingIds.has(element.id) || ownerMap[element.id] === slide.id)
      .map((element) => migratingElements.get(element.id) ?? element);
    const incomingElements = activeElements.filter(
      (element) =>
        migratingIds.has(element.id) &&
        ownerMap[element.id] === slide.id &&
        !slide.elements.some((slideElement) => slideElement.id === element.id)
    );

    return {
      ...slide,
      elements: [...retainedElements, ...incomingElements],
    };
  });

  const retainedFreeboardElements = freeboardElements
    .filter((element) => !migratingIds.has(element.id) || ownerMap[element.id] === null)
    .map((element) => migratingElements.get(element.id) ?? element);
  const incomingFreeboardElements = activeElements.filter(
    (element) =>
      migratingIds.has(element.id) &&
      ownerMap[element.id] === null &&
      !freeboardElements.some((freeboardElement) => freeboardElement.id === element.id)
  );

  return {
    slides: nextSlides,
    freeboardElements: [...retainedFreeboardElements, ...incomingFreeboardElements],
  };
}

function resolveElementOwner(element: BoardElement, slides: Slide[], currentOwner: string | null) {
  const overlaps = slides
    .map((slide) => ({
      slideId: slide.id,
      ratio: getBoundsOverlapRatio(getTransformedElementBounds(element), slide.frame),
    }))
    .sort((a, b) => b.ratio - a.ratio);
  const bestOverlap = overlaps[0] ?? null;

  if (!bestOverlap) {
    return null;
  }

  if (currentOwner === null) {
    return bestOverlap.ratio >= OWNER_ENTER_THRESHOLD ? bestOverlap.slideId : null;
  }

  const currentOverlap = overlaps.find((overlap) => overlap.slideId === currentOwner)?.ratio ?? 0;

  if (bestOverlap.slideId !== currentOwner && bestOverlap.ratio >= OWNER_ENTER_THRESHOLD) {
    return bestOverlap.slideId;
  }

  if (currentOverlap <= OWNER_EXIT_THRESHOLD) {
    return bestOverlap.ratio >= OWNER_ENTER_THRESHOLD ? bestOverlap.slideId : null;
  }

  return currentOwner;
}

function getBoundsOverlapRatio(bounds: ReturnType<typeof normalizeRect>, frame: SlideFrame) {
  const boundsArea = Math.max(bounds.width * bounds.height, 1);
  const boundsCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  if (bounds.width === 0 || bounds.height === 0) {
    return isPointInBounds(boundsCenter, frame) ? 1 : 0;
  }

  const left = Math.max(bounds.x, frame.x);
  const top = Math.max(bounds.y, frame.y);
  const right = Math.min(bounds.x + bounds.width, frame.x + frame.width);
  const bottom = Math.min(bounds.y + bounds.height, frame.y + frame.height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return ((right - left) * (bottom - top)) / boundsArea;
}

function getAngleDegrees(center: BoardPoint, point: BoardPoint) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function rotateElementSnapshotAround<T extends BoardElement>(element: T, center: BoardPoint, deltaDegrees: number): T {
  const elementCenter = getElementCenter(element);
  const nextCenter = rotatePointAround(elementCenter, center, deltaDegrees);
  const moved = moveElementCenterTo(element, nextCenter.x, nextCenter.y);

  return {
    ...moved,
    rotation: normalizeRotation((element.rotation ?? 0) + deltaDegrees),
  };
}


type LocalBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createSelectionOverlayBoxFromLocalBounds(bounds: LocalBounds, center: BoardPoint, rotation: number): SelectionOverlayBox {
  const localCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const worldCenter = rotatePointAround(localCenter, center, rotation);

  return {
    x: worldCenter.x - bounds.width / 2,
    y: worldCenter.y - bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
    centerX: worldCenter.x,
    centerY: worldCenter.y,
    rotation,
  };
}

function mapSelectionPoint(
  point: BoardPoint,
  sourceBounds: LocalBounds,
  targetBounds: LocalBounds,
  center: BoardPoint,
  rotation: number
) {
  const localPoint = rotatePointAround(point, center, -rotation);
  const normalizedX = sourceBounds.width === 0 ? 0.5 : (localPoint.x - sourceBounds.x) / sourceBounds.width;
  const normalizedY = sourceBounds.height === 0 ? 0.5 : (localPoint.y - sourceBounds.y) / sourceBounds.height;
  const mappedLocal = {
    x: targetBounds.x + normalizedX * targetBounds.width,
    y: targetBounds.y + normalizedY * targetBounds.height,
  };

  return rotatePointAround(mappedLocal, center, rotation);
}

function resizeElementWithSelectionMapping<T extends BoardElement>(
  element: T,
  sourceBounds: LocalBounds,
  targetBounds: LocalBounds,
  selectionCenter: BoardPoint,
  selectionRotation: number
): T {
  const elementCenter = getElementCenter(element);
  const nextElementCenter = mapSelectionPoint(elementCenter, sourceBounds, targetBounds, selectionCenter, selectionRotation);
  const mapRawPoint = (point: BoardPoint) =>
    inverseElementTransformPoint(
      mapSelectionPoint(transformElementPoint(point, elementCenter, element), sourceBounds, targetBounds, selectionCenter, selectionRotation),
      nextElementCenter,
      element
    );

  switch (element.type) {
    case 'draw':
      return {
        ...element,
        points: element.points.map((point) => mapRawPoint(point)),
      } as T;
    case 'line':
    case 'arrow': {
      const start = mapRawPoint({ x: element.x1, y: element.y1 });
      const end = mapRawPoint({ x: element.x2, y: element.y2 });
      return {
        ...element,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      } as T;
    }
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image': {
      const bounds = getElementBounds(element);
      const mappedCorners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
      ].map((point) => mapRawPoint(point));
      const next = boundsFromPoints(mappedCorners);

      return {
        ...element,
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      } as T;
    }
    default:
      return element;
  }
}

function resizeLinearElementFromVisualPoint(element: BoardElement, handle: DragHandle, point: BoardPoint, snapAngle: boolean) {
  if (element.type !== 'line' && element.type !== 'arrow') {
    return element;
  }

  const center = getElementCenter(element);
  const visualStart = transformElementPoint({ x: element.x1, y: element.y1 }, center, element);
  const visualEnd = transformElementPoint({ x: element.x2, y: element.y2 }, center, element);

  if (handle === 'start') {
    const nextStart = snapAngle ? getConstrainedLinearPoint(visualEnd, point) : point;
    return {
      ...element,
      x1: nextStart.x,
      y1: nextStart.y,
      x2: visualEnd.x,
      y2: visualEnd.y,
      rotation: 0,
      flipX: false,
      flipY: false,
    };
  }

  const nextEnd = snapAngle ? getConstrainedLinearPoint(visualStart, point) : point;
  return {
    ...element,
    x1: visualStart.x,
    y1: visualStart.y,
    x2: nextEnd.x,
    y2: nextEnd.y,
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

function getVisualLinearHandlePositions(element: LinearElement) {
  const center = getElementCenter(element);
  return [
    { key: 'start' as DragHandle, ...transformElementPoint({ x: element.x1, y: element.y1 }, center, element) },
    { key: 'end' as DragHandle, ...transformElementPoint({ x: element.x2, y: element.y2 }, center, element) },
  ];
}

function transformElementPoint(point: BoardPoint, center: BoardPoint, element: BoardElement) {
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;
  const scaled = {
    x: center.x + (point.x - center.x) * scaleX,
    y: center.y + (point.y - center.y) * scaleY,
  };

  return rotatePointAround(scaled, center, normalizeRotation(element.rotation ?? 0));
}

function inverseElementTransformPoint(point: BoardPoint, center: BoardPoint, element: BoardElement) {
  const unrotated = rotatePointAround(point, center, -normalizeRotation(element.rotation ?? 0));

  return {
    x: center.x + (unrotated.x - center.x) * (element.flipX ? -1 : 1),
    y: center.y + (unrotated.y - center.y) * (element.flipY ? -1 : 1),
  };
}

function boundsFromPoints(points: BoardPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return normalizeRect(left, top, right - left, bottom - top);
}
function getSlideClipId(slideId: string) {
  return `slide-clip-${slideId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
function renderElement(element: BoardElement) {
  return (
    <g key={element.id} transform={getElementSvgTransform(element)} opacity={getElementOpacity(element)}>
      {renderElementContent(element)}
    </g>
  );
}

function getElementSvgTransform(element: BoardElement) {
  if (!hasElementTransform(element)) {
    return undefined;
  }

  const center = getElementCenter(element);
  const rotation = normalizeRotation(element.rotation ?? 0);
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;
  return `translate(${center.x} ${center.y}) rotate(${rotation}) scale(${scaleX} ${scaleY}) translate(${-center.x} ${-center.y})`;
}

function renderElementContent(element: BoardElement) {
  switch (element.type) {
    case 'draw':
      return (
        <polyline
          key={element.id}
          className="board-element board-element--stroke"
          style={getStrokeElementSvgStyle(element)}
          points={element.points.map((point) => [point.x, point.y].join(',')).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      const radius = clampCornerRadiusForSize(element.cornerRadius, box.width, box.height);
      return <rect key={element.id} className="board-element board-element--shape" style={getShapeElementSvgStyle(element)} rx={radius} ry={radius} {...box} />;
    }
    case 'ellipse': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={element.id}
          className="board-element board-element--shape"
          style={getShapeElementSvgStyle(element)}
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          rx={box.width / 2}
          ry={box.height / 2}
        />
      );
    }
    case 'line':
      return (
        <line
          key={element.id}
          className="board-element board-element--line"
          style={getStrokeElementSvgStyle(element)}
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow': {
      const shaftEnd = getArrowShaftEnd(element);
      return (
        <g key={element.id}>
          <line
            className="board-element board-element--line board-element--arrow-shaft"
            style={getStrokeElementSvgStyle(element)}
            x1={element.x1}
            y1={element.y1}
            x2={shaftEnd?.x ?? element.x2}
            y2={shaftEnd?.y ?? element.y2}
          />
          {renderArrowHead(element, 'board-element--arrowhead', getElementColor(element))}
        </g>
      );
    }
    case 'text':
      return (
        <foreignObject key={element.id} x={element.x} y={element.y} width={element.width} height={element.height}>
          <div
            className="board-text-node"
            style={{
              fontFamily: element.fontFamily,
              fontSize: `${element.fontSize}px`,
              color: element.color,
            }}
          >
            {element.text || 'Text'}
          </div>
        </foreignObject>
      );
    case 'image': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <image
          key={element.id}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          href={element.src}
          preserveAspectRatio="none"
        />
      );
    }
    default:
      return null;
  }
}

function getElementColor(element: BoardElement) {
  return 'color' in element ? element.color : '#1f2937';
}

function getElementOpacity(element: BoardElement) {
  return clampOpacity(element.opacity);
}

function getElementStrokeWidth(element: BoardElement) {
  return clampStrokeWidth(element.strokeWidth);
}


function getShapeElementSvgStyle(element: BoardElement) {
  return {
    ...getStrokeElementSvgStyle(element),
    fill: normalizeFillColor(element.fillColor) ?? 'none',
  };
}
function getStrokeElementSvgStyle(element: BoardElement) {
  const strokeWidth = getElementStrokeWidth(element);
  const strokeStyle = normalizeStrokeStyle(element.strokeStyle);
  const dashArray = getStrokeDashArray(strokeStyle, strokeWidth);

  return {
    stroke: getElementColor(element),
    strokeWidth,
    ...(dashArray ? { strokeDasharray: dashArray } : {}),
    ...(strokeStyle === 'dotted' ? { strokeLinecap: 'round' as const } : {}),
  };
}

function getStrokeDashArray(style: string, strokeWidth: number) {
  if (style === 'dashed') {
    return `${strokeWidth * 4} ${strokeWidth * 3}`;
  }

  if (style === 'dotted') {
    return `0 ${strokeWidth * 2.5}`;
  }

  return undefined;
}

function renderPreviewOverlay(element: BoardElement) {
  const bounds = getTransformedElementBounds(element);

  return (
    <rect
      key={`${element.id}-preview`}
      className="board-element--preview-bounds"
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
    />
  );
}
function renderArrowHead(element: LinearElement, className: string, color?: string) {
  const geometry = getArrowHeadGeometry(element);

  if (!geometry) {
    return null;
  }

  return (
    <polygon
      className={className}
      points={geometry.points}
      style={color ? { fill: color, stroke: color, strokeWidth: Math.max(0.75, getElementStrokeWidth(element) * 0.35) } : undefined}
    />
  );
}

function getArrowShaftEnd(element: LinearElement) {
  return getArrowHeadGeometry(element)?.shaftEnd ?? null;
}

function getArrowHeadGeometry(element: LinearElement) {
  const dx = element.x2 - element.x1;
  const dy = element.y2 - element.y1;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return null;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY;
  const normalY = unitX;
  const strokeWidth = clampStrokeWidth(element.strokeWidth);
  const headLength = 10 + strokeWidth * 2.5;
  const headHalfWidth = 5 + strokeWidth * 1.25;
  const baseX = element.x2 - unitX * headLength;
  const baseY = element.y2 - unitY * headLength;
  const leftX = baseX + normalX * headHalfWidth;
  const leftY = baseY + normalY * headHalfWidth;
  const rightX = baseX - normalX * headHalfWidth;
  const rightY = baseY - normalY * headHalfWidth;

  return {
    points: `${element.x2},${element.y2} ${leftX},${leftY} ${rightX},${rightY}`,
    shaftEnd: { x: baseX, y: baseY },
  };
}
function shouldUseSelectionBoxResizeHandles(element: BoardElement) {
  return element.type !== 'line' && element.type !== 'arrow';
}

function getSelectionBoxResizeHandle(point: BoardPoint, box: SelectionOverlayBox): DragHandle | null {
  const center = { x: box.centerX, y: box.centerY };
  const localPoint = rotatePointAround(point, center, -box.rotation);
  const handles = getSelectionBoxHandlePositions(box);

  return handles.find((handle) => isPointInBounds(localPoint, normalizeRect(handle.x - 7, handle.y - 7, 14, 14)))?.key ?? null;
}

function isPointInsideSelectionOverlayBox(point: BoardPoint, box: SelectionOverlayBox) {
  const center = { x: box.centerX, y: box.centerY };
  const localPoint = rotatePointAround(point, center, -box.rotation);
  return isPointInBounds(localPoint, normalizeRect(box.x, box.y, box.width, box.height));
}

function getSelectionBoxHandlePositions(box: SelectionOverlayBox) {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  return [
    { key: 'nw' as DragHandle, x: box.x, y: box.y },
    { key: 'n' as DragHandle, x: centerX, y: box.y },
    { key: 'ne' as DragHandle, x: box.x + box.width, y: box.y },
    { key: 'e' as DragHandle, x: box.x + box.width, y: centerY },
    { key: 'se' as DragHandle, x: box.x + box.width, y: box.y + box.height },
    { key: 's' as DragHandle, x: centerX, y: box.y + box.height },
    { key: 'sw' as DragHandle, x: box.x, y: box.y + box.height },
    { key: 'w' as DragHandle, x: box.x, y: centerY },
  ];
}

function getOrientedResizedBounds(
  bounds: ReturnType<typeof normalizeRect>,
  center: BoardPoint,
  rotation: number,
  handle: DragHandle,
  point: BoardPoint,
  preserveAspectRatio: boolean
) {
  const localPoint = rotatePointAround(point, center, -rotation);

  if (preserveAspectRatio && isCornerResizeHandle(handle)) {
    return getAspectRatioConstrainedBounds(bounds, handle, localPoint);
  }

  return getResizedBounds(bounds, handle, localPoint);
}

function isCornerResizeHandle(handle: DragHandle) {
  return handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';
}

function getDragHandleCursor(handle: DragHandle) {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'start':
    case 'end':
      return 'ew-resize';
    default:
      return 'default';
  }
}

function getLinearEndpointCursor(element: LinearElement) {
  const [startHandle, endHandle] = getVisualLinearHandlePositions(element);
  const dx = endHandle.x - startHandle.x;
  const dy = endHandle.y - startHandle.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return 'ew-resize';
  }

  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;

  if (angle < 22.5 || angle >= 157.5) {
    return 'ew-resize';
  }

  if (angle < 67.5) {
    return 'nwse-resize';
  }

  if (angle < 112.5) {
    return 'ns-resize';
  }

  return 'nesw-resize';
}
function renderCanvasBackgroundPattern(
  id: string,
  pattern: RecordingVisualSettings['canvasBackgroundPattern'],
  backgroundColor: string,
  patternColor: string,
  dotPatternColor: string,
  spacing: number,
  zoom: number,
  originX: number,
  originY: number
) {
  const safeZoom = Math.max(zoom, 0.01);
  const oneScreenPixel = 1 / safeZoom;
  const dotRadius = 1.8 / safeZoom;
  if (pattern === 'ruled') {
    return (
      <pattern key={id} id={id} patternUnits="userSpaceOnUse" x={originX} y={originY} width={spacing} height={spacing}>
        <rect width={spacing} height={spacing} fill={backgroundColor} />
        <path d={`M 0 ${spacing - 0.5} H ${spacing}`} stroke={patternColor} strokeWidth={oneScreenPixel} />
      </pattern>
    );
  }

  if (pattern === 'grid') {
    return (
      <pattern key={id} id={id} patternUnits="userSpaceOnUse" x={originX} y={originY} width={spacing} height={spacing}>
        <rect width={spacing} height={spacing} fill={backgroundColor} />
        <path d={`M 0 ${spacing - 0.5} H ${spacing} M ${spacing - 0.5} 0 V ${spacing}`} stroke={patternColor} strokeWidth={oneScreenPixel} />
      </pattern>
    );
  }

  if (pattern === 'dots') {
    return (
      <pattern key={id} id={id} patternUnits="userSpaceOnUse" x={originX} y={originY} width={spacing} height={spacing}>
        <rect width={spacing} height={spacing} fill={backgroundColor} />
        <circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill={dotPatternColor} />
      </pattern>
    );
  }

  return null;
}
function renderImageCropOverlay(
  rect: { x: number; y: number; width: number; height: number },
  imageBounds: { x: number; y: number; width: number; height: number },
  onHandlePointerDown: (event: React.PointerEvent<SVGRectElement>, handle: CropHandle) => void
) {
  const crop = clampCropRect(rect, imageBounds);
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const imageRight = imageBounds.x + imageBounds.width;
  const imageBottom = imageBounds.y + imageBounds.height;
  const handles = getCropHandlePositions(crop);

  return (
    <g className="board-image-crop-overlay">
      <rect className="board-image-crop-dim" x={imageBounds.x} y={imageBounds.y} width={imageBounds.width} height={crop.y - imageBounds.y} />
      <rect className="board-image-crop-dim" x={imageBounds.x} y={bottom} width={imageBounds.width} height={imageBottom - bottom} />
      <rect className="board-image-crop-dim" x={imageBounds.x} y={crop.y} width={crop.x - imageBounds.x} height={crop.height} />
      <rect className="board-image-crop-dim" x={right} y={crop.y} width={imageRight - right} height={crop.height} />
      <rect className="board-image-crop-box" x={crop.x} y={crop.y} width={crop.width} height={crop.height} />
      {handles.map((handle) => (
        <rect
          key={handle.key}
          className="board-image-crop-handle"
          style={{ cursor: getDragHandleCursor(handle.key) }}
          x={handle.x - 6}
          y={handle.y - 6}
          width={12}
          height={12}
          rx={3}
          ry={3}
          onPointerDown={(event) => onHandlePointerDown(event, handle.key)}
        />
      ))}
    </g>
  );
}

function getCropHandlePositions(rect: { x: number; y: number; width: number; height: number }) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [
    { key: 'nw' as CropHandle, x: rect.x, y: rect.y },
    { key: 'n' as CropHandle, x: cx, y: rect.y },
    { key: 'ne' as CropHandle, x: right, y: rect.y },
    { key: 'e' as CropHandle, x: right, y: cy },
    { key: 'se' as CropHandle, x: right, y: bottom },
    { key: 's' as CropHandle, x: cx, y: bottom },
    { key: 'sw' as CropHandle, x: rect.x, y: bottom },
    { key: 'w' as CropHandle, x: rect.x, y: cy },
  ];
}

function getResizedCropRect(
  initialRect: { x: number; y: number; width: number; height: number },
  imageBounds: { x: number; y: number; width: number; height: number },
  handle: CropHandle,
  point: BoardPoint
) {
  const minSize = 12;
  let minX = initialRect.x;
  let minY = initialRect.y;
  let maxX = initialRect.x + initialRect.width;
  let maxY = initialRect.y + initialRect.height;
  const imageMinX = imageBounds.x;
  const imageMinY = imageBounds.y;
  const imageMaxX = imageBounds.x + imageBounds.width;
  const imageMaxY = imageBounds.y + imageBounds.height;

  if (handle.includes('w')) {
    minX = Math.min(maxX - minSize, Math.max(imageMinX, point.x));
  }
  if (handle.includes('e')) {
    maxX = Math.max(minX + minSize, Math.min(imageMaxX, point.x));
  }
  if (handle.includes('n')) {
    minY = Math.min(maxY - minSize, Math.max(imageMinY, point.y));
  }
  if (handle.includes('s')) {
    maxY = Math.max(minY + minSize, Math.min(imageMaxY, point.y));
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampCropRect(
  rect: { x: number; y: number; width: number; height: number },
  imageBounds: { x: number; y: number; width: number; height: number }
) {
  const minX = imageBounds.x;
  const minY = imageBounds.y;
  const maxX = imageBounds.x + imageBounds.width;
  const maxY = imageBounds.y + imageBounds.height;
  const x = Math.min(maxX, Math.max(minX, rect.x));
  const y = Math.min(maxY, Math.max(minY, rect.y));
  const right = Math.min(maxX, Math.max(x, rect.x + rect.width));
  const bottom = Math.min(maxY, Math.max(y, rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}
function renderSelectionResizeHandles(box: SelectionOverlayBox, className: string) {
  const transform = `translate(${box.centerX} ${box.centerY}) rotate(${box.rotation}) translate(${-box.centerX} ${-box.centerY})`;

  return (
    <g transform={transform}>
      {getSelectionBoxHandlePositions(box).map((handle) => (
        <rect
          key={`selection-${handle.key}`}
          className={className}
          style={{ cursor: getDragHandleCursor(handle.key) }}
          x={handle.x - 6}
          y={handle.y - 6}
          width={12}
          height={12}
          rx={3}
          ry={3}
        />
      ))}
    </g>
  );
}
function renderHandles(element: BoardElement) {
  if (element.type === 'line' || element.type === 'arrow') {
    return getVisualLinearHandlePositions(element).map((handle) => (
      <rect
        key={`${element.id}-${handle.key}`}
        className="board-stage__handle"
        style={{ cursor: getLinearEndpointCursor(element) }}
        x={handle.x - 6}
        y={handle.y - 6}
        width={12}
        height={12}
        rx={3}
        ry={3}
      />
    ));
  }

  const handleClassName =
    element.type === 'image' ? 'board-stage__handle board-stage__handle--image' : 'board-stage__handle';
  const bounds = getElementBounds(element);
  const box = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    centerX: bounds.cx,
    centerY: bounds.cy,
    rotation: 0,
  } satisfies SelectionOverlayBox;

  return renderSelectionResizeHandles(box, handleClassName);
}


function renderSelectionOverlay(
  box: SelectionOverlayBox,
  className: string,
  showRect: boolean,
  showRotationHandle: boolean
) {
  const transform = `translate(${box.centerX} ${box.centerY}) rotate(${box.rotation}) translate(${-box.centerX} ${-box.centerY})`;

  return (
    <g transform={transform}>
      {showRect ? <rect x={box.x} y={box.y} width={box.width} height={box.height} className={className} /> : null}
      {showRotationHandle ? renderRotationHandle(box) : null}
    </g>
  );
}
function renderRotationHandle(bounds: ReturnType<typeof normalizeRect>) {
  const centerX = bounds.x + bounds.width / 2;
  const handleY = bounds.y - ROTATE_HANDLE_OFFSET;

  return (
    <g className="board-stage__rotate-control">
      <line
        className="board-stage__rotate-stem"
        x1={centerX}
        y1={bounds.y}
        x2={centerX}
        y2={handleY + ROTATE_HANDLE_RADIUS}
      />
      <circle className="board-stage__rotate-handle" cx={centerX} cy={handleY} r={ROTATE_HANDLE_RADIUS} />
      {renderRotationIcon(centerX, handleY)}
    </g>
  );
}

function renderLinearRotationHandle(element: BoardElement) {
  if (element.type !== 'line' && element.type !== 'arrow') {
    return null;
  }

  const geometry = getLinearRotationHandleGeometry(element);

  return (
    <g className="board-stage__rotate-control">
      <line
        className="board-stage__rotate-stem"
        x1={geometry.mid.x}
        y1={geometry.mid.y}
        x2={geometry.stemEnd.x}
        y2={geometry.stemEnd.y}
      />
      <circle className="board-stage__rotate-handle" cx={geometry.handle.x} cy={geometry.handle.y} r={ROTATE_HANDLE_RADIUS} />
      {renderRotationIcon(geometry.handle.x, geometry.handle.y)}
    </g>
  );
}

function getLinearRotationHandleGeometry(element: LinearElement) {
  const [startHandle, endHandle] = getVisualLinearHandlePositions(element);
  const start = { x: startHandle.x, y: startHandle.y };
  const end = { x: endHandle.x, y: endHandle.y };
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const normal =
    length < 0.001
      ? { x: 0, y: -1 }
      : {
          x: -dy / length,
          y: dx / length,
        };
  const handle = {
    x: mid.x + normal.x * ROTATE_HANDLE_OFFSET,
    y: mid.y + normal.y * ROTATE_HANDLE_OFFSET,
  };

  return {
    mid,
    handle,
    stemEnd: {
      x: handle.x - normal.x * ROTATE_HANDLE_RADIUS,
      y: handle.y - normal.y * ROTATE_HANDLE_RADIUS,
    },
  };
}

function renderRotationIcon(centerX: number, centerY: number) {
  return (
    <path
      className="board-stage__rotate-icon"
      d={`M ${centerX - 3.5} ${centerY - 2.5} A 5 5 0 1 1 ${centerX + 3.8} ${centerY + 4.2} M ${centerX + 3.8} ${centerY + 4.2} L ${centerX + 4.8} ${centerY + 0.2} M ${centerX + 3.8} ${centerY + 4.2} L ${centerX - 0.2} ${centerY + 3.2}`}
    />
  );
}

export default WhiteboardStage;



































