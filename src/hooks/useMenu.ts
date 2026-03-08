import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import { mapMenuRows } from '@/lib/menu-utils';
import { supabase } from '../lib/supabase';
import { MenuItem } from '../types';

interface UseMenuOptions {
  admin?: boolean;
}

export const useMenu = ({ admin = false }: UseMenuOptions = {}) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenuItems = useCallback(async () => {
    try {
      setLoading(true);

      if (admin) {
        const response = await adminFetch('/api/admin/menu');
        const data = await parseApiResponse<{ menuItems: MenuItem[] }>(response);
        setMenuItems(data.menuItems || []);
        setError(null);
        return;
      }

      // Fetch menu items with their variations and add-ons
      const { data: items, error: itemsError } = await supabase
        .from('menu_items')
        .select(`
          *,
          variations (*),
          add_ons (*)
        `)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      setMenuItems(mapMenuRows(items as any[]));
      setError(null);
    } catch (err) {
      console.error('Error fetching menu items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch menu items');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const addMenuItem = async (item: Omit<MenuItem, 'id'>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch('/api/admin/menu', {
        method: 'POST',
        body: JSON.stringify(item),
      });
      const data = await parseApiResponse<{ menuItem: MenuItem }>(response);

      await fetchMenuItems();
      return data.menuItem;
    } catch (err) {
      console.error('Error adding menu item:', err);
      throw err;
    }
  };

  const updateMenuItem = async (id: string, updates: Partial<MenuItem>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/menu/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      await parseApiResponse<{ success: boolean }>(response);

      await fetchMenuItems();
    } catch (err) {
      console.error('Error updating menu item:', err);
      throw err;
    }
  };

  const deleteMenuItem = async (id: string) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/menu/${id}`, {
        method: 'DELETE',
      });
      await parseApiResponse<{ success: boolean }>(response);

      await fetchMenuItems();
    } catch (err) {
      console.error('Error deleting menu item:', err);
      throw err;
    }
  };

  useEffect(() => {
    void fetchMenuItems();
  }, [fetchMenuItems]);

  return {
    menuItems,
    loading,
    error,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    refetch: fetchMenuItems
  };
};
