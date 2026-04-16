import { useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, ReactNode } from 'react';
import type { ColorStyle, LayerAction, TextStyle, ToolType } from '../whiteboard/types';
import { BOARD_COLOR_OPTIONS, TEXT_FONT_OPTIONS, TEXT_SIZE_OPTIONS } from '../whiteboard/types';

type TopToolbarProps = {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onInsertImage: (file: File) => void | Promise<void>;
  textStyle: TextStyle | null;
  colorStyle: ColorStyle | null;
  canUndo: boolean;
  canRedo: boolean;
  onTextStyleChange: (patch: Partial<TextStyle>) => void;
  onColorChange: (patch: Partial<ColorStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canArrangeLayers: boolean;
  onLayerAction: (action: LayerAction) => void;
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

type LayerActionItem = {
  key: LayerAction;
  label: string;
};

const layerActionItems: LayerActionItem[] = [
  { key: 'bring-forward', label: '\u4e0a\u79fb\u4e00\u5c42' },
  { key: 'send-backward', label: '\u4e0b\u79fb\u4e00\u5c42' },
  { key: 'bring-to-front', label: '\u7f6e\u4e8e\u9876\u5c42' },
  { key: 'send-to-back', label: '\u7f6e\u4e8e\u5e95\u5c42' },
];

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
  textStyle,
  colorStyle,
  canUndo,
  canRedo,
  onTextStyleChange,
  onColorChange,
  onUndo,
  onRedo,
  canArrangeLayers,
  onLayerAction,
}: TopToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
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

      {canArrangeLayers && (
        <div className="board-toolbar__group board-toolbar__group--layers">
          <div className="board-toolbar__layer-menu">
            <button
              type="button"
              className={`board-toolbar__button ${isLayerMenuOpen ? 'board-toolbar__button--active' : ''}`}
              onClick={() => setIsLayerMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isLayerMenuOpen}
            >
              <ToolbarIcon type="arrange" />
              <span className="board-toolbar__label">{'\u6392\u5217'}</span>
            </button>

            {isLayerMenuOpen && (
              <div className="board-toolbar__layer-popover" role="menu">
                {layerActionItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="board-toolbar__layer-action"
                    onClick={() => {
                      onLayerAction(item.key);
                      setIsLayerMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(colorStyle || textStyle) && (
        <div className="board-toolbar__properties">
          {textStyle && (
            <>
              <label className="board-toolbar__field">
                <span className="board-toolbar__field-label">{'\u5b57\u4f53'}</span>
                <select
                  className="board-toolbar__select"
                  value={textStyle.fontFamily}
                  onChange={(event) => onTextStyleChange({ fontFamily: event.target.value })}
                >
                  {TEXT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="board-toolbar__field">
                <span className="board-toolbar__field-label">{'\u5b57\u53f7'}</span>
                <select
                  className="board-toolbar__select board-toolbar__select--size"
                  value={textStyle.fontSize}
                  onChange={(event) => onTextStyleChange({ fontSize: Number(event.target.value) })}
                >
                  {TEXT_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {colorStyle && (
            <div className="board-toolbar__palette" aria-label={'\u989c\u8272\u9009\u62e9'}>
              {BOARD_COLOR_OPTIONS.map((color) => {
                const isActive = colorStyle.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    className={`board-toolbar__color-swatch ${isActive ? 'board-toolbar__color-swatch--active' : ''}`}
                    style={{ '--swatch-color': color } as CSSProperties}
                    onClick={() => onColorChange({ color })}
                    aria-label={`\u5207\u6362\u989c\u8272 ${color}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

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

function ToolbarIcon({ type }: { type: ToolType | 'undo' | 'redo' | 'arrange' }) {
  const icon = getToolbarIcon(type);
  return (
    <svg className="board-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
      {icon}
    </svg>
  );
}

function getToolbarIcon(type: ToolType | 'undo' | 'redo' | 'arrange'): ReactNode {
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
    case 'arrange':
      return <path d="M7 8h10M7 12h10M7 16h10M10 5l-3 3 3 3M14 19l3-3-3-3" />;
    default:
      return null;
  }
}

export default TopToolbar;
