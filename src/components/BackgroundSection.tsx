import type { BackgroundCategory, BackgroundSwatch } from '../mockOptions';

type BackgroundSectionProps = {
  categories: BackgroundCategory[];
  activeCategory: string;
  onCategoryChange: (category: BackgroundCategory['key']) => void;
  options: BackgroundSwatch[];
  selectedBackgroundId: string;
  onSelectBackground: (id: string) => void;
  onRandomSelect: () => void;
};

function BackgroundSection({
  categories,
  activeCategory,
  onCategoryChange,
  options,
  selectedBackgroundId,
  onSelectBackground,
  onRandomSelect,
}: BackgroundSectionProps) {
  const showRandomCard = activeCategory === 'all';

  return (
    <div className="section-block">
      <div className="section-title">边框</div>
      <div className="category-tabs">
        {categories.map((category) => (
          <button
            type="button"
            key={category.key}
            className={`tab-button ${activeCategory === category.key ? 'tab-button--active' : ''}`}
            onClick={() => onCategoryChange(category.key)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="background-grid">
        {showRandomCard && (
          <button type="button" className="background-swatch background-swatch--random" onClick={onRandomSelect}>
            <span className="background-swatch-random-icon">+</span>
            <span className="background-swatch-random-label">随机选择边框</span>
          </button>
        )}

        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`background-swatch ${selectedBackgroundId === option.id ? 'background-swatch--selected' : ''}`}
            style={{ background: option.color }}
            onClick={() => onSelectBackground(option.id)}
            aria-label={option.label}
          >
            {selectedBackgroundId === option.id && <span className="swatch-check" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default BackgroundSection;
