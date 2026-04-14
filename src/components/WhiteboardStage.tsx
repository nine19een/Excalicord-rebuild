import type React from 'react';
import { useRef, useState } from 'react';
import type {
  BoardElement,
  BoardPoint,
  DragHandle,
  InteractionState,
  TextEditorState,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import {
  generateElementId,
  getElementBounds,
  getLinearHandlePositions,
  getSelectionHandlePositions,
  hitTestElement,
  isPointInBounds,
  normalizeBoxElement,
  normalizeRect,
  offsetElement,
  rectContainsBounds,
  resizeBoxElement,
  resizeLinearElement,
} from '../whiteboard/utils';

type WhiteboardStageProps = {
  activeTool: ToolType;
  elements: BoardElement[];
  selectedIds: string[];
  selectedBounds: ReturnType<typeof getElementBounds> | null;
  textEditor: TextEditorState | null;
  viewport: ViewportState;
  onActiveToolChange: (tool: ToolType) => void;
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
  textEditor,
  viewport,
  onActiveToolChange,
  onElementsChange,
  onSelectedIdsChange,
  onTextEditorChange,
  onViewportChange,
}: WhiteboardStageProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);

  const selectedSingleElement =
    selectedIds.length === 1 ? elements.find((element) => element.id === selectedIds[0]) ?? null : null;

  const editingElement =
    textEditor && elements.find((element) => element.id === textEditor.elementId && element.type === 'text');

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
      if (hitTestElement(element, point)) {
        return element;
      }
    }

    return null;
  };

  const eraseAtPoint = (point: BoardPoint) => {
    const target = getTopElementAtPoint(point);
    if (!target) {
      return;
    }

    onElementsChange((current) => current.filter((element) => element.id !== target.id));
    onSelectedIdsChange((current) => current.filter((id) => id !== target.id));

    if (textEditor?.elementId === target.id) {
      onTextEditorChange(null);
    }
  };

  const getBoxResizeHandle = (point: BoardPoint): DragHandle | null => {
    if (
      !selectedSingleElement ||
      selectedSingleElement.type === 'draw' ||
      selectedSingleElement.type === 'line' ||
      selectedSingleElement.type === 'arrow'
    ) {
      return null;
    }

    const handles = getSelectionHandlePositions(selectedSingleElement);
    return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 7, handle.y - 7, 14, 14)))?.key ?? null;
  };

  const getLinearResizeHandle = (point: BoardPoint): DragHandle | null => {
    if (!selectedSingleElement || (selectedSingleElement.type !== 'line' && selectedSingleElement.type !== 'arrow')) {
      return null;
    }

    const handles = getLinearHandlePositions(selectedSingleElement);
    return handles.find((handle) => isPointInBounds(point, normalizeRect(handle.x - 8, handle.y - 8, 16, 16)))?.key ?? null;
  };

  const commitTextEdit = (nextValue: string) => {
    if (!textEditor) {
      return;
    }

    if (!nextValue.trim()) {
      onElementsChange((current) => current.filter((element) => element.id !== textEditor.elementId));
      onSelectedIdsChange((current) => current.filter((id) => id !== textEditor.elementId));
      onTextEditorChange(null);
      return;
    }

    onElementsChange((current) =>
      current.map((element) =>
        element.id === textEditor.elementId && element.type === 'text'
          ? {
              ...element,
              text: nextValue,
            }
          : element
      )
    );
    onTextEditorChange(null);
    onActiveToolChange('select');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editingElement) {
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
      };
      onElementsChange((current) => [...current, nextStroke]);
      onSelectedIdsChange([]);
      setInteraction({ type: 'drawing-stroke', pointerId: event.pointerId, elementId: strokeId });
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
            }
          : {
              id: nextId,
              type: activeTool,
              x1: point.x,
              y1: point.y,
              x2: point.x,
              y2: point.y,
            };

      onElementsChange((current) => [...current, nextElement]);
      onSelectedIdsChange([nextId]);
      setInteraction({
        type: 'drawing-shape',
        pointerId: event.pointerId,
        elementId: nextId,
        origin: point,
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
      };

      onElementsChange((current) => [...current, nextText]);
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
      });
      return;
    }

    const boxHandle = getBoxResizeHandle(point);
    if (boxHandle && selectedSingleElement) {
      setInteraction({
        type: 'resizing',
        pointerId: event.pointerId,
        elementId: selectedSingleElement.id,
        handle: boxHandle,
        snapshot: selectedSingleElement,
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
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    const point = getWorldPoint(event);

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
              return {
                ...element,
                width: point.x - interaction.origin.x,
                height: point.y - interaction.origin.y,
              };
            }

            if (element.type === 'line' || element.type === 'arrow') {
              return {
                ...element,
                x2: point.x,
                y2: point.y,
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
        onElementsChange((current) =>
          current.map((element) => {
            if (element.id !== interaction.elementId) {
              return element;
            }

            if (element.type === 'line' || element.type === 'arrow') {
              return resizeLinearElement(interaction.snapshot, interaction.handle, point);
            }

            return resizeBoxElement(interaction.snapshot, interaction.handle, point);
          })
        );
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

    if (interaction.type === 'drawing-shape') {
      onElementsChange((current) =>
        current.map((element) => (element.id === interaction.elementId ? normalizeBoxElement(element) : element))
      );
      onActiveToolChange('select');
    }

    if (interaction.type === 'selecting') {
      const selectionRect = normalizeRect(
        interaction.startPoint.x,
        interaction.startPoint.y,
        interaction.currentPoint.x - interaction.startPoint.x,
        interaction.currentPoint.y - interaction.startPoint.y
      );

      const nextSelection = elements
        .filter((element) => rectContainsBounds(selectionRect, getElementBounds(element)))
        .map((element) => element.id);

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

  const selectionBox =
    interaction?.type === 'selecting'
      ? normalizeRect(
          interaction.startPoint.x,
          interaction.startPoint.y,
          interaction.currentPoint.x - interaction.startPoint.x,
          interaction.currentPoint.y - interaction.startPoint.y
        )
      : null;

  return (
    <div
      ref={surfaceRef}
      className={`board-stage board-stage--${activeTool}`}
      onDoubleClick={handleStageDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <svg className="board-stage__svg">
        <defs>
          <marker id="board-arrow-head" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="#1f2937" />
          </marker>
        </defs>

        <g transform={`translate(${viewport.x} ${viewport.y})`}>
          {elements.map((element) => renderElement(element))}

          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              className="board-stage__selection-box"
            />
          )}

          {selectedBounds && (
            <rect
              x={selectedBounds.x}
              y={selectedBounds.y}
              width={selectedBounds.width}
              height={selectedBounds.height}
              className="board-stage__selected-bounds"
            />
          )}

          {selectedSingleElement && selectedSingleElement.type !== 'draw' && renderHandles(selectedSingleElement)}
        </g>
      </svg>

      {editingElement?.type === 'text' && (
        <textarea
          className="board-text-editor"
          value={textEditor?.value ?? ''}
          autoFocus
          style={{
            left: `${editingElement.x + viewport.x}px`,
            top: `${editingElement.y + viewport.y}px`,
            width: `${editingElement.width}px`,
            height: `${editingElement.height}px`,
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
              onTextEditorChange(null);
            }

            if (event.key === 'Enter' && !event.shiftKey) {
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
          points={element.points.map((point) => `${point.x},${point.y}`).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <rect key={element.id} className="board-element board-element--shape" {...box} />;
    }
    case 'ellipse': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={element.id}
          className="board-element board-element--shape"
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
          <div className="board-text-node">{element.text || 'Text'}</div>
        </foreignObject>
      );
    case 'image': {
      const box = normalizeRect(element.x, element.y, element.width, element.height);
      return <image key={element.id} x={box.x} y={box.y} width={box.width} height={box.height} href={element.src} />;
    }
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

  return getSelectionHandlePositions(element).map((handle) => (
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

export default WhiteboardStage;

