import { useMemo, useState } from 'react';
import AspectRatioSection from './AspectRatioSection';
import BackgroundSection from './BackgroundSection';
import CameraSection from './CameraSection';
import PreviewPanel from './PreviewPanel';
import {
  aspectRatioOptions,
  backgroundCategories,
  backgroundOptions,
} from '../mockOptions';

type RecordingSettingsModalProps = {
  onClose?: () => void;
};

function RecordingSettingsModal({ onClose }: RecordingSettingsModalProps) {
  const [activeAspect, setActiveAspect] = useState('1:1');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeBackgroundId, setActiveBackgroundId] = useState('bg-white');
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const selectedBackground = useMemo(
    () => backgroundOptions.find((option) => option.id === activeBackgroundId) ?? backgroundOptions[0],
    [activeBackgroundId]
  );

  const filteredBackgrounds = useMemo(
    () =>
      activeCategory === 'all'
        ? backgroundOptions
        : backgroundOptions.filter((option) => option.category === activeCategory),
    [activeCategory]
  );

  const activeAspectItem = aspectRatioOptions.find((option) => option.key === activeAspect) ?? aspectRatioOptions[4];

  const handleToggleCamera = () => setCameraEnabled((current) => !current);

  const handleRandomBackground = () => {
    const current = filteredBackgrounds[Math.floor(Math.random() * filteredBackgrounds.length)];
    if (current) {
      setActiveBackgroundId(current.id);
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
              cameraEnabled={cameraEnabled}
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

          <div className="settings-content">
            <div className="settings-scroll">
              <div className="settings-group settings-group--section">
                <AspectRatioSection
                  options={aspectRatioOptions}
                  selectedKey={activeAspect}
                  onSelect={setActiveAspect}
                />
              </div>

              <div className="settings-group settings-group--section">
                <BackgroundSection
                  categories={backgroundCategories}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  options={filteredBackgrounds}
                  selectedBackgroundId={activeBackgroundId}
                  onSelectBackground={setActiveBackgroundId}
                  onRandomSelect={handleRandomBackground}
                />
              </div>

              <div className="settings-group settings-group--section">
                <CameraSection enabled={cameraEnabled} onToggle={handleToggleCamera} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default RecordingSettingsModal;

