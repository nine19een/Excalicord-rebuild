import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

export type TeleprompterPanelState = {
  text: string;
  position: {
    x: number;
    y: number;
  };
  opacity: number;
  speed: number;
  scrollTop: number;
};

type TeleprompterPanelProps = {
  value: TeleprompterPanelState;
  onChange: (patch: Partial<TeleprompterPanelState>) => void;
  onClose: () => void;
};

type DragState = {
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_TELEPROMPTER_STATE: TeleprompterPanelState = {
  text: '',
  position: {
    x: 0,
    y: 0,
  },
  opacity: 0.85,
  speed: 40,
  scrollTop: 0,
};

function TeleprompterPanel({ value, onChange, onClose }: TeleprompterPanelProps) {
  const scriptRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const speedRef = useRef(value.speed);
  const scrollTopRef = useRef(value.scrollTop);
  const virtualScrollTopRef = useRef(value.scrollTop);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    speedRef.current = value.speed;
  }, [value.speed]);

  useEffect(() => {
    const script = scriptRef.current;
    if (!script) {
      return;
    }

    script.scrollTop = value.scrollTop;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const panel = panelRef.current;
      if (!dragState || !panel) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      const nextPosition = clampTeleprompterPosition(
        {
          x: event.clientX - dragState.offsetX,
          y: event.clientY - dragState.offsetY,
        },
        {
          width: rect.width,
          height: rect.height,
        }
      );

      onChangeRef.current({ position: nextPosition });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.classList.remove('teleprompter-dragging');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('teleprompter-dragging');
    };
  }, []);

  const stopAutoScroll = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    lastFrameTimeRef.current = null;
    const script = scriptRef.current;
    if (script) {
      scrollTopRef.current = script.scrollTop;
      virtualScrollTopRef.current = script.scrollTop;
      onChangeRef.current({ scrollTop: script.scrollTop });
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      const script = scriptRef.current;
      if (!playingRef.current || !script) {
        stopAutoScroll();
        return;
      }

      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const elapsedMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const maxScrollTop = Math.max(0, script.scrollHeight - script.clientHeight);
      const pixelsPerMs = getTeleprompterPixelsPerSecond(speedRef.current) / 1000;
      const nextScrollTop = Math.min(maxScrollTop, virtualScrollTopRef.current + elapsedMs * pixelsPerMs);

      virtualScrollTopRef.current = nextScrollTop;
      script.scrollTop = nextScrollTop;
      scrollTopRef.current = nextScrollTop;

      if (nextScrollTop + script.clientHeight >= script.scrollHeight - 1) {
        stopAutoScroll();
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [stopAutoScroll]
  );

  const startAutoScroll = useCallback(() => {
    const script = scriptRef.current;
    if (!script) {
      return;
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    lastFrameTimeRef.current = null;
    virtualScrollTopRef.current = script.scrollTop;
    playingRef.current = true;
    setIsPlaying(true);
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    document.body.classList.add('teleprompter-dragging');
    event.preventDefault();
    event.stopPropagation();
  };

  const resetScroll = () => {
    stopAutoScroll();
    if (scriptRef.current) {
      scriptRef.current.scrollTop = 0;
    }
    scrollTopRef.current = 0;
    virtualScrollTopRef.current = 0;
    onChange({ scrollTop: 0 });
  };

  const clearScript = () => {
    stopAutoScroll();
    if (scriptRef.current) {
      scriptRef.current.scrollTop = 0;
    }
    scrollTopRef.current = 0;
    virtualScrollTopRef.current = 0;
    onChange({ text: '', scrollTop: 0 });
  };

  return (
    <div
      ref={panelRef}
      className="teleprompter-panel"
      role="dialog"
      aria-label="Teleprompter"
      style={{
        left: `${value.position.x}px`,
        top: `${value.position.y}px`,
        '--teleprompter-bg-alpha': value.opacity,
      } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="teleprompter-panel__header" onPointerDown={handleHeaderPointerDown}>
        <div className="teleprompter-panel__title">
          <span aria-hidden="true">T</span>
          <strong>{'\u63d0\u8bcd\u5668'}</strong>
        </div>
        <div className="teleprompter-panel__header-actions">
          <button type="button" className="teleprompter-panel__header-button" onClick={clearScript}>
            {'\u6e05\u7a7a\u6587\u672c'}
          </button>
          <button type="button" className="teleprompter-panel__header-button" onClick={resetScroll}>
            {'\u56de\u5230\u9876\u90e8'}
          </button>
          <button type="button" className="teleprompter-panel__close" onClick={onClose} aria-label="Close teleprompter">
            {'\u00d7'}
          </button>
        </div>
      </div>

      <div className="teleprompter-panel__script-surface">
        <textarea
          ref={scriptRef}
          className="teleprompter-panel__script"
          value={value.text}
          placeholder={'\u5728\u6b64\u7c98\u8d34\u4f60\u7684\u811a\u672c...'}
          onChange={(event) => onChange({ text: event.target.value })}
          onScroll={(event) => {
            scrollTopRef.current = event.currentTarget.scrollTop;
            virtualScrollTopRef.current = event.currentTarget.scrollTop;
          }}
        />
      </div>

      <div className="teleprompter-panel__controls">
        <button
          type="button"
          className={`teleprompter-panel__play${isPlaying ? ' teleprompter-panel__play--active' : ''}`}
          onClick={() => {
            if (isPlaying) {
              stopAutoScroll();
            } else {
              startAutoScroll();
            }
          }}
        >
          {isPlaying ? '\u275a\u275a' : '\u25b6'}
        </button>

        <div className="teleprompter-panel__sliders">
          <label className="teleprompter-panel__range">
            <span>{'\u6eda\u52a8\u901f\u5ea6'}</span>
            <input
              type="range"
              min="1"
              max="100"
              value={value.speed}
              onChange={(event) => {
                const speed = Number(event.target.value);
                onChange({ speed });
                if (speed < 1) {
                  stopAutoScroll();
                }
              }}
            />
          </label>

          <label className="teleprompter-panel__range">
            <span>{'\u900f\u660e\u5ea6'}</span>
            <input
              type="range"
              min="10"
              max="100"
              value={Math.round(value.opacity * 100)}
              onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function getTeleprompterPixelsPerSecond(speed: number) {
  const minPixelsPerSecond = 10;
  const maxPixelsPerSecond = 280;
  const curvePower = 1.8;
  const clampedSpeed = Math.min(100, Math.max(1, speed));
  const normalizedSpeed = (clampedSpeed - 1) / 99;

  return (
    minPixelsPerSecond +
    (maxPixelsPerSecond - minPixelsPerSecond) * Math.pow(normalizedSpeed, curvePower)
  );
}

function clampTeleprompterPosition(position: { x: number; y: number }, size: { width: number; height: number }) {
  const visibleHeaderWidth = 120;
  const visibleHeaderHeight = 56;
  const maxX = Math.max(16, window.innerWidth - visibleHeaderWidth);
  const maxY = Math.max(16, window.innerHeight - visibleHeaderHeight);

  return {
    x: Math.min(maxX, Math.max(16 - size.width + visibleHeaderWidth, position.x)),
    y: Math.min(maxY, Math.max(16, position.y)),
  };
}

export default TeleprompterPanel;
