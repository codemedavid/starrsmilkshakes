import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import { supabase } from '../lib/supabase';

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface UseCategoriesOptions {
  admin?: boolean;
}

export const useCategories = ({ admin = false }: UseCategoriesOptions = {}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);

      if (admin) {
        const response = await adminFetch('/api/admin/categories');
        const data = await parseApiResponse<{ categories: Category[] }>(response);
        setCategories(data.categories || []);
        setError(null);
        return;
      }
      
      const { data, error: fetchError } = await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setCategories(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const addCategory = async (category: Omit<Category, 'created_at' | 'updated_at'>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify(category),
      });
      const data = await parseApiResponse<{ category: Category }>(response);

      await fetchCategories();
      return data.category;
    } catch (err) {
      console.error('Error adding category:', err);
      throw err;
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await parseApiResponse<{ category: Category }>(response);

      await fetchCategories();
    } catch (err) {
      console.error('Error updating category:', err);
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/categories/${id}`, {
        method: 'DELETE',
      });
      await parseApiResponse<{ success: boolean }>(response);

      await fetchCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      throw err;
    }
  };

  const reorderCategories = async (reorderedCategories: Category[]) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      for (const [index, category] of reorderedCategories.entries()) {
        const response = await adminFetch(`/api/admin/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: index + 1 }),
        });
        await parseApiResponse<{ category: Category }>(response);
      }

      await fetchCategories();
    } catch (err) {
      console.error('Error reordering categories:', err);
      throw err;
    }
  };

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    refetch: fetchCategories
  };
};
