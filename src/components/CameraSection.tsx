import type { CameraSettings, MediaDeviceChoice } from '../cameraTypes';

type CameraSectionProps = {
  settings: CameraSettings;
  onChange: (patch: Partial<CameraSettings>) => void;
  videoDevices: MediaDeviceChoice[];
  audioDevices: MediaDeviceChoice[];
  mediaError: string | null;
  onRefreshDevices: () => void;
};

function CameraSection({
  settings,
  onChange,
  videoDevices,
  audioDevices,
  mediaError,
  onRefreshDevices,
}: CameraSectionProps) {
  return (
    <div className="section-block">
      <div className="section-title">摄像头</div>
      <div className="camera-control">
        <div>
          <div className="camera-label">摄像头小窗</div>
          <p className="camera-note">开启后会显示在白板上，并进入录制画面。</p>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.enabled ? 'toggle-switch--on' : ''}`}
          onClick={() => onChange({ enabled: !settings.enabled })}
          aria-pressed={settings.enabled}
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      {settings.enabled ? (
        <>
          <div className="camera-settings-grid">
            <label className="camera-setting-field">
              <span>摄像头设备</span>
              <select
                value={settings.videoDeviceId}
                onFocus={onRefreshDevices}
                onChange={(event) => onChange({ videoDeviceId: event.target.value })}
              >
                <option value="">默认摄像头</option>
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="camera-setting-field">
              <span>麦克风设备</span>
              <select
                value={settings.audioDeviceId}
                onFocus={onRefreshDevices}
                onChange={(event) => onChange({ audioDeviceId: event.target.value })}
              >
                <option value="">不使用麦克风</option>
                <option value="default">默认麦克风</option>
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="camera-setting-field camera-setting-field--range">
              <span className="setting-field-title">摄像头大小 - {settings.size}px</span>
              <span>摄像头大小</span>
              <input
                type="range"
                min="96"
                max="280"
                step="8"
                value={settings.size}
                onChange={(event) => onChange({ size: Number(event.target.value) })}
              />
              <strong>{settings.size}px</strong>
            </label>

            <div className="camera-setting-field">
              <span>形状</span>
              <div className="camera-shape-options" role="group" aria-label="摄像头形状">
                <button
                  type="button"
                  className={`camera-shape-option ${settings.shape === 'circle' ? 'camera-shape-option--active' : ''}`}
                  onClick={() => onChange({ shape: 'circle' })}
                >
                  圆形
                </button>
                <button
                  type="button"
                  className={`camera-shape-option ${settings.shape === 'square' ? 'camera-shape-option--active' : ''}`}
                  onClick={() => onChange({ shape: 'square' })}
                >
                  方形
                </button>
              </div>
            </div>
          </div>

          {mediaError ? <p className="camera-error">{mediaError}</p> : null}
          {videoDevices.length === 0 ? <p className="camera-note">未检测到摄像头设备。</p> : null}
          {audioDevices.length === 0 ? <p className="camera-note">未检测到麦克风设备。</p> : null}
        </>
      ) : null}
    </div>
  );
}

export default CameraSection;
