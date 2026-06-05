import { useMemo, useRef, useState } from 'react';
import AspectRatioSection from './AspectRatioSection';
import BackgroundSection from './BackgroundSection';
import CameraSection from './CameraSection';
import type { CameraSettings, CanvasBackgroundPattern, MediaDeviceChoice, RecordingVisualSettings } from '../cameraTypes';
import PreviewPanel from './PreviewPanel';
import { getCanvasPatternColor, normalizeCanvasBackgroundColor } from '../canvasBackground';
import { aspectRatioOptions } from '../mockOptions';
import { frameBackgroundPresets } from '../frameBackgrounds';
import { DEFAULT_SHORTCUTS, SHORTCUT_SECTIONS } from '../shortcuts';
import type { ShortcutAction, ShortcutMap } from '../shortcuts';

const CANVAS_PADDING_MAX = 80;
const CANVAS_BACKGROUND_SPACING_MIN = 40;
const CANVAS_BACKGROUND_SPACING_MAX = 140;

const canvasBackgroundColors = [
  { label: '近白', value: '#fbfaf6' },
  { label: '米黄', value: '#f5e6bd' },
  { label: '薄荷', value: '#e4f0ec' },
  { label: '淡粉', value: '#f0e5e1' },
  { label: '深色', value: '#242424' },
];

type SettingsTabId = 'canvas' | 'background' | 'camera' | 'cursor' | 'shortcuts';

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'canvas', label: '画布' },
  { id: 'background', label: '背景' },
  { id: 'camera', label: '摄像头' },
  { id: 'cursor', label: '光标' },
  { id: 'shortcuts', label: '快捷键' },
];

const canvasBackgroundPatterns: Array<{ label: string; value: CanvasBackgroundPattern }> = [
  { label: '无', value: 'none' },
  { label: '单线', value: 'ruled' },
  { label: '网格', value: 'grid' },
  { label: '格点', value: 'dots' },
];

type RecordingSettingsModalProps = {
  activeAspect: string;
  onAspectChange: (aspect: string) => void;
  activeBackgroundId: string;
  onBackgroundChange: (backgroundId: string) => void;
  recordingVisualSettings: RecordingVisualSettings;
  onRecordingVisualSettingsChange: (patch: Partial<RecordingVisualSettings>) => void;
  cameraSettings: CameraSettings;
  onCameraSettingsChange: (patch: Partial<CameraSettings>) => void;
  videoDevices: MediaDeviceChoice[];
  audioDevices: MediaDeviceChoice[];
  cameraStream: MediaStream | null;
  mediaError: string | null;
  onRefreshDevices: () => void;
  shortcutSettings: ShortcutMap;
  onShortcutChange: (action: ShortcutAction, value: string) => void;
  onShortcutReset: () => void;
  onClose?: () => void;
};

function RecordingSettingsModal({
  activeAspect,
  onAspectChange,
  activeBackgroundId,
  onBackgroundChange,
  recordingVisualSettings,
  onRecordingVisualSettingsChange,
  cameraSettings,
  onCameraSettingsChange,
  videoDevices,
  audioDevices,
  cameraStream,
  mediaError,
  onRefreshDevices,
  shortcutSettings,
  onShortcutChange,
  onShortcutReset,
  onClose,
}: RecordingSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('canvas');
  const selectedBackground = useMemo(
    () => frameBackgroundPresets.find((option) => option.id === activeBackgroundId) ?? null,
    [activeBackgroundId]
  );

  const activeAspectItem = aspectRatioOptions.find((option) => option.key === activeAspect) ?? aspectRatioOptions[4];

  const handleRandomBackground = () => {
    const current = frameBackgroundPresets[Math.floor(Math.random() * frameBackgroundPresets.length)];
    if (current) {
      onBackgroundChange(current.id);
    }
  };

  return (
    <div className="modal-shell">
      <div className="modal-layout">
        <section className="preview-column">
          <div className="preview-content-group">
            <PreviewPanel
              aspectRatio={activeAspectItem.ratio}
              background={selectedBackground}
              visualSettings={recordingVisualSettings}
              cameraSettings={cameraSettings}
              cameraStream={cameraStream}
            />
          </div>
        </section>

        <section className="settings-column">
          <div className="settings-header">
            <div className="settings-header-row">
              <div className="settings-title">录制设置</div>
              <button type="button" className="close-button" aria-label="关闭" onClick={onClose}>
                ×
              </button>
            </div>
          </div>

          <div className="settings-tabs" role="tablist" aria-label="设置分类">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'settings-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content">
            <div className="settings-scroll">
              {activeTab === 'canvas' ? (
                <div className="settings-group settings-group--section">
                  <CanvasSection
                    activeAspect={activeAspect}
                    onAspectChange={onAspectChange}
                    settings={recordingVisualSettings}
                    onChange={onRecordingVisualSettingsChange}
                    showTitle={false}
                  />
                </div>
              ) : null}

              {activeTab === 'background' ? (
                <div className="settings-group settings-group--section">
                  <BackgroundSection
                    options={frameBackgroundPresets}
                    selectedBackgroundId={activeBackgroundId}
                    onSelectBackground={onBackgroundChange}
                    onRandomSelect={handleRandomBackground}
                    showTitle={false}
                  />
                </div>
              ) : null}

              {activeTab === 'camera' ? (
                <div className="settings-group settings-group--section">
                  <CameraSection
                    settings={cameraSettings}
                    onChange={onCameraSettingsChange}
                    videoDevices={videoDevices}
                    audioDevices={audioDevices}
                    mediaError={mediaError}
                    onRefreshDevices={onRefreshDevices}
                    showTitle={false}
                  />
                </div>
              ) : null}

              {activeTab === 'cursor' ? (
                <div className="settings-group settings-group--section">
                  <CursorEffectSection
                    settings={recordingVisualSettings}
                    onChange={onRecordingVisualSettingsChange}
                    showTitle={false}
                  />
                </div>
              ) : null}

              {activeTab === 'shortcuts' ? (
                <div className="settings-group settings-group--section">
                  <ShortcutSettingsSection
                    shortcutSettings={shortcutSettings}
                    onShortcutChange={onShortcutChange}
                    onShortcutReset={onShortcutReset}
                    showTitle={false}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CanvasSection({
  activeAspect,
  onAspectChange,
  settings,
  onChange,
  showTitle = true,
}: {
  activeAspect: string;
  onAspectChange: (aspect: string) => void;
  settings: RecordingVisualSettings;
  onChange: (patch: Partial<RecordingVisualSettings>) => void;
  showTitle?: boolean;
}) {
  const canvasPaddingValue = Math.min(settings.canvasPadding, CANVAS_PADDING_MAX);
  const canvasBackgroundSpacing = clampBackgroundSpacing(settings.canvasBackgroundSpacing);
  const selectedBackgroundColor = (settings.canvasBackgroundColor || '#fbfaf6').toLowerCase();
  const selectedPattern = settings.canvasBackgroundPattern ?? 'none';
  const previewBackgroundSpacing = Math.max(8, Math.min(12, canvasBackgroundSpacing * 0.15));
  const spacingVisible = selectedPattern !== 'none';
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const isPresetColorSelected = canvasBackgroundColors.some((color) => color.value === selectedBackgroundColor);

  return (
    <div className="section-block">
      {showTitle ? <div className="section-title">画布</div> : null}
      <div className="settings-subsection">
        <div className="settings-subsection-title">画布比例</div>
        <AspectRatioSection
          options={aspectRatioOptions}
          selectedKey={activeAspect}
          onSelect={onAspectChange}
          showTitle={false}
        />
      </div>
      <div className="settings-subsection">
        <div className="settings-field-label">画布颜色</div>
        <div className="canvas-background-color-grid" role="group" aria-label="画布颜色">
          {canvasBackgroundColors.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`canvas-background-color ${selectedBackgroundColor === color.value ? 'canvas-background-color--active' : ''}`}
              style={{ background: color.value }}
              onClick={() => onChange({ canvasBackgroundColor: color.value })}
              aria-label={color.label}
              title={color.label}
            />
          ))}
          <button
            type="button"
            className={`canvas-background-color canvas-background-color--custom ${!isPresetColorSelected ? 'canvas-background-color--active' : ''}`}
            onClick={() => customColorInputRef.current?.click()}
            aria-label="自定义画布颜色"
            title="自定义画布颜色"
          >
            <span>+</span>
            <input
              ref={customColorInputRef}
              type="color"
              value={selectedBackgroundColor}
              onChange={(event) => onChange({ canvasBackgroundColor: event.target.value })}
              aria-label="自定义画布颜色"
            />
          </button>
        </div>

        <div className="settings-field-label">画布样式</div>
        <div className="canvas-pattern-grid" role="group" aria-label="画布样式">
          {canvasBackgroundPatterns.map((pattern) => (
            <button
              key={pattern.value}
              type="button"
              className={`canvas-pattern-option canvas-pattern-option--${pattern.value} ${selectedPattern === pattern.value ? 'canvas-pattern-option--active' : ''}`}
              onClick={() => onChange({ canvasBackgroundPattern: pattern.value })}
            >
              <span
                className="canvas-pattern-preview-card"
                style={getCanvasBackgroundPreviewCss(selectedBackgroundColor, pattern.value, previewBackgroundSpacing)}
                aria-hidden="true"
              />
              <span className="canvas-pattern-label">{pattern.label}</span>
            </button>
          ))}
        </div>

        {spacingVisible ? (
          <label className="camera-setting-field camera-setting-field--range canvas-background-spacing">
            <span className="setting-field-title">间距 - {canvasBackgroundSpacing}px</span>
            <span>间距</span>
            <input
              type="range"
              min={CANVAS_BACKGROUND_SPACING_MIN}
              max={CANVAS_BACKGROUND_SPACING_MAX}
              step="2"
              value={canvasBackgroundSpacing}
              onChange={(event) => onChange({ canvasBackgroundSpacing: Number(event.target.value) })}
            />
            <strong>{canvasBackgroundSpacing}px</strong>
          </label>
        ) : null}
      </div>
      <div className="settings-subsection">
        <div className="settings-subsection-title">版式</div>
        <label className="camera-setting-field camera-setting-field--range">
          <span className="setting-field-title">画布圆角半径 - {settings.canvasRadius}px</span>
          <span>画布圆角半径</span>
          <input
            type="range"
            min="0"
            max="80"
            step="4"
            value={settings.canvasRadius}
            onChange={(event) => onChange({ canvasRadius: Number(event.target.value) })}
          />
          <strong>{settings.canvasRadius}px</strong>
        </label>
        <label className="camera-setting-field camera-setting-field--range">
          <span className="setting-field-title">画布边距 - {canvasPaddingValue}px</span>
          <span>画布边距</span>
          <input
            type="range"
            min="0"
            max={CANVAS_PADDING_MAX}
            step="8"
            value={canvasPaddingValue}
            onChange={(event) => onChange({ canvasPadding: Number(event.target.value) })}
          />
          <strong>{canvasPaddingValue}px</strong>
        </label>
      </div>
    </div>
  );
}

function CursorEffectSection({
  settings,
  onChange,
  showTitle = true,
}: {
  settings: RecordingVisualSettings;
  onChange: (patch: Partial<RecordingVisualSettings>) => void;
  showTitle?: boolean;
}) {
  return (
    <div className="section-block">
      {showTitle ? <div className="section-title">光标</div> : null}
      <div className="camera-shape-options" role="group" aria-label="光标">
        <button
          type="button"
          className={`camera-shape-option ${settings.cursorEffect === 'none' ? 'camera-shape-option--active' : ''}`}
          onClick={() => onChange({ cursorEffect: 'none' })}
        >
          不显示光标
        </button>
        <button
          type="button"
          className={`camera-shape-option ${settings.cursorEffect === 'cursor' ? 'camera-shape-option--active' : ''}`}
          onClick={() => onChange({ cursorEffect: 'cursor' })}
        >
          默认光标
        </button>
        <button
          type="button"
          className={`camera-shape-option ${settings.cursorEffect === 'highlight' ? 'camera-shape-option--active' : ''}`}
          onClick={() => onChange({ cursorEffect: 'highlight' })}
        >
          高亮光标
        </button>
      </div>
    </div>
  );
}

function ShortcutSettingsSection({
  shortcutSettings,
  onShortcutChange,
  onShortcutReset,
  showTitle = true,
}: {
  shortcutSettings: ShortcutMap;
  onShortcutChange: (action: ShortcutAction, value: string) => void;
  onShortcutReset: () => void;
  showTitle?: boolean;
}) {
  return (
    <div className="section-block">
      {showTitle ? <div className="section-title">快捷键</div> : null}
      <p className="shortcut-settings__description">
        快捷键格式示例：<code>Mod+Z</code>、<code>Mod+C</code>、<code>Shift+R</code>。可用 <code>|</code> 添加备选键，例如
        <code>Delete|Backspace</code>。
      </p>

      {SHORTCUT_SECTIONS.map((section) => (
        <div key={section.id} className="settings-subsection">
          <div className="settings-subsection-title">{section.label}</div>
          <div className="shortcut-settings__grid">
            {section.actions.map((item) => (
              <label key={item.action} className="shortcut-settings__field">
                <span>{item.label}</span>
                <input
                  type="text"
                  value={shortcutSettings[item.action]}
                  placeholder={DEFAULT_SHORTCUTS[item.action] || '未设置'}
                  onChange={(event) => onShortcutChange(item.action, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="shortcut-settings__actions">
        <button type="button" className="camera-control" onClick={onShortcutReset}>
          重置快捷键
        </button>
      </div>
    </div>
  );
}

function getCanvasBackgroundPreviewCss(
  backgroundColor: string,
  pattern: CanvasBackgroundPattern,
  spacing: number
) {
  const color = normalizeCanvasBackgroundColor(backgroundColor);
  const previewSpacing = Math.max(2, spacing);
  const patternColor = getCanvasPatternColor(color);

  if (pattern === 'ruled') {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${previewSpacing}px ${previewSpacing}px`,
    };
  }

  if (pattern === 'grid') {
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${previewSpacing}px ${previewSpacing}px`,
    };
  }

  if (pattern === 'dots') {
    return {
      backgroundColor: color,
      backgroundImage: `radial-gradient(circle, ${patternColor} 1.2px, transparent 1.45px)`,
      backgroundSize: `${previewSpacing}px ${previewSpacing}px`,
    };
  }

  return { backgroundColor: color, backgroundImage: 'none', backgroundSize: 'auto' };
}
function clampBackgroundSpacing(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 64;
  }

  return Math.min(CANVAS_BACKGROUND_SPACING_MAX, Math.max(CANVAS_BACKGROUND_SPACING_MIN, Number(value)));
}

export default RecordingSettingsModal;










