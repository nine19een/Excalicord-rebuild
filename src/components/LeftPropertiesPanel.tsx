import { useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { ColorStyle, LayerAction, TextStyle, ToolType } from '../whiteboard/types';
import {
  BOARD_COLOR_OPTIONS,
  DEFAULT_BOARD_COLOR,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TEXT_STYLE,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  TEXT_FONT_OPTIONS,
  TEXT_SIZE_OPTIONS,
} from '../whiteboard/types';

type StyleChangeOptions = {
  commit?: boolean;
  target?: 'selection' | 'tool';
};

type LeftPropertiesPanelProps = {
  activeTool: ToolType;
  selectedCount: number;
  hasTextSelection: boolean;
  textStyle: TextStyle | null;
  colorStyle: ColorStyle | null;
  onTextStyleChange: (patch: Partial<TextStyle>) => void;
  onColorChange: (patch: Partial<ColorStyle>, options?: StyleChangeOptions) => void;
  strokeWidth: number | null;
  onStrokeWidthChange: (value: number, options?: StyleChangeOptions) => void;
  canTransformSelection: boolean;
  onRotateSelection: (degrees: number) => void;
  onFlipSelection: (axis: 'horizontal' | 'vertical') => void;
  canArrangeLayers: boolean;
  onLayerAction: (action: LayerAction) => void;
};

type PanelAction = {
  key: string;
  label: string;
  title: string;
  onClick: () => void;
};

const EXTENDED_COLOR_OPTIONS = Array.from(
  new Set([
    ...BOARD_COLOR_OPTIONS,
    '#6b7280',
    '#ffffff',
    '#facc15',
    '#06b6d4',
    '#ec4899',
  ])
);

const STYLE_TOOL_TYPES = new Set<ToolType>(['draw', 'rectangle', 'ellipse', 'line', 'arrow', 'text']);
const CREATION_TOOL_TYPES = new Set<ToolType>(['draw', 'rectangle', 'ellipse', 'line', 'arrow', 'text', 'image']);

function LeftPropertiesPanel({
  activeTool,
  selectedCount,
  hasTextSelection,
  textStyle,
  colorStyle,
  onTextStyleChange,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  canTransformSelection,
  onRotateSelection,
  onFlipSelection,
  canArrangeLayers,
  onLayerAction,
}: LeftPropertiesPanelProps) {
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const opacityDragRef = useRef(false);
  const latestOpacityRef = useRef(1);
  const strokeWidthDragRef = useRef(false);
  const latestStrokeWidthRef = useRef(DEFAULT_STROKE_WIDTH);
  const hasSelection = selectedCount > 0;
  const isToolMode = !hasSelection && CREATION_TOOL_TYPES.has(activeTool);
  const showTextControls = hasSelection
    ? selectedCount === 1 && hasTextSelection && Boolean(textStyle)
    : activeTool === 'text' && Boolean(textStyle);
  const showStyleControls = hasSelection ? Boolean(colorStyle) : STYLE_TOOL_TYPES.has(activeTool) && Boolean(colorStyle);
  const showSelectionActions = hasSelection;
  const effectiveTextStyle = textStyle ?? DEFAULT_TEXT_STYLE;
  const activeColor = colorStyle?.color ?? DEFAULT_BOARD_COLOR;
  const opacityPercent = Math.round(clampOpacity(colorStyle?.opacity) * 100);
  const strokeWidthValue = strokeWidth === null ? DEFAULT_STROKE_WIDTH : clampStrokeWidth(strokeWidth);
  const showStrokeWidthControl = strokeWidth !== null;
  const styleTarget = hasSelection ? 'selection' : 'tool';
  const transformActions: PanelAction[] = [
    { key: 'rotate-left', label: '\u5de6\u8f6c', title: '\u5de6\u8f6c 90\u00b0', onClick: () => onRotateSelection(-90) },
    { key: 'rotate-right', label: '\u53f3\u8f6c', title: '\u53f3\u8f6c 90\u00b0', onClick: () => onRotateSelection(90) },
    { key: 'flip-horizontal', label: '\u6c34\u5e73', title: '\u6c34\u5e73\u955c\u50cf', onClick: () => onFlipSelection('horizontal') },
    { key: 'flip-vertical', label: '\u5782\u76f4', title: '\u5782\u76f4\u955c\u50cf', onClick: () => onFlipSelection('vertical') },
  ];
  const layerActions: Array<{ key: LayerAction; label: string; title: string }> = [
    { key: 'bring-forward', label: '\u4e0a\u79fb', title: '\u4e0a\u79fb\u4e00\u5c42' },
    { key: 'send-backward', label: '\u4e0b\u79fb', title: '\u4e0b\u79fb\u4e00\u5c42' },
    { key: 'bring-to-front', label: '\u7f6e\u9876', title: '\u7f6e\u4e8e\u9876\u5c42' },
    { key: 'send-to-back', label: '\u7f6e\u5e95', title: '\u7f6e\u4e8e\u5e95\u5c42' },
  ];

  const handleCustomColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onColorChange({ color: event.target.value }, { target: styleTarget, commit: true });
  };

  const handleOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextOpacity = Number(event.target.value) / 100;
    latestOpacityRef.current = nextOpacity;
    onColorChange({ opacity: nextOpacity }, { target: styleTarget, commit: false });
  };

  const finishOpacityChange = () => {
    if (!opacityDragRef.current) {
      return;
    }

    opacityDragRef.current = false;
    onColorChange({ opacity: latestOpacityRef.current }, { target: styleTarget, commit: true });
  };

  const handleStrokeWidthChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextStrokeWidth = clampStrokeWidth(Number(event.target.value));
    latestStrokeWidthRef.current = nextStrokeWidth;
    onStrokeWidthChange(nextStrokeWidth, { target: styleTarget, commit: false });
  };

  const finishStrokeWidthChange = () => {
    if (!strokeWidthDragRef.current) {
      return;
    }

    strokeWidthDragRef.current = false;
    onStrokeWidthChange(latestStrokeWidthRef.current, { target: styleTarget, commit: true });
  };

  const renderColorPalette = () => (
    <div className="board-properties-panel__palette" aria-label="\u989c\u8272\u9009\u62e9">
      {EXTENDED_COLOR_OPTIONS.map((color) => {
        const isActive = activeColor === color;
        return (
          <button
            key={color}
            type="button"
            className={`board-properties-panel__color-swatch ${isActive ? 'board-properties-panel__color-swatch--active' : ''}`}
            style={{ '--swatch-color': color } as CSSProperties}
            onClick={() => onColorChange({ color }, { target: styleTarget, commit: true })}
            aria-label={`\u5207\u6362\u989c\u8272 ${color}`}
          />
        );
      })}
      <button
        type="button"
        className="board-properties-panel__color-swatch board-properties-panel__color-swatch--custom"
        onClick={() => customColorInputRef.current?.click()}
        aria-label="\u81ea\u5b9a\u4e49\u989c\u8272"
        title="\u81ea\u5b9a\u4e49\u989c\u8272"
      >
        +
      </button>
      <input
        ref={customColorInputRef}
        type="color"
        className="board-properties-panel__color-input"
        value={activeColor}
        onChange={handleCustomColorChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );

  return (
    <aside className="board-properties-panel" aria-label="\u5c5e\u6027\u680f">
      <div className="board-properties-panel__header">
        <h2 className="board-properties-panel__heading">{hasSelection ? `\u5c5e\u6027` : isToolMode ? `\u5de5\u5177` : `\u5c5e\u6027`}</h2>
        {isToolMode ? <p className="board-properties-panel__tool-name">{getToolDisplayName(activeTool)}</p> : null}
      </div>

      {!hasSelection && !isToolMode ? (
        <div className="board-properties-panel__empty">
          <p className="board-properties-panel__empty-title">{`\u9009\u62e9\u5bf9\u8c61\u4ee5\u7f16\u8f91\u5c5e\u6027`}</p>
          <p className="board-properties-panel__empty-description">
            {`\u4e5f\u53ef\u4ee5\u5207\u6362\u5230\u753b\u7b14\u3001\u56fe\u5f62\u6216\u6587\u672c\u5de5\u5177\u6765\u8bbe\u7f6e\u9ed8\u8ba4\u6837\u5f0f\u3002`}
          </p>
        </div>
      ) : (
        <>
          {showTextControls ? (
            <section className="board-properties-panel__section">
              <h3 className="board-properties-panel__title">{`\u6587\u5b57`}</h3>
              <label className="board-properties-panel__field">
                <span className="board-properties-panel__field-label">{`\u5b57\u4f53`}</span>
                <select
                  className="board-properties-panel__select"
                  value={effectiveTextStyle.fontFamily}
                  onChange={(event) => onTextStyleChange({ fontFamily: event.target.value })}
                >
                  {TEXT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="board-properties-panel__field">
                <span className="board-properties-panel__field-label">{`\u5b57\u53f7`}</span>
                <select
                  className="board-properties-panel__select"
                  value={effectiveTextStyle.fontSize}
                  onChange={(event) => onTextStyleChange({ fontSize: Number(event.target.value) })}
                >
                  {TEXT_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          {showStyleControls ? (
            <section className="board-properties-panel__section">
              <h3 className="board-properties-panel__title">{`\u6837\u5f0f`}</h3>
              {colorStyle?.color !== undefined ? renderColorPalette() : null}
              <label className="board-properties-panel__field">
                <span className="board-properties-panel__field-label">{`\u900f\u660e\u5ea6`}</span>
                <input
                  className="board-properties-panel__range"
                  type="range"
                  min={10}
                  max={100}
                  value={opacityPercent}
                  onChange={handleOpacityChange}
                  onPointerDown={() => {
                    opacityDragRef.current = true;
                    latestOpacityRef.current = opacityPercent / 100;
                  }}
                  onPointerUp={finishOpacityChange}
                  onPointerCancel={finishOpacityChange}
                  onBlur={finishOpacityChange}
                  onKeyUp={() => onColorChange({ opacity: latestOpacityRef.current }, { target: styleTarget, commit: true })}
                  aria-label="\u900f\u660e\u5ea6"
                />
              </label>
              {showStrokeWidthControl ? (
                <label className="board-properties-panel__field">
                  <span className="board-properties-panel__field-label">{`\u7ebf\u5bbd`}</span>
                  <input
                    className="board-properties-panel__range"
                    type="range"
                    min={MIN_STROKE_WIDTH}
                    max={MAX_STROKE_WIDTH}
                    value={strokeWidthValue}
                    onChange={handleStrokeWidthChange}
                    onPointerDown={() => {
                      strokeWidthDragRef.current = true;
                      latestStrokeWidthRef.current = strokeWidthValue;
                    }}
                    onPointerUp={finishStrokeWidthChange}
                    onPointerCancel={finishStrokeWidthChange}
                    onBlur={finishStrokeWidthChange}
                    onKeyUp={() => onStrokeWidthChange(latestStrokeWidthRef.current, { target: styleTarget, commit: true })}
                    aria-label="\u7ebf\u5bbd"
                  />
                </label>
              ) : null}
            </section>
          ) : null}

          {isToolMode && !showTextControls && !showStyleControls ? (
            <div className="board-properties-panel__empty board-properties-panel__empty--compact">
              <p className="board-properties-panel__empty-description">{`\u5f53\u524d\u5de5\u5177\u6682\u65e0\u53ef\u8c03\u6574\u7684\u9ed8\u8ba4\u5c5e\u6027\u3002`}</p>
            </div>
          ) : null}

          {showSelectionActions ? (
            <>
              <section className="board-properties-panel__section">
                <h3 className="board-properties-panel__title">{`\u53d8\u6362`}</h3>
                <div className="board-properties-panel__action-grid">
                  {transformActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      className="board-properties-panel__action"
                      onClick={action.onClick}
                      disabled={!canTransformSelection}
                      title={action.title}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="board-properties-panel__section">
                <h3 className="board-properties-panel__title">{`\u6392\u5217`}</h3>
                <div className="board-properties-panel__action-grid">
                  {layerActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      className="board-properties-panel__action"
                      onClick={() => onLayerAction(action.key)}
                      disabled={!canArrangeLayers}
                      title={action.title}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}

function clampOpacity(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 1;
}

function clampStrokeWidth(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, Math.round(value)))
    : DEFAULT_STROKE_WIDTH;
}

function getToolDisplayName(tool: ToolType) {
  switch (tool) {
    case 'draw':
      return '\u753b\u7b14';
    case 'rectangle':
      return '\u77e9\u5f62';
    case 'ellipse':
      return '\u5706\u5f62';
    case 'line':
      return '\u76f4\u7ebf';
    case 'arrow':
      return '\u7bad\u5934';
    case 'text':
      return '\u6587\u672c';
    case 'image':
      return '\u63d2\u56fe';
    default:
      return '';
  }
}

export default LeftPropertiesPanel;
