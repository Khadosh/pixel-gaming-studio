import { CATEGORIES } from '@/lib/types';

interface CategoryFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  assetCounts: Record<string, number>;
}

export default function CategoryFilter({
  activeCategory,
  onCategoryChange,
  assetCounts,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((cat) => {
        const count = cat.id === 'all'
          ? Object.values(assetCounts).reduce((a, b) => a + b, 0)
          : (assetCounts[cat.id] ?? 0);

        const isActive = activeCategory === cat.id;

        return (
          <button
            key={cat.id}
            id={`category-filter-${cat.id}`}
            onClick={() => onCategoryChange(cat.id)}
            className={`nube-cuerpo inline-flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all duration-200 ${
              isActive
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(34,197,94,0.25)]'
                : 'bg-secondary text-secondary-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <span className="text-[16px] leading-none">{cat.icon}</span>
            <span>{cat.label.toUpperCase()}</span>
            <span className={`nube-etiqueta ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
