'use client';

import { useState, useTransition } from 'react';
import { ChevronUp, ChevronDown, GripVertical, AlertTriangle } from 'lucide-react';
import { reorderCategories } from '@/actions/categories';
import type { Category } from '@/hooks/useCategories';

interface CategoryReorderListProps {
  categories: Category[];
}

export default function CategoryReorderList({ categories: initialCategories }: CategoryReorderListProps) {
  const [items, setItems] = useState<Category[]>(initialCategories);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (index: number, direction: 'up' | 'down') => {
    const next = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= next.length) return;

    // Swap
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setItems(next);

    setError(null);
    startTransition(async () => {
      const result = await reorderCategories({ ids: next.map((c) => c.id) });
      if (!result.success) {
        // Revert on failure
        setItems(items);
        setError(result.error || 'Failed to reorder categories');
      }
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl mb-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="font-nunito text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-sm font-nunito"
          >
            Dismiss
          </button>
        </div>
      )}

      {items.map((category, index) => (
        <div
          key={category.id}
          className={`
            flex items-center gap-3 bg-white border border-[#E8E3DA] rounded-xl px-4 py-3
            transition-all duration-200
            ${isPending ? 'opacity-60 pointer-events-none' : ''}
          `}
        >
          <GripVertical className="h-4 w-4 text-stone-300 flex-shrink-0" />

          <span className="text-lg leading-none">{category.icon}</span>

          <span className="font-nunito font-semibold text-stone-900 flex-1 truncate">
            {category.name}
          </span>

          <span className="font-nunito text-xs text-stone-400">#{index + 1}</span>

          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => move(index, 'up')}
              disabled={index === 0 || isPending}
              className="
                p-1 rounded text-stone-400
                hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200
              "
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => move(index, 'down')}
              disabled={index === items.length - 1 || isPending}
              className="
                p-1 rounded text-stone-400
                hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200
              "
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
