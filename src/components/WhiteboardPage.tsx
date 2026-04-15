import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FloatingControlBar from './FloatingControlBar';
import TopToolbar from './TopToolbar';
import WhiteboardStage from './WhiteboardStage';
import type {
  BoardElement,
  ColorStyle,
  ImageElement,
  TextEditorState,
  TextStyle,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import { DEFAULT_BOARD_COLOR, DEFAULT_TEXT_STYLE } from '../whiteboard/types';
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
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [history, setHistory] = useState<ElementsHistory>({
    past: [],
    present: [],
    future: [],
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 180, y: 120 });
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textDefaults, setTextDefaults] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [shapeDefaults, setShapeDefaults] = useState<ColorStyle>({ color: DEFAULT_BOARD_COLOR });
  const [clipboard, setClipboard] = useState<BoardElement[]>([]);
  const [pasteCount, setPasteCount] = useState(0);

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

  const handleInsertImage = async (file: File) => {
    const src = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(src);
    const maxWidth = 360;
    const maxHeight = 260;
    const scale = Math.min(1, maxWidth / dimensions.width, maxHeight / dimensions.height);
    const width = Math.max(80, Math.round(dimensions.width * scale));
    const height = Math.max(80, Math.round(dimensions.height * scale));
    const x = 180 - viewport.x;
    const y = 140 - viewport.y;

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

  const handleSelectedTextStyleChange = (patch: Partial<TextStyle>) => {
    if (!selectedTextElement) {
      return;
    }

    setTextDefaults((current) => ({ ...current, ...patch }));
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

  const handleSelectedColorChange = (patch: Partial<ColorStyle>) => {
    if (selectedColorElements.length === 0) {
      return;
    }

    if (patch.color) {
      if (selectedColorElements.some((element) => element.type === 'text')) {
        setTextDefaults((current) => ({ ...current, color: patch.color! }));
      }

      if (selectedColorElements.some((element) => isShapeColorableElement(element))) {
        setShapeDefaults((current) => ({ ...current, color: patch.color! }));
      }
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
    <div className="board-page">
      <TopToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onInsertImage={handleInsertImage}
        selectedTextStyle={selectedTextElement}
        selectedColorStyle={selectedColorStyle}
        onSelectedTextStyleChange={handleSelectedTextStyleChange}
        onSelectedColorChange={handleSelectedColorChange}
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
    </div>
  );
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
