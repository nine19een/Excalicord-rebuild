import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  BoardElement,
  BoardPoint,
  DragHandle,
  InteractionState,
  ColorStyle,
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
  selectedIds: string[];
  selectedBounds: ReturnType<typeof getElementBounds> | null;
  textDefaults: TextStyle;
  shapeDefaults: ColorStyle;
  textEditor: TextEditorState | null;
  viewport: ViewportState;
  onActiveToolChange: (tool: ToolType) => void;
  onCommitElementsChange: (previous: BoardElement[], next: BoardElement[]) => void;
  onElementsChange: React.Dispatch<React.SetStateAction<BoardElement[]>>;
  onSelectedIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onTextEditorChange: (state: TextEditorState | null) => void;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>;
};

type ElementSnapshot = Record<string, BoardElement>;

function WhiteboardStage({
  activeTool,
  elements,
  selectedIds,
  selectedBounds,
  textDefaults,
  shapeDefaults,
  textEditor,
  viewport,
  onActiveToolChange,
  onCommitElementsChange,
  onElementsChange,
  onSelectedIdsChange,
  onTextEditorChange,
  onViewportChange,
}: WhiteboardStageProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);

  const selectedSingleElement =
    selectedIds.length === 1 ? elements.find((element) => element.id === selectedIds[0]) ?? null : null;

  const editingElement: TextElement | null =
    textEditor &&
    ((elements.find((element) => element.id === textEditor.elementId && element.type === 'text') as TextElement | undefined) ??
      null);

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

  const selectionBox =
    interaction?.type === 'selecting'
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

  const getWorldPoint = (event: React.PointerEvent | React.MouseEvent): BoardPoint => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: event.clientX - rect.left - viewport.x,
      y: event.clientY - rect.top - viewport.y,
    };
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
      onElementsChange((current) => [...current, nextStroke]);
      onSelectedIdsChange([]);
      setInteraction({
        type: 'drawing-stroke',
        pointerId: event.pointerId,
        elementId: strokeId,
        initialElements: structuredClone(elements),
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

      onElementsChange((current) => [...current, nextElement]);
      onSelectedIdsChange([nextId]);
      setInteraction({
        type: 'drawing-shape',
        pointerId: event.pointerId,
        elementId: nextId,
        origin: point,
        initialElements: structuredClone(elements),
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

      const nextElements = [...elements, nextText];
      onCommitElementsChange(elements, nextElements);
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
        onElementsChange((current) =>
          current.map((element) => {
            const snapshot = interaction.snapshot[element.id];
            return snapshot ? offsetElement(snapshot, dx, dy) : element;
          })
        );
        break;
      }
      case 'selecting':
        setInteraction({ ...interaction, currentPoint: point });
        break;
      case 'panning':
        onViewportChange({
          x: interaction.startViewport.x + (event.clientX - interaction.startClient.x),
          y: interaction.startViewport.y + (event.clientY - interaction.startClient.y),
        });
        break;
      case 'resizing':
        onElementsChange((current) => {
          if (!interaction.selectionBounds) {
            return current;
          }

          if (!Array.isArray(interaction.targetIds) || interaction.targetIds.length === 0) {
            return current;
          }

          if (interaction.targetIds.length > 1) {
            const nextBounds = getResizedBounds(interaction.selectionBounds, interaction.handle, point);
            const snapshotMap = interaction.snapshot as ElementSnapshot;

            return current.map((element) => {
              const snapshot = snapshotMap[element.id];
              return snapshot ? scaleElementToBounds(snapshot, interaction.selectionBounds!, nextBounds) : element;
            });
          }

          return current.map((element) => {
            if (element.id !== interaction.elementId) {
              return element;
            }

            const snapshot = interaction.snapshot as BoardElement;

            if (element.type === 'line' || element.type === 'arrow') {
              return resizeLinearElement(snapshot, interaction.handle, point, event.shiftKey);
            }

            const keepSquare = event.shiftKey && (element.type === 'rectangle' || element.type === 'ellipse');
            const keepAspectRatio = event.shiftKey && element.type === 'image';
            return resizeBoxElement(snapshot, interaction.handle, point, keepSquare, keepAspectRatio);
          });
        });
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
      onCommitElementsChange(interaction.initialElements, elements);
    }

    if (interaction.type === 'selecting') {
      const nextSelection = selectionPreviewElements.map((element) => element.id);
      onSelectedIdsChange(nextSelection);
    }

    setInteraction(null);
  };

  const handleStageDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = getWorldPoint(event);
    const hitElement = getTopElementAtPoint(point);
    if (hitElement?.type !== 'text') {
      return;
    }

    onSelectedIdsChange([hitElement.id]);
    onTextEditorChange({ elementId: hitElement.id, value: hitElement.text });
  };

  return (
    <div
      ref={surfaceRef}
      className={`board-stage board-stage--${activeTool}`}
      style={activeTool === 'select' && hoverCursor ? { cursor: hoverCursor } : undefined}
      onDoubleClick={handleStageDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoverCursor(null)}
    >
      <svg className="board-stage__svg">
        <defs>
          <marker id="board-arrow-head" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="context-stroke" />
          </marker>
          <marker id="board-arrow-head-selected" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="context-stroke" />
          </marker>
          <marker id="board-arrow-head-preview" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(79, 70, 229, 0.52)" />
          </marker>
        </defs>

        <g transform={`translate(${viewport.x} ${viewport.y})`}>
          {elements.map((element) =>
            editingElement?.type === 'text' && element.id === editingElement.id ? null : renderElement(element)
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

          {(editingBounds || selectedBounds) && !selectedElementUsesCustomSelection && (
            <rect
              x={(editingBounds ?? selectedBounds)?.x}
              y={(editingBounds ?? selectedBounds)?.y}
              width={(editingBounds ?? selectedBounds)?.width}
              height={(editingBounds ?? selectedBounds)?.height}
              className={
                editingElement?.type === 'text'
                  ? 'board-stage__editing-bounds'
                  : selectedSingleElement?.type === 'image'
                    ? 'board-stage__selected-bounds board-stage__selected-bounds--solid'
                    : 'board-stage__selected-bounds'
              }
            />
          )}

          {selectedSingleElement && renderSelectedOverlay(selectedSingleElement)}

          {!editingElement &&
            (selectedSingleElement
              ? renderHandles(selectedSingleElement)
              : selectedBounds && selectedIds.length > 1
                ? renderGroupHandles(selectedBounds)
                : null)}
        </g>
      </svg>

      {editingElement?.type === 'text' && (
        <textarea
          ref={textEditorRef}
          className="board-text-editor"
          value={textEditor?.value ?? ''}
          autoFocus
          style={{
            left: `${editingElement.x + viewport.x}px`,
            top: `${editingElement.y + viewport.y}px`,
            width: `${editingElement.width}px`,
            height: `${activeEditorHeight ?? editingElement.height}px`,
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
    case 'arrow':
      return (
        <line
          key={element.id}
          className="board-element board-element--line"
          style={{ stroke: getElementColor(element) }}
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          markerEnd="url(#board-arrow-head)"
        />
      );
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

function getElementSelectionFill(element: BoardElement) {
  const color = getElementColor(element);
  return toAlphaColor(color, 0.06);
}

function toAlphaColor(color: string, alpha: number) {
  const hex = color.replace('#', '');

  if (hex.length !== 6) {
    return `rgba(79, 70, 229, ${alpha})`;
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderPreviewOverlay(element: BoardElement) {
  switch (element.type) {
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
          key={`${element.id}-preview`}
          className="board-element--preview-line"
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow':
      return (
        <line
          key={`${element.id}-preview`}
          className="board-element--preview-line"
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          markerEnd="url(#board-arrow-head-preview)"
        />
      );
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

function renderSelectedOverlay(element: BoardElement) {
  const selectionStroke = getElementColor(element);
  const selectionFill = getElementSelectionFill(element);
  switch (element.type) {
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <rect
          key={`${element.id}-selected`}
          className="board-element--selected-shape"
          style={{ stroke: selectionStroke, fill: selectionFill }}
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
          style={{ stroke: selectionStroke, fill: selectionFill }}
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
          style={{ stroke: selectionStroke }}
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow':
      return (
        <line
          key={`${element.id}-selected`}
          className="board-element--selected-line"
          style={{ stroke: selectionStroke }}
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          markerEnd="url(#board-arrow-head-selected)"
        />
      );
    default:
      return null;
  }
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
