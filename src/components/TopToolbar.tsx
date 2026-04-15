import { useMemo, useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { ColorStyle, TextElement, TextStyle, ToolType } from '../whiteboard/types';
import { BOARD_COLOR_OPTIONS, TEXT_COLOR_OPTIONS, TEXT_FONT_OPTIONS, TEXT_SIZE_OPTIONS } from '../whiteboard/types';

type TopToolbarProps = {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onInsertImage: (file: File) => void | Promise<void>;
  selectedTextStyle: TextElement | null;
  selectedColorStyle: ColorStyle | null;
  onSelectedTextStyleChange: (patch: Partial<TextStyle>) => void;
  onSelectedColorChange: (patch: Partial<ColorStyle>) => void;
};

type ToolbarItem = {
  key: ToolType;
  label: string;
};

const toolbarItems: ToolbarItem[] = [
  { key: 'hand', label: '平移' },
  { key: 'select', label: '选择' },
  { key: 'rectangle', label: '矩形' },
  { key: 'ellipse', label: '圆形' },
  { key: 'arrow', label: '箭头' },
  { key: 'line', label: '直线' },
  { key: 'draw', label: '画笔' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '插图' },
  { key: 'eraser', label: '橡皮' },
];

function TopToolbar({
  activeTool,
  onToolChange,
  onInsertImage,
  selectedTextStyle,
  selectedColorStyle,
  onSelectedTextStyleChange,
  onSelectedColorChange,
}: TopToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const items = useMemo(() => toolbarItems, []);

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
      <div className="board-toolbar__primary">
        {items.map((item) => {
          const isActive = activeTool === item.key;
          const isImage = item.key === 'image';

          return (
            <button
              key={item.key}
              type="button"
              className={`board-toolbar__button ${isActive ? 'board-toolbar__button--active' : ''}`}
              onClick={isImage ? handleImageClick : () => onToolChange(item.key)}
            >
              <span className="board-toolbar__label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {selectedColorStyle && !selectedTextStyle && (
        <div className="board-toolbar__text-controls">
          <div className="board-toolbar__divider" />

          <div className="board-toolbar__palette" aria-label="????">
            {BOARD_COLOR_OPTIONS.map((color) => {
              const isActive = selectedColorStyle.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  className={`board-toolbar__color-swatch ${isActive ? 'board-toolbar__color-swatch--active' : ''}`}
                  style={{ '--swatch-color': color } as CSSProperties}
                  onClick={() => onSelectedColorChange({ color })}
                  aria-label={`?????? ${color}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {selectedTextStyle && (
        <div className="board-toolbar__text-controls">
          <div className="board-toolbar__divider" />

          <label className="board-toolbar__field">
            <span className="board-toolbar__field-label">字体</span>
            <select
              className="board-toolbar__select"
              value={selectedTextStyle.fontFamily}
              onChange={(event) => onSelectedTextStyleChange({ fontFamily: event.target.value })}
            >
              {TEXT_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="board-toolbar__field">
            <span className="board-toolbar__field-label">字号</span>
            <select
              className="board-toolbar__select board-toolbar__select--size"
              value={selectedTextStyle.fontSize}
              onChange={(event) => onSelectedTextStyleChange({ fontSize: Number(event.target.value) })}
            >
              {TEXT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <div className="board-toolbar__palette" aria-label="文本颜色">
            {TEXT_COLOR_OPTIONS.map((color) => {
              const isActive = selectedTextStyle.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  className={`board-toolbar__color-swatch ${isActive ? 'board-toolbar__color-swatch--active' : ''}`}
                  style={{ '--swatch-color': color } as CSSProperties}
                  onClick={() => onSelectedTextStyleChange({ color })}
                  aria-label={`切换文本颜色 ${color}`}
                />
              );
            })}
          </div>
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

export default TopToolbar;
