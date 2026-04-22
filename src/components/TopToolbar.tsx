import { useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { ToolType } from '../whiteboard/types';

type TopToolbarProps = {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onInsertImage: (file: File) => void | Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

type ToolbarItem = {
  key: ToolType;
  label: string;
};

type ToolbarActionItem = {
  key: 'undo' | 'redo';
  label: string;
  disabled: boolean;
  onClick: () => void;
};

const toolGroups: ToolbarItem[][] = [
  [
    { key: 'hand', label: '\u5e73\u79fb' },
    { key: 'select', label: '\u9009\u62e9' },
    { key: 'eraser', label: '\u6a61\u76ae' },
  ],
  [
    { key: 'draw', label: '\u753b\u7b14' },
    { key: 'rectangle', label: '\u77e9\u5f62' },
    { key: 'ellipse', label: '\u5706\u5f62' },
    { key: 'arrow', label: '\u7bad\u5934' },
    { key: 'line', label: '\u76f4\u7ebf' },
  ],
  [
    { key: 'text', label: '\u6587\u672c' },
    { key: 'image', label: '\u63d2\u56fe' },
  ],
];

function TopToolbar({
  activeTool,
  onToolChange,
  onInsertImage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: TopToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const actionItems: ToolbarActionItem[] = [
    { key: 'undo', label: '\u64a4\u9500', disabled: !canUndo, onClick: onUndo },
    { key: 'redo', label: '\u91cd\u505a', disabled: !canRedo, onClick: onRedo },
  ];

  const handleImageClick = () => {
    onToolChange('image');
    imageInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await onInsertImage(file);
    event.target.value = '';
  };

  return (
    <div className="board-toolbar">
      {toolGroups.map((group, groupIndex) => (
        <div key={`tool-group-${groupIndex}`} className="board-toolbar__group">
          {group.map((item) => {
            const isActive = activeTool === item.key;
            const isImage = item.key === 'image';

            return (
              <button
                key={item.key}
                type="button"
                className={`board-toolbar__button ${isActive ? 'board-toolbar__button--active' : ''}`}
                onClick={isImage ? handleImageClick : () => onToolChange(item.key)}
              >
                <ToolbarIcon type={item.key} />
                <span className="board-toolbar__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="board-toolbar__group">
        {actionItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className="board-toolbar__button"
            onClick={item.onClick}
            disabled={item.disabled}
          >
            <ToolbarIcon type={item.key} />
            <span className="board-toolbar__label">{item.label}</span>
          </button>
        ))}
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="board-toolbar__input"
        onChange={handleFileChange}
      />
    </div>
  );
}

function ToolbarIcon({ type }: { type: ToolType | ToolbarActionItem['key'] }) {
  const icon = getToolbarIcon(type);
  return (
    <svg className="board-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
      {icon}
    </svg>
  );
}

function getToolbarIcon(type: ToolType | ToolbarActionItem['key']): ReactNode {
  switch (type) {
    case 'hand':
      return <path d="M8 11V5.8a1.4 1.4 0 0 1 2.8 0V10m0 0V4.6a1.4 1.4 0 0 1 2.8 0V10m0 .2V6a1.4 1.4 0 0 1 2.8 0v6.8m0-.2V9.2a1.4 1.4 0 0 1 2.8 0v4.2c0 4.2-2.7 6.6-6.3 6.6h-1.6c-2.2 0-3.5-.8-4.8-2.5L4.4 14.8a1.6 1.6 0 0 1 2.4-2.1L8 14" />;
    case 'select':
      return <path d="M6 4l11 7-5.1 1.2L9 18.8 6 4z" />;
    case 'eraser':
      return <path d="M4 15.2L13.2 6a2.4 2.4 0 0 1 3.4 0l1.4 1.4a2.4 2.4 0 0 1 0 3.4L10.8 18H5.7L4 16.3a.8.8 0 0 1 0-1.1zM10.2 9l4.8 4.8" />;
    case 'draw':
      return <path d="M5 19l1.3-4.8 9.6-9.6a2 2 0 0 1 2.8 2.8l-9.6 9.6L5 19zM13.5 7l3.5 3.5M7.4 16.6l2.2-2.2" />;
    case 'rectangle':
      return <rect x="5" y="6" width="14" height="12" rx="1.5" />;
    case 'ellipse':
      return <ellipse cx="12" cy="12" rx="7" ry="6" />;
    case 'arrow':
      return <path d="M5 17L17 5m0 0h-6m6 0v6" />;
    case 'line':
      return <path d="M5 18L19 6" />;
    case 'text':
      return <path d="M6 6h12M12 6v12M9 18h6" />;
    case 'image':
      return <path d="M5 6h14v12H5zM8 15l3-3 2 2 2.5-3L19 15M8.5 9.5h.1" />;
    case 'undo':
      return <path d="M9 7H5v4M5 7l5.2 5.2A5 5 0 1 0 13.8 4" />;
    case 'redo':
      return <path d="M15 7h4v4M19 7l-5.2 5.2A5 5 0 1 1 10.2 4" />;
    default:
      return null;
  }
}

export default TopToolbar;
