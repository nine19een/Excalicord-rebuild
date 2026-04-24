import { useEffect, useMemo, useRef, useState } from 'react';
import type { CameraSettings, RecordingVisualSettings } from '../cameraTypes';
import type { BackgroundSwatch } from '../mockOptions';
import { getRecordingCompositionLayout } from '../recordingLayout';
import { getCanvasBackgroundCss } from '../canvasBackground';

type PreviewPanelProps = {
  aspectRatio: number;
  background: BackgroundSwatch;
  visualSettings: RecordingVisualSettings;
  cameraSettings: CameraSettings;
  cameraStream: MediaStream | null;
};

type StageSize = {
  width: number;
  height: number;
};

const PREVIEW_TITLE_GAP = 18;
const PREVIEW_REFERENCE_FRAME_WIDTH = 960;

function PreviewPanel({ aspectRatio, background, visualSettings, cameraSettings, cameraStream }: PreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [panelSize, setPanelSize] = useState<StageSize>({ width: 0, height: 0 });
  const [titleHeight, setTitleHeight] = useState(0);

  useEffect(() => {
    const panelNode = panelRef.current;
    const titleNode = titleRef.current;

    if (!panelNode || !titleNode) {
      return;
    }

    const updateMeasurements = () => {
      setPanelSize({
        width: Math.max(panelNode.clientWidth, 0),
        height: Math.max(panelNode.clientHeight, 0),
      });
      setTitleHeight(Math.max(titleNode.clientHeight, 0));
    };

    updateMeasurements();

    const observer = new ResizeObserver(() => {
      updateMeasurements();
    });

    observer.observe(panelNode);
    observer.observe(titleNode);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = cameraStream;
    if (cameraStream) {
      video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [cameraStream]);

  const frameSize = useMemo(() => {
    const safeRatio = Math.max(aspectRatio, 0.1);
    const availableWidth = Math.max(panelSize.width, 0);
    const availableHeight = Math.max(panelSize.height - titleHeight - PREVIEW_TITLE_GAP, 0);

    if (!availableWidth || !availableHeight) {
      return { width: 0, height: 0 };
    }

    let width = availableWidth;
    let height = width / safeRatio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * safeRatio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }, [aspectRatio, panelSize.height, panelSize.width, titleHeight]);

  const sourceFrame = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: PREVIEW_REFERENCE_FRAME_WIDTH,
      height: PREVIEW_REFERENCE_FRAME_WIDTH / Math.max(aspectRatio, 0.1),
    }),
    [aspectRatio]
  );

  const compositionLayout = useMemo(
    () =>
      getRecordingCompositionLayout(
        { x: 0, y: 0, width: frameSize.width, height: frameSize.height },
        sourceFrame,
        visualSettings,
        { ...cameraSettings, position: { x: 1, y: 1 } }
      ),
    [cameraSettings, frameSize.height, frameSize.width, sourceFrame, visualSettings]
  );

  const canvasRect = compositionLayout.canvasRect;
  const cameraRect = compositionLayout.cameraRect;
  const cameraPreviewSize = cameraRect.width;
  const cameraSafeInset = Math.round(
    Math.min(
      Math.max(canvasRect.width * 0.035, 8),
      Math.max(8, Math.min(canvasRect.width, canvasRect.height) * 0.08)
    )
  );
  const canvasBackgroundStyle = getCanvasBackgroundCss(visualSettings);

  return (
    <div ref={panelRef} className="preview-panel">
      <div className="preview-stage-group">
        <div ref={titleRef} className="preview-title">
          预览
        </div>
        <div className="composition-stage">
          <div
            className="composition-frame"
            style={{ width: `${frameSize.width}px`, height: `${frameSize.height}px` }}
          >
            <div className="composition-background" style={{ background: background.color }}>
              <div
                className="whiteboard-canvas"
                style={{
                  ...canvasBackgroundStyle,
                  left: `${Math.round(canvasRect.x)}px`,
                  top: `${Math.round(canvasRect.y)}px`,
                  width: `${Math.round(canvasRect.width)}px`,
                  height: `${Math.round(canvasRect.height)}px`,
                  borderRadius: `${Math.round(compositionLayout.canvasRadius)}px`,
                }}
              >
                {cameraSettings.enabled && cameraPreviewSize > 0 && (
                  <div
                    className={`camera-preview camera-preview--${cameraSettings.shape}`}
                    style={{
                      width: `${Math.round(cameraPreviewSize)}px`,
                      height: `${Math.round(cameraPreviewSize)}px`,
                      left: `${Math.round(Math.max(0, cameraRect.x - canvasRect.x - cameraSafeInset))}px`,
                      top: `${Math.round(Math.max(0, cameraRect.y - canvasRect.y - cameraSafeInset))}px`,
                      borderRadius:
                        cameraSettings.shape === 'circle'
                          ? '999px'
                          : `${Math.round(compositionLayout.cameraRadius)}px`,
                    }}
                  >
                    {cameraStream ? (
                      <video ref={cameraVideoRef} className="camera-preview__video" muted playsInline autoPlay />
                    ) : (
                      <div className="camera-preview__placeholder">Camera</div>
                    )}
                  </div>
                )}
                {visualSettings.cursorEffect !== 'none' && (
                  <div className={`preview-cursor preview-cursor--${visualSettings.cursorEffect}`} aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PreviewPanel;

