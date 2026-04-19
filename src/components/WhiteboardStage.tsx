import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CameraSettings } from '../cameraTypes';
import { getCameraPositionFromRect } from '../recordingLayout';
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
  generateElementId,
  getConstrainedBoxFromOrigin,
  getConstrainedLinearPoint,
  getElementBounds,
  getAspectRatioConstrainedBounds,
  getLinearHandlePositions,
  getResizedBounds,
  getSelectionHandlePositions,
  hitTestElement,
  isPointInBounds,
  normalizeBoxElement,
  normalizeRect,
  offsetElement,
  rectContainsBounds,
  resizeBoxElement,
  resizeLinearElement,
  scaleElementToBounds,
} from '../whiteboard/utils';

type WhiteboardStageProps = {
  activeTool: ToolType;
  elements: BoardElement[];
  slides: Slide[];
  freeboardElements: BoardElement[];
  activeSlideId: string | null;
  recordingFrame: SlideFrame | null;
  recordingOverlayStatus: 'idle' | 'preparing' | 'recording' | 'paused';
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

type ElementSnapshot = Record<string, BoardElement>;
const OWNER_ENTER_THRESHOLD = 2 / 3;
const OWNER_EXIT_THRESHOLD = 1 / 3;

function WhiteboardStage({
  activeTool,
  elements,
  slides,
  freeboardElements,
  activeSlideId,
  recordingFrame,
  recordingOverlayStatus,
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
  const [isCameraDragging, setIsCameraDragging] = useState(false);
  const [provisionalOwners, setProvisionalOwners] = useState<Record<string, string | null>>({});
  const provisionalOwnersRef = useRef<Record<string, string | null>>({});

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

  const selectedElementUsesCustomSelection =
    selectedSingleElement &&
    (selectedSingleElement.type === 'line' ||
      selectedSingleElement.type === 'arrow' ||
      selectedSingleElement.type === 'rectangle' ||
      selectedSingleElement.type === 'ellipse');

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
  const isTransformingSelection =
    interaction?.type === 'moving' ||
    interaction?.type === 'resizing' ||
    interaction?.type === 'drawing-shape' ||
    interaction?.type === 'drawing-stroke';

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

    return elements.filter((element) => rectContainsBounds(selectionBox, getElementBounds(element)));
  }, [elements, selectionBox]);

  const stagedCollections = useMemo(
    () => distributeElementsByOwner(slides, freeboardElements, elements, provisionalOwners),
    [elements, freeboardElements, provisionalOwners, slides]
  );

  const multiSelectionHighlightElements = useMemo(() => {
    if (isMarqueeSelecting || isTransformingSelection || selectedIds.length <= 1) {
      return [];
    }

    const selectedSet = new Set(selectedIds);
    return elements.filter((element) => selectedSet.has(element.id));
  }, [elements, isMarqueeSelecting, isTransformingSelection, selectedIds]);

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
  const recordingOverlayFrame = recordingOverlayStatus === 'idle' ? null : activeSlide?.frame ?? recordingFrame;
  const cameraFrame = activeSlide?.frame ?? recordingFrame ?? getVisibleWorldFrame(surfaceRef.current, viewport);
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
      const closedShapeMode =
        element.type === 'rectangle' || element.type === 'ellipse'
          ? selectedIds.includes(element.id)
            ? 'fill'
            : 'stroke'
          : undefined;

      if (hitTestElement(element, point, { closedShapeMode })) {
        return element;
      }
    }

    return null;
  };

  const getResizeCursor = (handle: DragHandle) => {
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'start':
      case 'end':
        return 'move';
      default:
        return 'default';
    }
  };

  const getHoverCursorForPoint = (point: BoardPoint) => {
    if (activeTool !== 'select' || editingElement) {
      return null;
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

    const hitElement = getTopElementAtPoint(point);
    return hitElement ? 'move' : null;
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
    if (selectedSingleElement) {
      if (selectedSingleElement.type === 'line' || selectedSingleElement.type === 'arrow') {
        return null;
      }

      const handles = getSelectionHandlePositions(selectedSingleElement);
      return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 7, handle.y - 7, 14, 14)))?.key ?? null;
    }

    if (selectedIds.length > 1 && selectedBounds) {
      const handles = getGroupHandlePositions();
      return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 7, handle.y - 7, 14, 14)))?.key ?? null;
    }

    return null;
  };

  const getLinearResizeHandle = (point: BoardPoint): DragHandle | null => {
    if (!selectedSingleElement || (selectedSingleElement.type !== 'line' && selectedSingleElement.type !== 'arrow')) {
      return null;
    }

    const handles = getLinearHandlePositions(selectedSingleElement);
    return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 8, handle.y - 8, 16, 16)))?.key ?? null;
  };

  const getGroupHandlePositions = () => {
    if (!selectedBounds) {
      return [];
    }

    return [
      { key: 'nw' as DragHandle, x: selectedBounds.x, y: selectedBounds.y },
      { key: 'ne' as DragHandle, x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y },
      { key: 'sw' as DragHandle, x: selectedBounds.x, y: selectedBounds.y + selectedBounds.height },
      { key: 'se' as DragHandle, x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y + selectedBounds.height },
    ];
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
    const targetScopeId = getSlideAtPoint(point)?.id ?? null;
    const isCreationTool =
      activeTool === 'draw' ||
      activeTool === 'rectangle' ||
      activeTool === 'ellipse' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'text';

    const scopeElements = targetScopeId === activeSlideId ? elements : getScopeElements(targetScopeId);

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
        color: shapeDefaults.color,
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
              color: shapeDefaults.color,
            }
          : {
              id: nextId,
              type: activeTool,
              x1: point.x,
              y1: point.y,
              x2: point.x,
              y2: point.y,
              color: shapeDefaults.color,
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
      setInteraction({
        type: 'resizing',
        pointerId: event.pointerId,
        elementId: selectedSingleElement.id,
        handle: linearHandle,
        snapshot: selectedSingleElement,
        initialElements: structuredClone(elements),
        selectionBounds: getElementBounds(selectedSingleElement),
        targetIds: [selectedSingleElement.id],
      });
      return;
    }

    const boxHandle = getBoxResizeHandle(point);
    if (boxHandle) {
      if (selectedSingleElement) {
        setInteraction({
          type: 'resizing',
          pointerId: event.pointerId,
          elementId: selectedSingleElement.id,
          handle: boxHandle,
          snapshot: selectedSingleElement,
          initialElements: structuredClone(elements),
          selectionBounds: getElementBounds(selectedSingleElement),
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

        setInteraction({
          type: 'resizing',
          pointerId: event.pointerId,
          elementId: null,
          handle: boxHandle,
          snapshot,
          initialElements: structuredClone(elements),
          selectionBounds: structuredClone(selectedBounds),
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
      case 'resizing':
        {
        const nextElements = (() => {
          if (!interaction.selectionBounds) {
            return elements;
          }

          if (!Array.isArray(interaction.targetIds) || interaction.targetIds.length === 0) {
            return elements;
          }

          if (interaction.targetIds.length > 1) {
            const nextBounds = event.shiftKey
              ? getAspectRatioConstrainedBounds(interaction.selectionBounds, interaction.handle, point)
              : getResizedBounds(interaction.selectionBounds, interaction.handle, point);
            const snapshotMap = interaction.snapshot as ElementSnapshot;

            return elements.map((element) => {
              const snapshot = snapshotMap[element.id];
              return snapshot ? scaleElementToBounds(snapshot, interaction.selectionBounds!, nextBounds) : element;
            });
          }

          return elements.map((element) => {
            if (element.id !== interaction.elementId) {
              return element;
            }

            const snapshot = interaction.snapshot as BoardElement;

            if (element.type === 'line' || element.type === 'arrow') {
              return resizeLinearElement(snapshot, interaction.handle, point, event.shiftKey);
            }

            const keepSquare = event.shiftKey && (element.type === 'rectangle' || element.type === 'ellipse');
            const keepAspectRatio = event.shiftKey && (element.type === 'image' || element.type === 'draw');
            return resizeBoxElement(snapshot, interaction.handle, point, keepSquare, keepAspectRatio);
          });
        })();
        onElementsChange(nextElements);
        updateProvisionalOwners(nextElements, interaction.targetIds);
        }
        break;
      case 'erasing':
        eraseAtPoint(point);
        break;
      default:
        break;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
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

    if (interaction.type === 'moving' || interaction.type === 'resizing') {
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
  const stageStyle = {
    ...(stageCursorStyle ?? {}),
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
          </defs>

          {slides.map((slide) => (
            <g key={`${slide.id}-frame-shell`}>
              <text
                className="board-slide-title"
                x={slide.frame.x + slide.frame.width / 2}
                y={slide.frame.y - 18}
                textAnchor="middle"
              >
                {slide.name}
              </text>
              <rect
                className={`board-slide-frame${slide.id === activeSlideId ? ' board-slide-frame--active' : ''}`}
                {...slide.frame}
              />
            </g>
          ))}

          {stagedCollections.slides.map((slide) => (
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

          {multiSelectionHighlightElements.map((element) => renderPreviewOverlay(element))}

          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              className="board-stage__selection-box"
            />
          )}

          {!isMarqueeSelecting && (editingBounds || selectedBounds) && !selectedElementUsesCustomSelection && (
            <rect
              x={(editingBounds ?? selectedBounds)?.x}
              y={(editingBounds ?? selectedBounds)?.y}
              width={(editingBounds ?? selectedBounds)?.width}
              height={(editingBounds ?? selectedBounds)?.height}
              className={
                editingElement?.type === 'text'
                  ? 'board-stage__editing-bounds'
                  : selectedIds.length > 1
                    ? 'board-stage__group-bounds'
                    : selectedSingleElement?.type === 'image'
                    ? 'board-stage__selected-bounds board-stage__selected-bounds--solid'
                    : 'board-stage__selected-bounds'
              }
            />
          )}

          {!isMarqueeSelecting && !isTransformingSelection && selectedSingleElement && renderSingleSelectionOverlay(selectedSingleElement)}

          {!editingElement && !isMarqueeSelecting &&
            (selectedSingleElement
              ? renderHandles(selectedSingleElement)
              : selectedBounds && selectedIds.length > 1
                ? renderGroupHandles(selectedBounds)
                : null)}
        </g>
      </svg>

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
      ratio: getBoundsOverlapRatio(getElementBounds(element), slide.frame),
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

function getSlideClipId(slideId: string) {
  return `slide-clip-${slideId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
function renderElement(element: BoardElement) {
  switch (element.type) {
    case 'draw':
      return (
        <polyline
          key={element.id}
          className="board-element board-element--stroke"
          style={{ stroke: getElementColor(element) }}
          points={element.points.map((point) => [point.x, point.y].join(',')).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <rect key={element.id} className="board-element board-element--shape" style={{ stroke: getElementColor(element) }} {...box} />;
    }
    case 'ellipse': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={element.id}
          className="board-element board-element--shape"
          style={{ stroke: getElementColor(element) }}
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
          style={{ stroke: getElementColor(element) }}
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
            style={{ stroke: getElementColor(element) }}
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

function renderPreviewOverlay(element: BoardElement) {
  switch (element.type) {
    case 'draw':
      return (
        <polyline
          key={`${element.id}-preview`}
          className="board-element--preview-stroke"
          points={element.points.map((point) => [point.x, point.y].join(',')).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <rect key={`${element.id}-preview`} className="board-element--preview-shape" {...box} />;
    }
    case 'ellipse': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={`${element.id}-preview`}
          className="board-element--preview-shape"
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
          key={`${element.id}-preview`}
          className="board-element--preview-line"
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow': {
      const shaftEnd = getArrowShaftEnd(element);
      return (
        <g key={`${element.id}-preview`}>
          <line
            className="board-element--preview-line board-element--preview-arrow-shaft"
            x1={element.x1}
            y1={element.y1}
            x2={shaftEnd?.x ?? element.x2}
            y2={shaftEnd?.y ?? element.y2}
          />
          {renderArrowHead(element, 'board-element--preview-arrowhead')}
        </g>
      );
    }
    case 'text': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <rect key={`${element.id}-preview`} className="board-element--preview-bounds" {...box} />;
    }
    case 'image': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <rect key={`${element.id}-preview`} className="board-element--preview-bounds" {...box} />;
    }
    default:
      return null;
  }
}

function renderSingleSelectionOverlay(element: BoardElement) {
  switch (element.type) {
    case 'draw':
      return (
        <polyline
          key={`${element.id}-selected`}
          className="board-element--selected-stroke"
          points={element.points.map((point) => [point.x, point.y].join(',')).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <rect
          key={`${element.id}-selected`}
          className="board-element--selected-shape"
          {...box}
        />
      );
    }
    case 'ellipse': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={`${element.id}-selected`}
          className="board-element--selected-shape"
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
          key={`${element.id}-selected`}
          className="board-element--selected-line"
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow': {
      const shaftEnd = getArrowShaftEnd(element);
      return (
        <g key={`${element.id}-selected`}>
          <line
            className="board-element--selected-line board-element--selected-arrow-shaft"
            x1={element.x1}
            y1={element.y1}
            x2={shaftEnd?.x ?? element.x2}
            y2={shaftEnd?.y ?? element.y2}
          />
          {renderArrowHead(element, 'board-element--selected-arrowhead')}
        </g>
      );
    }
    default:
      return null;
  }
}


function renderArrowHead(element: LinearElement, className: string, color?: string) {
  const geometry = getArrowHeadGeometry(element);

  if (!geometry) {
    return null;
  }

  return <polygon className={className} points={geometry.points} style={color ? { fill: color, stroke: color } : undefined} />;
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
  const headLength = 15;
  const headHalfWidth = 7.5;
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
function renderHandles(element: BoardElement) {
  if (element.type === 'line' || element.type === 'arrow') {
    return getLinearHandlePositions(element).map((handle) => (
      <rect
        key={`${element.id}-${handle.key}`}
        className="board-stage__handle"
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

  return getSelectionHandlePositions(element).map((handle) => (
    <rect
      key={`${element.id}-${handle.key}`}
      className={handleClassName}
      x={handle.x - 6}
      y={handle.y - 6}
      width={12}
      height={12}
      rx={3}
      ry={3}
    />
  ));
}

function renderGroupHandles(bounds: ReturnType<typeof normalizeRect>) {
  const handles = [
    { key: 'nw', x: bounds.x, y: bounds.y },
    { key: 'ne', x: bounds.x + bounds.width, y: bounds.y },
    { key: 'sw', x: bounds.x, y: bounds.y + bounds.height },
    { key: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  return handles.map((handle) => (
    <rect
      key={`group-${handle.key}`}
      className="board-stage__handle"
      x={handle.x - 6}
      y={handle.y - 6}
      width={12}
      height={12}
      rx={3}
      ry={3}
    />
  ));
}

export default WhiteboardStage;
