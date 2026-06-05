import { formatShortcutHint } from '../shortcuts';
import type { ShortcutMap } from '../shortcuts';

type FloatingControlBarProps = {
  onOpenSettings: () => void;
  onEnterPreparing: () => void;
  onCancelPreparing: () => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onToggleTeleprompter: () => void;
  recordingStatus: 'idle' | 'preparing' | 'recording' | 'paused';
  recordingElapsedLabel: string;
  shortcutSettings: ShortcutMap;
};

const SETTINGS_LABEL = '\u8bbe\u7f6e';
const TELEPROMPTER_LABEL = '\u63d0\u8bcd\u5668';

function FloatingControlIcon({ type }: { type: 'settings' | 'teleprompter' }) {
  if (type === 'settings') {
    return (
      <svg className="floating-controls__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
        <path d="M18.5 12a6.83 6.83 0 0 0-.08-.98l2.02-1.56-1.9-3.3-2.38.96a7.12 7.12 0 0 0-1.7-.98L14.1 3.6h-4.2l-.36 2.54a7.12 7.12 0 0 0-1.7.98l-2.38-.96-1.9 3.3 2.02 1.56a6.83 6.83 0 0 0 0 1.96l-2.02 1.56 1.9 3.3 2.38-.96c.52.4 1.1.74 1.7.98l.36 2.54h4.2l.36-2.54c.6-.24 1.18-.58 1.7-.98l2.38.96 1.9-3.3-2.02-1.56c.05-.32.08-.65.08-.98Z" />
      </svg>
    );
  }

  return (
    <svg className="floating-controls__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.75h6.75L18 8v12.25H7V3.75Z" />
      <path d="M13.75 3.75V8H18" />
      <path d="M9.5 12h6" />
      <path d="M9.5 15.25h5" />
    </svg>
  );
}

function IconButton({
  label,
  type,
  onClick,
  shortcutHint,
}: {
  label: string;
  type: 'settings' | 'teleprompter';
  onClick: () => void;
  shortcutHint?: string;
}) {
  return (
    <button
      type="button"
      className="floating-controls__button floating-controls__button--icon"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <FloatingControlIcon type={type} />
      <span>{label}</span>
      {shortcutHint ? <span className="floating-controls__hint">{shortcutHint}</span> : null}
    </button>
  );
}

function ControlHint({ binding }: { binding: string | undefined }) {
  const hint = formatShortcutHint(binding);
  if (!hint) {
    return null;
  }

  return <span className="floating-controls__hint">{hint}</span>;
}

function FloatingControlBar({
  onOpenSettings,
  onEnterPreparing,
  onCancelPreparing,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onToggleTeleprompter,
  recordingStatus,
  recordingElapsedLabel,
  shortcutSettings,
}: FloatingControlBarProps) {
  return (
    <div className="floating-controls">
      {recordingStatus === 'idle' ? (
        <>
          <IconButton
            label={SETTINGS_LABEL}
            type="settings"
            onClick={onOpenSettings}
            shortcutHint={formatShortcutHint(shortcutSettings.openSettings)}
          />
          <IconButton
            label={TELEPROMPTER_LABEL}
            type="teleprompter"
            onClick={onToggleTeleprompter}
            shortcutHint={formatShortcutHint(shortcutSettings.toggleTeleprompter)}
          />
          <button type="button" className="floating-controls__button floating-controls__button--record" onClick={onEnterPreparing}>
            <span className="floating-controls__record-dot" aria-hidden="true" />
            {'\u5f55\u5236'}
            <ControlHint binding={shortcutSettings.recordingEnterPreparing} />
          </button>
        </>
      ) : null}

      {recordingStatus === 'preparing' ? (
        <>
          <IconButton
            label={TELEPROMPTER_LABEL}
            type="teleprompter"
            onClick={onToggleTeleprompter}
            shortcutHint={formatShortcutHint(shortcutSettings.toggleTeleprompter)}
          />
          <button type="button" className="floating-controls__button" onClick={onCancelPreparing}>
            {'\u53d6\u6d88'}
            <ControlHint binding={shortcutSettings.recordingCancelPreparing} />
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--start" onClick={onStartRecording}>
            {'\u5f00\u59cb\u5f55\u5236'}
            <ControlHint binding={shortcutSettings.recordingStart} />
          </button>
        </>
      ) : null}

      {recordingStatus === 'recording' ? (
        <>
          <IconButton
            label={TELEPROMPTER_LABEL}
            type="teleprompter"
            onClick={onToggleTeleprompter}
            shortcutHint={formatShortcutHint(shortcutSettings.toggleTeleprompter)}
          />
          <button type="button" className="floating-controls__button floating-controls__button--pause" onClick={onPauseRecording}>
            {'\u6682\u505c'}
            <ControlHint binding={shortcutSettings.recordingPause} />
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--stop" onClick={onStopRecording}>
            {'\u505c\u6b62'}
            <ControlHint binding={shortcutSettings.recordingStop} />
          </button>
          <span className="floating-controls__timer"><span />{recordingElapsedLabel}</span>
        </>
      ) : null}

      {recordingStatus === 'paused' ? (
        <>
          <IconButton
            label={TELEPROMPTER_LABEL}
            type="teleprompter"
            onClick={onToggleTeleprompter}
            shortcutHint={formatShortcutHint(shortcutSettings.toggleTeleprompter)}
          />
          <button type="button" className="floating-controls__button floating-controls__button--start" onClick={onResumeRecording}>
            {'\u7ee7\u7eed'}
            <ControlHint binding={shortcutSettings.recordingResume} />
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--stop" onClick={onStopRecording}>
            {'\u505c\u6b62'}
            <ControlHint binding={shortcutSettings.recordingStop} />
          </button>
          <span className="floating-controls__timer floating-controls__timer--paused"><span />{recordingElapsedLabel}</span>
        </>
      ) : null}
    </div>
  );
}

export default FloatingControlBar;
