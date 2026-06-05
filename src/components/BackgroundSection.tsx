import type { FrameBackgroundPreset } from '../frameBackgrounds';

type BackgroundSectionProps = {
  options: FrameBackgroundPreset[];
  selectedBackgroundId: string;
  onSelectBackground: (id: string) => void;
  onRandomSelect: () => void;
  showTitle?: boolean;
};

function BackgroundSection({
  options,
  selectedBackgroundId,
  onSelectBackground,
  onRandomSelect,
  showTitle = true,
}: BackgroundSectionProps) {
  const hasBackgrounds = options.length > 0;

  return (
    <div className="section-block background-section">
      {showTitle ? <div className="section-title">{'\u80cc\u666f'}</div> : null}
      <button
        type="button"
        className="background-random-button"
        onClick={onRandomSelect}
        disabled={!hasBackgrounds}
        title={hasBackgrounds ? '\u968f\u673a\u9009\u62e9\u80cc\u666f' : '\u6dfb\u52a0\u80cc\u666f\u56fe\u540e\u53ef\u968f\u673a\u9009\u62e9\u80cc\u666f'}
        aria-label="\u968f\u673a\u9009\u62e9\u80cc\u666f"
      >
        <span className="background-random-button__icon" aria-hidden="true">↻</span>
        <span>{'\u968f\u673a\u9009\u62e9\u80cc\u666f'}</span>
      </button>

      <div className="background-grid-scroll">
        <div className="background-grid">
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`background-swatch background-swatch--image ${selectedBackgroundId === option.id ? 'background-swatch--selected' : ''}`}
              style={{ backgroundImage: `url(${option.src})` }}
              onClick={() => onSelectBackground(option.id)}
              aria-label={option.name}
              title={option.name}
            >
              {selectedBackgroundId === option.id && <span className="swatch-check" />}
            </button>
          ))}
        </div>
      </div>

      {!hasBackgrounds ? (
        <p className="background-empty-note">{'\u5c06\u80cc\u666f\u56fe\u653e\u5165 src/assets/frame-backgrounds \u540e\u5373\u53ef\u5728\u8fd9\u91cc\u663e\u793a\u3002'}</p>
      ) : null}
    </div>
  );
}

export default BackgroundSection;
