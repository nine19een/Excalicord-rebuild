import { useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { ToolType } from '../whiteboard/types';

type TopToolbarProps = {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onInsertImage: (file: File) => void | Promise<void>;
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

function TopToolbar({ activeTool, onToolChange, onInsertImage }: TopToolbarProps) {
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


