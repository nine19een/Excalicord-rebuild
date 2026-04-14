import { useEffect, useMemo, useState } from 'react';
import FloatingControlBar from './FloatingControlBar';
import TopToolbar from './TopToolbar';
import WhiteboardStage from './WhiteboardStage';
import type {
  BoardElement,
  ImageElement,
  TextEditorState,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import { duplicateElements, generateElementId, getElementBounds, offsetElement } from '../whiteboard/utils';

type WhiteboardPageProps = {
  onOpenSettings: () => void;
};

function WhiteboardPage({ onOpenSettings }: WhiteboardPageProps) {
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 180, y: 120 });
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);

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

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        setElements((current) => current.filter((element) => !selectedIds.includes(element.id)));
        setSelectedIds([]);
        setTextEditor((current) => (current && selectedIds.includes(current.elementId) ? null : current));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedIds.length > 0) {
        event.preventDefault();
        setElements((current) => {
          const nextElements = duplicateElements(
            current.filter((element) => selectedIds.includes(element.id)),
            generateElementId
          ).map((element) => offsetElement(element, 24, 24));

          return [...current, ...nextElements];
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

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

    setElements((current) => [...current, nextElement]);
    setSelectedIds([nextElement.id]);
    setActiveTool('select');
  };

  const selectedElements = useMemo(
    () => elements.filter((element) => selectedIds.includes(element.id)),
    [elements, selectedIds]
  );

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

  return (
    <div className="board-page">
      <TopToolbar activeTool={activeTool} onToolChange={setActiveTool} onInsertImage={handleInsertImage} />
      <FloatingControlBar onOpenSettings={onOpenSettings} />

      <div className="board-page__stage">
        <WhiteboardStage
          activeTool={activeTool}
          elements={elements}
          selectedIds={selectedIds}
          selectedBounds={selectedBounds}
          textEditor={textEditor}
          viewport={viewport}
          onActiveToolChange={setActiveTool}
          onElementsChange={setElements}
          onSelectedIdsChange={setSelectedIds}
          onTextEditorChange={setTextEditor}
          onViewportChange={setViewport}
        />
      </div>
    </div>
  );
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

export default WhiteboardPage;

