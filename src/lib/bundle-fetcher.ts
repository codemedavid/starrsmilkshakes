import { supabase } from '@/lib/supabase';
import type { Bundle } from '@/types/bundle';
import type { MenuItem } from '@/types';

/** Map raw Supabase menu_item row to the camelCase shape the bundle engine expects */
export function mapSlotMenuItem(raw: any): MenuItem {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    basePrice: Number(raw.base_price),
    category: raw.category,
    image: raw.image_url || undefined,
    popular: Boolean(raw.popular),
    available: raw.available ?? true,
    variations: raw.variations?.map((v: any) => ({
      id: v.id,
      name: v.name,
      price: Number(v.price),
    })) || [],
    addOns: raw.add_ons?.map((a: any) => ({
      id: a.id,
      name: a.name,
      price: Number(a.price),
      category: a.category,
    })) || [],
  };
}

/** Fetch a bundle by ID with all nested slot/item/variation/addon data */
export async function fetchBundleById(id: string): Promise<Bundle | null> {
  const { data } = await (supabase.from('bundles') as any)
    .select(`
      *,
      slots:bundle_slots (
        *,
        items:bundle_slot_items (
          *,
          menu_item:menu_items (
            *,
            variations (*),
            add_ons (*)
          )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!data) return null;

  return {
    ...data,
    slots: (data.slots || []).map((slot: any) => ({
      ...slot,
      items: slot.items.map((si: any) => ({
        ...si,
        menu_item: si.menu_item ? mapSlotMenuItem(si.menu_item) : undefined,
      })),
    })),
  } as Bundle;
}
