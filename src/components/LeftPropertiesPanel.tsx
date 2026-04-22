import { useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { ColorStyle, LayerAction, StrokeStyle, TextStyle, ToolType } from '../whiteboard/types';
import {
  BOARD_COLOR_OPTIONS,
  DEFAULT_BOARD_COLOR,
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TEXT_STYLE,
  MAX_CORNER_RADIUS,
  MAX_STROKE_WIDTH,
  MIN_CORNER_RADIUS,
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
  strokeStyle: StrokeStyle | null;
  fillColor: string | null | undefined;
  cornerRadius: number | null;
  onStrokeWidthChange: (value: number, options?: StyleChangeOptions) => void;
  onStrokeStyleChange: (value: StrokeStyle, options?: StyleChangeOptions) => void;
  onFillColorChange: (value: string | null, options?: StyleChangeOptions) => void;
  onCornerRadiusChange: (value: number, options?: StyleChangeOptions) => void;
  canTransformSelection: boolean;
  onRotateSelection: (degrees: number) => void;
  onFlipSelection: (axis: 'horizontal' | 'vertical') => void;
  canArrangeLayers: boolean;
  onLayerAction: (action: LayerAction) => void;
};

type PanelIconName =
  | 'rotate-left'
  | 'rotate-right'
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'bring-forward'
  | 'send-backward'
  | 'bring-to-front'
  | 'send-to-back';

type PanelAction = {
  key: string;
  label: string;
  title: string;
  icon: PanelIconName;
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
const STROKE_STYLE_OPTIONS: Array<{ value: StrokeStyle; label: string }> = [
  { value: 'solid', label: '\u5b9e\u7ebf' },
  { value: 'dashed', label: '\u865a\u7ebf' },
  { value: 'dotted', label: '\u70b9\u7ebf' },
];

function LeftPropertiesPanel({
  activeTool,
  selectedCount,
  hasTextSelection,
  textStyle,
  colorStyle,
  onTextStyleChange,
  onColorChange,
  strokeWidth,
  strokeStyle,
  fillColor,
  cornerRadius,
  onStrokeWidthChange,
  onStrokeStyleChange,
  onFillColorChange,
  onCornerRadiusChange,
  canTransformSelection,
  onRotateSelection,
  onFlipSelection,
  canArrangeLayers,
  onLayerAction,
}: LeftPropertiesPanelProps) {
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const customFillColorInputRef = useRef<HTMLInputElement | null>(null);
  const opacityDragRef = useRef(false);
  const latestOpacityRef = useRef(1);
  const strokeWidthDragRef = useRef(false);
  const latestStrokeWidthRef = useRef(DEFAULT_STROKE_WIDTH);
  const cornerRadiusDragRef = useRef(false);
  const latestCornerRadiusRef = useRef(DEFAULT_CORNER_RADIUS);
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
  const cornerRadiusValue = cornerRadius === null ? DEFAULT_CORNER_RADIUS : clampCornerRadius(cornerRadius);
  const strokeStyleValue = strokeStyle ?? DEFAULT_STROKE_STYLE;
  const fillColorValue = normalizeFillColor(fillColor);
  const showFillColorControl = fillColor !== undefined;
  const showStrokeStyleControl = strokeStyle !== null;
  const showStrokeWidthControl = strokeWidth !== null;
  const showCornerRadiusControl = cornerRadius !== null;
  const styleTarget = hasSelection ? 'selection' : 'tool';
  const transformActions: PanelAction[] = [
    { key: 'rotate-left', label: '\u5de6\u8f6c', title: '\u5de6\u8f6c 90\u00b0', icon: 'rotate-left', onClick: () => onRotateSelection(-90) },
    { key: 'rotate-right', label: '\u53f3\u8f6c', title: '\u53f3\u8f6c 90\u00b0', icon: 'rotate-right', onClick: () => onRotateSelection(90) },
    { key: 'flip-horizontal', label: '\u6c34\u5e73\u7ffb\u8f6c', title: '\u6c34\u5e73\u7ffb\u8f6c', icon: 'flip-horizontal', onClick: () => onFlipSelection('horizontal') },
    { key: 'flip-vertical', label: '\u5782\u76f4\u7ffb\u8f6c', title: '\u5782\u76f4\u7ffb\u8f6c', icon: 'flip-vertical', onClick: () => onFlipSelection('vertical') },
  ];
  const layerActions: Array<{ key: LayerAction; label: string; title: string; icon: PanelIconName }> = [
    { key: 'bring-forward', label: '\u4e0a\u79fb\u4e00\u5c42', title: '\u4e0a\u79fb\u4e00\u5c42', icon: 'bring-forward' },
    { key: 'send-backward', label: '\u4e0b\u79fb\u4e00\u5c42', title: '\u4e0b\u79fb\u4e00\u5c42', icon: 'send-backward' },
    { key: 'bring-to-front', label: '\u7f6e\u4e8e\u9876\u5c42', title: '\u7f6e\u4e8e\u9876\u5c42', icon: 'bring-to-front' },
    { key: 'send-to-back', label: '\u7f6e\u4e8e\u5e95\u5c42', title: '\u7f6e\u4e8e\u5e95\u5c42', icon: 'send-to-back' },
  ];
  const handleCustomColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onColorChange({ color: event.target.value }, { target: styleTarget, commit: true });
  };

  const handleCustomFillColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFillColorChange(event.target.value, { target: styleTarget, commit: true });
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

  const handleCornerRadiusChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextCornerRadius = clampCornerRadius(Number(event.target.value));
    latestCornerRadiusRef.current = nextCornerRadius;
    onCornerRadiusChange(nextCornerRadius, { target: styleTarget, commit: false });
  };

  const finishCornerRadiusChange = () => {
    if (!cornerRadiusDragRef.current) {
      return;
    }

    cornerRadiusDragRef.current = false;
    onCornerRadiusChange(latestCornerRadiusRef.current, { target: styleTarget, commit: true });
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
  const renderFillPalette = () => (
    <div className="board-properties-panel__palette" aria-label="\u586b\u5145\u8272\u9009\u62e9">
      <button
        type="button"
        className={`board-properties-panel__color-swatch board-properties-panel__color-swatch--none ${fillColorValue === null ? 'board-properties-panel__color-swatch--active' : ''}`}
        onClick={() => onFillColorChange(null, { target: styleTarget, commit: true })}
        aria-label="\u65e0\u586b\u5145"
        title="\u65e0\u586b\u5145"
      >
      </button>
      {EXTENDED_COLOR_OPTIONS.map((color) => {
        const isActive = fillColorValue === color;
        return (
          <button
            key={`fill-${color}`}
            type="button"
            className={`board-properties-panel__color-swatch ${isActive ? 'board-properties-panel__color-swatch--active' : ''}`}
            style={{ '--swatch-color': color } as CSSProperties}
            onClick={() => onFillColorChange(color, { target: styleTarget, commit: true })}
            aria-label={`\u5207\u6362\u586b\u5145\u8272 ${color}`}
          />
        );
      })}
      <button
        type="button"
        className="board-properties-panel__color-swatch board-properties-panel__color-swatch--custom"
        onClick={() => customFillColorInputRef.current?.click()}
        aria-label="\u81ea\u5b9a\u4e49\u586b\u5145\u8272"
        title="\u81ea\u5b9a\u4e49\u586b\u5145\u8272"
      >
        +
      </button>
      <input
        ref={customFillColorInputRef}
        type="color"
        className="board-properties-panel__color-input"
        value={fillColorValue ?? DEFAULT_BOARD_COLOR}
        onChange={handleCustomFillColorChange}
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
              {colorStyle?.color !== undefined ? (
                <div className="board-properties-panel__field board-properties-panel__subfield">
                  <span className="board-properties-panel__field-label">{`\u8fb9\u6846`}</span>
                  {renderColorPalette()}
                </div>
              ) : null}
              {showFillColorControl ? (
                <div className="board-properties-panel__field board-properties-panel__subfield">
                  <span className="board-properties-panel__field-label">{`\u586b\u5145`}</span>
                  {renderFillPalette()}
                </div>
              ) : null}
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
              {showCornerRadiusControl ? (
                <label className="board-properties-panel__field">
                  <span className="board-properties-panel__field-label">{`\u5706\u89d2`}</span>
                  <input
                    className="board-properties-panel__range"
                    type="range"
                    min={MIN_CORNER_RADIUS}
                    max={MAX_CORNER_RADIUS}
                    value={cornerRadiusValue}
                    onChange={handleCornerRadiusChange}
                    onPointerDown={() => {
                      cornerRadiusDragRef.current = true;
                      latestCornerRadiusRef.current = cornerRadiusValue;
                    }}
                    onPointerUp={finishCornerRadiusChange}
                    onPointerCancel={finishCornerRadiusChange}
                    onBlur={finishCornerRadiusChange}
                    onKeyUp={() => onCornerRadiusChange(latestCornerRadiusRef.current, { target: styleTarget, commit: true })}
                    aria-label="\u5706\u89d2"
                  />
                </label>
              ) : null}
              {showStrokeStyleControl ? (
                <div className="board-properties-panel__field">
                  <span className="board-properties-panel__field-label">{`\u7ebf\u6761\u6837\u5f0f`}</span>
                  <div className="board-properties-panel__segmented" role="group" aria-label="\u7ebf\u6761\u6837\u5f0f">
                    {STROKE_STYLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`board-properties-panel__segment board-properties-panel__stroke-style-button ${strokeStyleValue === option.value ? 'board-properties-panel__segment--active' : ''}`}
                        onClick={() => onStrokeStyleChange(option.value, { target: styleTarget, commit: true })}
                        title={option.label}
                      >
                        <span className={`board-properties-panel__stroke-preview board-properties-panel__stroke-preview--${option.value}`} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
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
                      {renderPanelIcon(action.icon)}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="board-properties-panel__section">
                <h3 className="board-properties-panel__title">{`\u56fe\u5c42`}</h3>
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
                      {renderPanelIcon(action.icon)}
                      <span>{action.label}</span>
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

function renderPanelIcon(name: PanelIconName) {
  switch (name) {
    case 'rotate-left':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 7H4V3" />
          <path d="M5.2 7.2A7 7 0 1 1 4 11" />
          <path d="M12 9v4l3 2" />
        </svg>
      );
    case 'rotate-right':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 7h4V3" />
          <path d="M18.8 7.2A7 7 0 1 0 20 11" />
          <path d="M12 9v4l-3 2" />
        </svg>
      );
    case 'flip-horizontal':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16" />
          <path d="M4 7l5 5-5 5V7Z" />
          <path d="M20 7l-5 5 5 5V7Z" />
        </svg>
      );
    case 'flip-vertical':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h16" />
          <path d="M7 4l5 5 5-5H7Z" />
          <path d="M7 20l5-5 5 5H7Z" />
        </svg>
      );
    case 'bring-forward':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="9" width="9" height="9" rx="1.5" />
          <rect x="10" y="5" width="8" height="8" rx="1.5" />
        </svg>
      );
    case 'send-backward':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="6" width="9" height="9" rx="1.5" />
          <rect x="5" y="10" width="8" height="8" rx="1.5" />
        </svg>
      );
    case 'bring-to-front':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v7" />
          <path d="M8.5 7.5 12 4l3.5 3.5" />
          <rect x="5" y="12" width="14" height="7" rx="1.5" />
        </svg>
      );
    case 'send-to-back':
      return (
        <svg className="board-properties-panel__action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20v-7" />
          <path d="M8.5 16.5 12 20l3.5-3.5" />
          <rect x="5" y="5" width="14" height="7" rx="1.5" />
        </svg>
      );
    default:
      return null;
  }
}
function clampOpacity(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 1;
}

function clampStrokeWidth(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, Math.round(value)))
    : DEFAULT_STROKE_WIDTH;
}

function clampCornerRadius(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_CORNER_RADIUS, Math.max(MIN_CORNER_RADIUS, Math.round(value)))
    : DEFAULT_CORNER_RADIUS;
}


function normalizeFillColor(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return DEFAULT_FILL_COLOR;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none' || normalized === 'transparent' ? DEFAULT_FILL_COLOR : value;
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
