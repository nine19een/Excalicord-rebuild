import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FloatingControlBar from './FloatingControlBar';
import TopToolbar from './TopToolbar';
import WhiteboardStage from './WhiteboardStage';
import type {
  BoardElement,
  ColorStyle,
  ImageElement,
  LayerAction,
  TextEditorState,
  TextStyle,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import {
  DEFAULT_BOARD_COLOR,
  DEFAULT_TEXT_STYLE,
  FIT_CONTENT_MAX_ZOOM,
  FIT_CONTENT_MIN_ZOOM,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  ZOOM_BUTTON_STEP,
} from '../whiteboard/types';
import { duplicateElements, generateElementId, getElementBounds, offsetElement } from '../whiteboard/utils';

type WhiteboardPageProps = {
  onOpenSettings: () => void;
};

type ElementsHistory = {
  past: BoardElement[][];
  present: BoardElement[];
  future: BoardElement[][];
};

function WhiteboardPage({ onOpenSettings }: WhiteboardPageProps) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [history, setHistory] = useState<ElementsHistory>({
    past: [],
    present: [],
    future: [],
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 180, y: 120, zoom: 1 });
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textDefaults, setTextDefaults] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [shapeDefaults, setShapeDefaults] = useState<ColorStyle>({ color: DEFAULT_BOARD_COLOR });
  const [clipboard, setClipboard] = useState<BoardElement[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const elements = history.present;



  const onElementsChange = useCallback((update: React.SetStateAction<BoardElement[]>) => {
    setHistory((current) => ({
      ...current,
      present: resolveElementsUpdate(update, current.present),
    }));
  }, []);

  const onCommitElementsChange = useCallback((previous: BoardElement[], next: BoardElement[]) => {
    setHistory((current) => {
      if (serializeElements(previous) === serializeElements(next)) {
        return {
          ...current,
          present: cloneElements(next),
        };
      }

      return {
        past: [...current.past, cloneElements(previous)],
        present: cloneElements(next),
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) {
        return current;
      }

      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: cloneElements(previous),
        future: [cloneElements(current.present), ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) {
        return current;
      }

      const next = current.future[0];
      return {
        past: [...current.past, cloneElements(current.present)],
        present: cloneElements(next),
        future: current.future.slice(1),
      };
    });
  }, []);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => elements.some((element) => element.id === id)));
    setTextEditor((current) =>
      current && elements.some((element) => element.id === current.elementId && element.type === 'text') ? current : null
    );
  }, [elements]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      if (hasModifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        const nextElements = elements.filter((element) => !selectedIds.includes(element.id));
        onCommitElementsChange(elements, nextElements);
        setSelectedIds([]);
        setTextEditor((current) => (current && selectedIds.includes(current.elementId) ? null : current));
        return;
      }

      if (hasModifier && key === 'c' && selectedIds.length > 0) {
        event.preventDefault();
        setClipboard(cloneElements(elements.filter((element) => selectedIds.includes(element.id))));
        setPasteCount(0);
        return;
      }

      if (hasModifier && key === 'v' && clipboard.length > 0) {
        event.preventDefault();
        const offsetStep = 24 * (pasteCount + 1);
        const pastedElements = duplicateElements(clipboard, generateElementId).map((element) =>
          offsetElement(element, offsetStep, offsetStep)
        );
        const nextElements = [...elements, ...pastedElements];
        onCommitElementsChange(elements, nextElements);
        setSelectedIds(pastedElements.map((element) => element.id));
        setPasteCount((current) => current + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, elements, onCommitElementsChange, pasteCount, redo, selectedIds, undo]);



  const getViewportCenterAnchor = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect();
    return rect
      ? {
          x: rect.width / 2,
          y: rect.height / 2,
        }
      : {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
  }, []);

  const applyZoomAtScreenPoint = useCallback((resolveNextZoom: (currentZoom: number) => number, anchor: { x: number; y: number }) => {
    setViewport((current) => zoomViewportAtScreenPoint(current, resolveNextZoom(current.zoom), anchor));
  }, []);

  const zoomOut = useCallback(() => {
    applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, -1), getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor]);

  const zoomIn = useCallback(() => {
    applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, 1), getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor]);

  const zoomTo = useCallback((nextZoom: number) => {
    applyZoomAtScreenPoint(() => nextZoom, getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor]);

  const fitContent = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect();

    if (!rect || elements.length === 0) {
      setViewport({ x: 180, y: 120, zoom: 1 });
      return;
    }

    setViewport(fitViewportToElements(elements, rect.width, rect.height));
  }, [elements]);

  const requestClearBoard = useCallback(() => {
    if (elements.length === 0) {
      return;
    }

    setIsClearConfirmOpen(true);
  }, [elements.length]);

  const cancelClearBoard = useCallback(() => {
    setIsClearConfirmOpen(false);
  }, []);

  const confirmClearBoard = useCallback(() => {
    if (elements.length > 0) {
      onCommitElementsChange(elements, []);
    }

    setSelectedIds([]);
    setTextEditor(null);
    setIsClearConfirmOpen(false);
  }, [elements, onCommitElementsChange]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const page = pageRef.current;
      if (!page || !event.ctrlKey) {
        return;
      }

      const rect = page.getBoundingClientRect();
      const isInsideBoard =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideBoard) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const direction = event.deltaY < 0 ? 1 : -1;
      applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, direction), anchor);
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [applyZoomAtScreenPoint]);

  useEffect(() => {
    const handleZoomKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget || !(event.ctrlKey || event.metaKey)) {
        return;
      }

      const isZoomOutKey = event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract';
      const isZoomInKey = event.key === '=' || event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd';

      if (!isZoomOutKey && !isZoomInKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isZoomOutKey) {
        zoomOut();
      } else {
        zoomIn();
      }
    };

    window.addEventListener('keydown', handleZoomKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleZoomKeyDown, { capture: true });
  }, [zoomIn, zoomOut]);


  const handleLayerAction = useCallback(
    (action: LayerAction) => {
      if (activeTool !== 'select' || selectedIds.length === 0) {
        return;
      }

      const nextElements = reorderElementsByLayerAction(elements, selectedIds, action);
      onCommitElementsChange(elements, nextElements);
    },
    [activeTool, elements, onCommitElementsChange, selectedIds]
  );

  const handleInsertImage = async (file: File) => {
    const src = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(src);
    const maxWidth = 360;
    const maxHeight = 260;
    const scale = Math.min(1, maxWidth / dimensions.width, maxHeight / dimensions.height);
    const width = Math.max(80, Math.round(dimensions.width * scale));
    const height = Math.max(80, Math.round(dimensions.height * scale));
    const x = (180 - viewport.x) / viewport.zoom;
    const y = (140 - viewport.y) / viewport.zoom;

    const nextElement: ImageElement = {
      id: generateElementId(),
      type: 'image',
      x,
      y,
      width,
      height,
      src,
      fileName: file.name,
    };

    const nextElements = [...elements, nextElement];
    onCommitElementsChange(elements, nextElements);
    setSelectedIds([nextElement.id]);
    setActiveTool('select');
  };

  const selectedElements = useMemo(
    () => elements.filter((element) => selectedIds.includes(element.id)),
    [elements, selectedIds]
  );

  const selectedTextElement = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null;
    }

    const element = elements.find((item) => item.id === selectedIds[0]);
    return element?.type === 'text' ? element : null;
  }, [elements, selectedIds]);

  const selectedColorElements = useMemo(
    () =>
      elements.filter(
        (element): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' }> =>
          selectedIds.includes(element.id) && isColorEditableElement(element)
      ),
    [elements, selectedIds]
  );

  const selectedColorStyle = useMemo(() => {
    if (selectedColorElements.length === 0) {
      return null;
    }

    return { color: selectedColorElements[0].color };
  }, [selectedColorElements]);

  const toolbarTextStyle = useMemo(() => {
    if (activeTool === 'text') {
      return selectedTextElement ?? textDefaults;
    }

    if (activeTool === 'select') {
      return selectedTextElement;
    }

    return null;
  }, [activeTool, selectedTextElement, textDefaults]);

  const toolbarColorStyle = useMemo(() => {
    if (activeTool === 'text') {
      return { color: (selectedTextElement ?? textDefaults).color };
    }

    if (isColorTool(activeTool)) {
      return shapeDefaults;
    }

    if (activeTool === 'select') {
      return selectedColorStyle;
    }

    return null;
  }, [activeTool, selectedColorStyle, selectedTextElement, shapeDefaults, textDefaults]);

  const selectedBounds = useMemo(() => {
    if (selectedElements.length === 0) {
      return null;
    }

    return selectedElements.reduce<ReturnType<typeof getElementBounds> | null>((bounds, element) => {
      const current = getElementBounds(element);
      if (!bounds) {
        return current;
      }

      const left = Math.min(bounds.x, current.x);
      const top = Math.min(bounds.y, current.y);
      const right = Math.max(bounds.x + bounds.width, current.x + current.width);
      const bottom = Math.max(bounds.y + bounds.height, current.y + current.height);

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    }, null);
  }, [selectedElements]);

  const handleToolbarTextStyleChange = (patch: Partial<TextStyle>) => {
    setTextDefaults((current) => ({ ...current, ...patch }));

    if (!selectedTextElement) {
      return;
    }

    onElementsChange((current) =>
      current.map((element) =>
        element.id === selectedTextElement.id && element.type === 'text'
          ? {
              ...element,
              ...patch,
            }
          : element
      )
    );
  };

  const handleToolbarColorChange = (patch: Partial<ColorStyle>) => {
    if (!patch.color) {
      return;
    }

    if (activeTool === 'text') {
      setTextDefaults((current) => ({ ...current, color: patch.color! }));
      return;
    }

    if (isShapeColorTool(activeTool)) {
      setShapeDefaults((current) => ({ ...current, color: patch.color! }));
      return;
    }

    if (selectedColorElements.length === 0) {
      return;
    }

    if (selectedColorElements.some((element) => element.type === 'text')) {
      setTextDefaults((current) => ({ ...current, color: patch.color! }));
    }

    if (selectedColorElements.some((element) => isShapeColorableElement(element))) {
      setShapeDefaults((current) => ({ ...current, color: patch.color! }));
    }

    const selectedColorIds = new Set(selectedColorElements.map((element) => element.id));
    const nextElements = elements.map((element) =>
      selectedColorIds.has(element.id) && isColorEditableElement(element)
        ? {
            ...element,
            ...patch,
          }
        : element
    );

    onCommitElementsChange(elements, nextElements);
  };

  return (
    <div ref={pageRef} className="board-page">
      <TopToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onInsertImage={handleInsertImage}
        textStyle={toolbarTextStyle}
        colorStyle={toolbarColorStyle}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onTextStyleChange={handleToolbarTextStyleChange}
        onColorChange={handleToolbarColorChange}
        onUndo={undo}
        onRedo={redo}
        canArrangeLayers={activeTool === 'select' && selectedIds.length > 0}
        onLayerAction={handleLayerAction}
      />
      <FloatingControlBar onOpenSettings={onOpenSettings} />

      <div className="board-page__stage">
        <WhiteboardStage
          activeTool={activeTool}
          elements={elements}
          selectedIds={selectedIds}
          selectedBounds={selectedBounds}
          textDefaults={textDefaults}
          shapeDefaults={shapeDefaults}
          textEditor={textEditor}
          viewport={viewport}
          onActiveToolChange={setActiveTool}
          onCommitElementsChange={onCommitElementsChange}
          onElementsChange={onElementsChange}
          onSelectedIdsChange={setSelectedIds}
          onTextEditorChange={setTextEditor}
          onViewportChange={setViewport}
        />
      </div>

      <ZoomControls
        zoom={viewport.zoom}
        canClear={elements.length > 0}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitContent={fitContent}
        onZoomTo={zoomTo}
        onRequestClear={requestClearBoard}
      />
      {isClearConfirmOpen ? <ClearBoardConfirm onCancel={cancelClearBoard} onConfirm={confirmClearBoard} /> : null}
    </div>
  );
}

function ZoomControls({
  zoom,
  canClear,
  onZoomOut,
  onZoomIn,
  onFitContent,
  onZoomTo,
  onRequestClear,
}: {
  zoom: number;
  canClear: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitContent: () => void;
  onZoomTo: (zoom: number) => void;
  onRequestClear: () => void;
}) {
  const percentage = Math.round(zoom * 100);
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState(String(percentage));

  useEffect(() => {
    if (!isEditingZoom) {
      setZoomInput(String(percentage));
    }
  }, [isEditingZoom, percentage]);

  const commitZoomInput = () => {
    const parsedZoom = parseZoomInput(zoomInput);
    setIsEditingZoom(false);

    if (parsedZoom === null) {
      setZoomInput(String(percentage));
      return;
    }

    onZoomTo(parsedZoom);
  };

  return (
    <div
      className="board-zoom-controls"
      aria-label="Canvas zoom controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="board-zoom-controls__button" onClick={onZoomOut} disabled={zoom <= MIN_VIEWPORT_ZOOM}>
        -
      </button>
      {isEditingZoom ? (
        <input
          className="board-zoom-controls__input"
          value={zoomInput}
          autoFocus
          onChange={(event) => setZoomInput(event.target.value)}
          onBlur={commitZoomInput}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitZoomInput();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setZoomInput(String(percentage));
              setIsEditingZoom(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="board-zoom-controls__value"
          aria-label="Edit zoom percentage"
          title="Edit zoom percentage"
          onClick={() => {
            setZoomInput(String(percentage));
            setIsEditingZoom(true);
          }}
        >
          {percentage}%
        </button>
      )}
      <button type="button" className="board-zoom-controls__button" onClick={onZoomIn} disabled={zoom >= MAX_VIEWPORT_ZOOM}>
        +
      </button>
      <button type="button" className="board-zoom-controls__fit" onClick={onFitContent}>
        {'\u9002\u5e94\u5185\u5bb9'}
      </button>
      <button
        type="button"
        className="board-zoom-controls__clear"
        onClick={onRequestClear}
        disabled={!canClear}
      >
        {'\u6e05\u5c4f'}
      </button>
    </div>
  );
}



function ClearBoardConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="board-clear-confirm" role="dialog" aria-modal="true" aria-labelledby="board-clear-confirm-title">
      <div className="board-clear-confirm__panel">
        <p id="board-clear-confirm-title" className="board-clear-confirm__title">
          {'\u6e05\u7a7a\u5f53\u524d\u767d\u677f\u6240\u6709\u5185\u5bb9\uff1f'}
        </p>
        <p className="board-clear-confirm__description">{'\u6b64\u64cd\u4f5c\u53ef\u901a\u8fc7\u64a4\u9500\u6062\u590d\u3002'}</p>
        <div className="board-clear-confirm__actions">
          <button type="button" className="board-clear-confirm__button" onClick={onCancel}>
            {'\u53d6\u6d88'}
          </button>
          <button
            type="button"
            className="board-clear-confirm__button board-clear-confirm__button--danger"
            onClick={onConfirm}
          >
            {'\u6e05\u7a7a'}
          </button>
        </div>
      </div>
    </div>
  );
}
function getNextManualZoom(currentZoom: number, direction: 1 | -1) {
  const stepPercent = ZOOM_BUTTON_STEP * 100;
  const currentPercent = Math.round(currentZoom * 100);
  const nextPercent =
    direction > 0
      ? Math.floor(currentPercent / stepPercent) * stepPercent + stepPercent
      : Math.ceil(currentPercent / stepPercent) * stepPercent - stepPercent;

  return clampZoom(nextPercent / 100, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
}

function parseZoomInput(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*%?$/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampZoom(parsed / 100, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
}

function clampZoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitViewportToElements(elements: BoardElement[], viewportWidth: number, viewportHeight: number): ViewportState {
  const contentBounds = getElementsBounds(elements);

  if (!contentBounds) {
    return { x: 180, y: 120, zoom: 1 };
  }

  const padding = 96;
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const safeWidth = Math.max(1, contentBounds.width);
  const safeHeight = Math.max(1, contentBounds.height);
  const nextZoom = clampZoom(
    Math.min(availableWidth / safeWidth, availableHeight / safeHeight),
    FIT_CONTENT_MIN_ZOOM,
    FIT_CONTENT_MAX_ZOOM
  );
  const contentCenterX = contentBounds.x + contentBounds.width / 2;
  const contentCenterY = contentBounds.y + contentBounds.height / 2;

  return {
    x: viewportWidth / 2 - contentCenterX * nextZoom,
    y: viewportHeight / 2 - contentCenterY * nextZoom,
    zoom: nextZoom,
  };
}

function getElementsBounds(elements: BoardElement[]) {
  return elements.reduce<ReturnType<typeof getElementBounds> | null>((bounds, element) => {
    const current = getElementBounds(element);

    if (!bounds) {
      return current;
    }

    const left = Math.min(bounds.x, current.x);
    const top = Math.min(bounds.y, current.y);
    const right = Math.max(bounds.x + bounds.width, current.x + current.width);
    const bottom = Math.max(bounds.y + bounds.height, current.y + current.height);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }, null);
}

function zoomViewportAtScreenPoint(viewport: ViewportState, nextZoomValue: number, anchor: { x: number; y: number }): ViewportState {
  const nextZoom = clampZoom(nextZoomValue, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
  const worldX = (anchor.x - viewport.x) / viewport.zoom;
  const worldY = (anchor.y - viewport.y) / viewport.zoom;

  return {
    x: anchor.x - worldX * nextZoom,
    y: anchor.y - worldY * nextZoom,
    zoom: nextZoom,
  };
}

function reorderElementsByLayerAction(elements: BoardElement[], selectedIds: string[], action: LayerAction) {
  const selectedSet = new Set(selectedIds);
  const selectedElements = elements.filter((element) => selectedSet.has(element.id));

  if (selectedElements.length === 0) {
    return elements;
  }

  const unselectedElements = elements.filter((element) => !selectedSet.has(element.id));

  if (unselectedElements.length === 0) {
    return elements;
  }

  if (action === 'bring-to-front') {
    return [...unselectedElements, ...selectedElements];
  }

  if (action === 'send-to-back') {
    return [...selectedElements, ...unselectedElements];
  }

  const selectedIndexes = elements
    .map((element, index) => (selectedSet.has(element.id) ? index : -1))
    .filter((index) => index >= 0);

  if (selectedIndexes.length === 0) {
    return elements;
  }

  if (action === 'bring-forward') {
    const topSelectedIndex = Math.max(...selectedIndexes);
    const currentInsertIndex = elements.reduce(
      (count, element, index) => (!selectedSet.has(element.id) && index <= topSelectedIndex ? count + 1 : count),
      0
    );
    const nextInsertIndex = Math.min(unselectedElements.length, currentInsertIndex + 1);
    return insertSelectedGroup(unselectedElements, selectedElements, nextInsertIndex);
  }

  const bottomSelectedIndex = Math.min(...selectedIndexes);
  const currentInsertIndex = elements.reduce(
    (count, element, index) => (!selectedSet.has(element.id) && index < bottomSelectedIndex ? count + 1 : count),
    0
  );
  const nextInsertIndex = Math.max(0, currentInsertIndex - 1);
  return insertSelectedGroup(unselectedElements, selectedElements, nextInsertIndex);
}

function insertSelectedGroup(unselectedElements: BoardElement[], selectedElements: BoardElement[], insertIndex: number) {
  return [
    ...unselectedElements.slice(0, insertIndex),
    ...selectedElements,
    ...unselectedElements.slice(insertIndex),
  ];
}

function resolveElementsUpdate(
  update: React.SetStateAction<BoardElement[]>,
  current: BoardElement[]
) {
  return typeof update === 'function' ? update(current) : update;
}

function serializeElements(elements: BoardElement[]) {
  return JSON.stringify(elements);
}

function cloneElements(elements: BoardElement[]) {
  return structuredClone(elements);
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function isColorTool(tool: ToolType) {
  return tool === 'text' || isShapeColorTool(tool);
}

function isShapeColorTool(tool: ToolType) {
  return tool === 'draw' || tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
}

function isShapeColorableElement(
  element: BoardElement
): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' }> {
  return (
    element.type === 'draw' ||
    element.type === 'rectangle' ||
    element.type === 'ellipse' ||
    element.type === 'line' ||
    element.type === 'arrow'
  );
}

function isColorEditableElement(
  element: BoardElement
): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' }> {
  return isShapeColorableElement(element) || element.type === 'text';
}

export default WhiteboardPage;
