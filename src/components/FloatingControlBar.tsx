import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

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
};

type DragState = {
  offsetX: number;
  offsetY: number;
} | null;

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
}: FloatingControlBarProps) {
  const [position, setPosition] = useState({ x: 84, y: 140 });
  const dragStateRef = useRef<DragState>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      setPosition({
        x: Math.max(16, event.clientX - dragState.offsetX),
        y: Math.max(90, event.clientY - dragState.offsetY),
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    dragStateRef.current = {
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
  };

  return (
    <div
      className="floating-controls"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onPointerDown={handlePointerDown}
    >
      {recordingStatus === 'idle' ? (
        <>
          <button type="button" className="floating-controls__button" onClick={onOpenSettings}>
            {'\u8bbe\u7f6e'}
          </button>
          <button type="button" className="floating-controls__button" onClick={onToggleTeleprompter}>
            {'\u63d0\u8bcd\u5668'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--record" onClick={onEnterPreparing}>
            {'\u5f55\u5236'}
          </button>
        </>
      ) : null}

      {recordingStatus === 'preparing' ? (
        <>
          <button type="button" className="floating-controls__button" onClick={onToggleTeleprompter}>
            {'\u63d0\u8bcd\u5668'}
          </button>
          <button type="button" className="floating-controls__button" onClick={onCancelPreparing}>
            {'\u53d6\u6d88'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--start" onClick={onStartRecording}>
            {'\u5f00\u59cb\u5f55\u5236'}
          </button>
        </>
      ) : null}

      {recordingStatus === 'recording' ? (
        <>
          <button type="button" className="floating-controls__button" onClick={onToggleTeleprompter}>
            {'\u63d0\u8bcd\u5668'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--pause" onClick={onPauseRecording}>
            {'\u6682\u505c'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--stop" onClick={onStopRecording}>
            {'\u505c\u6b62'}
          </button>
          <span className="floating-controls__timer"><span />{recordingElapsedLabel}</span>
        </>
      ) : null}

      {recordingStatus === 'paused' ? (
        <>
          <button type="button" className="floating-controls__button" onClick={onToggleTeleprompter}>
            {'\u63d0\u8bcd\u5668'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--start" onClick={onResumeRecording}>
            {'\u7ee7\u7eed'}
          </button>
          <button type="button" className="floating-controls__button floating-controls__button--stop" onClick={onStopRecording}>
            {'\u505c\u6b62'}
          </button>
          <span className="floating-controls__timer floating-controls__timer--paused"><span />{recordingElapsedLabel}</span>
        </>
      ) : null}
    </div>
  );
}

export default FloatingControlBar;
