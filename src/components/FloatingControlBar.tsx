import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type FloatingControlBarProps = {
  onOpenSettings: () => void;
};

type DragState = {
  offsetX: number;
  offsetY: number;
} | null;

function FloatingControlBar({ onOpenSettings }: FloatingControlBarProps) {
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
      <button type="button" className="floating-controls__button" onClick={onOpenSettings}>
        设置
      </button>
      <button type="button" className="floating-controls__button" onClick={() => undefined}>
        提词器
      </button>
      <button
        type="button"
        className="floating-controls__button floating-controls__button--record"
        onClick={() => undefined}
      >
        录制
      </button>
    </div>
  );
}

export default FloatingControlBar;


