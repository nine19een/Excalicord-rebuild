import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import './whiteboard.css';
import RecordingSettingsModal from './components/RecordingSettingsModal';
import WhiteboardPage from './components/WhiteboardPage';
import { DEFAULT_CAMERA_SETTINGS, DEFAULT_RECORDING_VISUAL_SETTINGS } from './cameraTypes';
import type { CameraSettings, MediaDeviceChoice, RecordingVisualSettings } from './cameraTypes';
import { aspectRatioOptions } from './mockOptions';
import { frameBackgroundPresets } from './frameBackgrounds';

const DESKTOP_MIN_WIDTH = 900;

function App() {
  const isDesktopViewport = useDesktopViewport(DESKTOP_MIN_WIDTH);

  return isDesktopViewport ? <CanvasCastApp /> : <DesktopOnlyNotice />;
}

function CanvasCastApp() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeAspect, setActiveAspect] = useState('1:1');
  const [activeBackgroundId, setActiveBackgroundId] = useState(() => frameBackgroundPresets[0]?.id ?? '');
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [recordingVisualSettings, setRecordingVisualSettings] =
    useState<RecordingVisualSettings>(DEFAULT_RECORDING_VISUAL_SETTINGS);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceChoice[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceChoice[]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const activeAspectItem = useMemo(
    () => aspectRatioOptions.find((option) => option.key === activeAspect) ?? aspectRatioOptions[4],
    [activeAspect]
  );
  const activeBackground = useMemo(
    () => frameBackgroundPresets.find((option) => option.id === activeBackgroundId) ?? frameBackgroundPresets[0] ?? null,
    [activeBackgroundId]
  );

  const updateCameraSettings = useCallback((patch: Partial<CameraSettings>) => {
    setCameraSettings((current) => ({ ...current, ...patch }));
  }, []);

  const updateRecordingVisualSettings = useCallback((patch: Partial<RecordingVisualSettings>) => {
    setRecordingVisualSettings((current) => ({ ...current, ...patch }));
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaError('当前浏览器不支持媒体设备枚举。');
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(
        devices
          .filter((device) => device.kind === 'videoinput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `摄像头 ${index + 1}`,
          }))
      );
      setAudioDevices(
        devices
          .filter((device) => device.kind === 'audioinput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `麦克风 ${index + 1}`,
          }))
      );
    } catch {
      setMediaError('无法读取摄像头或麦克风设备列表。');
    }
  }, []);

  useEffect(() => {
    refreshDevices();

    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    let disposed = false;
    let nextStream: MediaStream | null = null;

    if (!cameraSettings.enabled) {
      setCameraStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
      setMediaError(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('当前浏览器不支持摄像头访问。');
      return;
    }

    const videoConstraint: MediaTrackConstraints | boolean = cameraSettings.videoDeviceId
      ? { deviceId: { exact: cameraSettings.videoDeviceId } }
      : true;

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraint, audio: false })
      .then((stream) => {
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextStream = stream;
        setMediaError(null);
        setCameraStream((current) => {
          current?.getTracks().forEach((track) => track.stop());
          return stream;
        });
        refreshDevices();
      })
      .catch(() => {
        if (!disposed) {
          setCameraStream((current) => {
            current?.getTracks().forEach((track) => track.stop());
            return null;
          });
          setMediaError('摄像头打开失败，请检查权限或设备占用。');
        }
      });

    return () => {
      disposed = true;
      nextStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraSettings.enabled, cameraSettings.videoDeviceId, refreshDevices]);

  useEffect(() => {
    let disposed = false;
    let nextStream: MediaStream | null = null;

    if (!cameraSettings.audioDeviceId) {
      setMicrophoneStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
      setMediaError(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('当前浏览器不支持麦克风访问。');
      return;
    }

    const audioConstraint: MediaTrackConstraints | boolean =
      cameraSettings.audioDeviceId === 'default'
        ? true
        : { deviceId: { exact: cameraSettings.audioDeviceId } };

    navigator.mediaDevices
      .getUserMedia({ audio: audioConstraint, video: false })
      .then((stream) => {
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextStream = stream;
        setMediaError(null);
        setMicrophoneStream((current) => {
          current?.getTracks().forEach((track) => track.stop());
          return stream;
        });
        refreshDevices();
      })
      .catch(() => {
        if (!disposed) {
          setMicrophoneStream((current) => {
            current?.getTracks().forEach((track) => track.stop());
            return null;
          });
          setMediaError('麦克风打开失败，请检查权限或设备占用。');
        }
      });

    return () => {
      disposed = true;
      nextStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraSettings.audioDeviceId, refreshDevices]);

  return (
    <div className="app-shell">
      <WhiteboardPage
        onOpenSettings={() => setSettingsOpen(true)}
        slideAspectRatio={activeAspectItem.ratio}
        cameraSettings={cameraSettings}
        onCameraSettingsChange={updateCameraSettings}
        cameraStream={cameraStream}
        microphoneStream={microphoneStream}
        recordingBackground={activeBackground}
        recordingVisualSettings={recordingVisualSettings}
      />

      {settingsOpen && (
        <div className="settings-overlay">
          <button
            type="button"
            className="settings-overlay__backdrop"
            aria-label="鍏抽棴璁剧疆"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="settings-overlay__content"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSettingsOpen(false);
              }
            }}
          >
            <RecordingSettingsModal
              activeAspect={activeAspect}
              onAspectChange={setActiveAspect}
              activeBackgroundId={activeBackgroundId}
              onBackgroundChange={setActiveBackgroundId}
              recordingVisualSettings={recordingVisualSettings}
              onRecordingVisualSettingsChange={updateRecordingVisualSettings}
              cameraSettings={cameraSettings}
              onCameraSettingsChange={updateCameraSettings}
              videoDevices={videoDevices}
              audioDevices={audioDevices}
              cameraStream={cameraStream}
              mediaError={mediaError}
              onRefreshDevices={refreshDevices}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function useDesktopViewport(minWidth: number) {
  const getIsDesktop = () => (typeof window === 'undefined' ? true : window.innerWidth >= minWidth);
  const [isDesktop, setIsDesktop] = useState(getIsDesktop);

  useEffect(() => {
    const handleResize = () => setIsDesktop(getIsDesktop());
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [minWidth]);

  return isDesktop;
}

function DesktopOnlyNotice() {
  return (
    <main className="desktop-only-notice" aria-labelledby="desktop-only-title">
      <section className="desktop-only-notice__card">
        <div className="desktop-only-notice__mark" aria-hidden="true">
          CanvasCast
        </div>
        <h1 id="desktop-only-title">CanvasCast is designed for desktop browsers.</h1>
        <p>Please open this app on a laptop or desktop computer for the best whiteboard recording experience.</p>
        <p className="desktop-only-notice__cn">
          CanvasCast 目前面向桌面端浏览器设计。请使用电脑打开，以获得完整的白板绘制与录制体验。
        </p>
      </section>
    </main>
  );
}

export default App;
