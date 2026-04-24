import type { AspectRatioItem } from '../mockOptions';

type AspectRatioSectionProps = {
  options: AspectRatioItem[];
  selectedKey: string;
  onSelect: (value: AspectRatioItem['key']) => void;
  showTitle?: boolean;
};

function AspectRatioSection({ options, selectedKey, onSelect, showTitle = true }: AspectRatioSectionProps) {
  return (
    <div className="section-block section-block--compact">
      {showTitle ? <div className="section-title">画布比例</div> : null}
      <div className="option-grid">
        {options.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`option-button ${selectedKey === item.key ? 'option-button--active' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AspectRatioSection;
