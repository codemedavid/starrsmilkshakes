import type { MenuItem } from '@/types';

export const mapMenuRows = (items: any[] | null | undefined): MenuItem[] =>
  (items || []).map((item) => {
    const now = new Date();
    const discountStart = item.discount_start_date ? new Date(item.discount_start_date) : null;
    const discountEnd = item.discount_end_date ? new Date(item.discount_end_date) : null;

    const isDiscountActive =
      Boolean(item.discount_active) &&
      (!discountStart || now >= discountStart) &&
      (!discountEnd || now <= discountEnd);

    const effectivePrice =
      isDiscountActive && item.discount_price ? Number(item.discount_price) : Number(item.base_price);

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      basePrice: Number(item.base_price),
      category: item.category,
      popular: Boolean(item.popular),
      available: item.available ?? true,
      image: item.image_url || undefined,
      discountPrice: item.discount_price ? Number(item.discount_price) : undefined,
      discountStartDate: item.discount_start_date || undefined,
      discountEndDate: item.discount_end_date || undefined,
      discountActive: Boolean(item.discount_active),
      effectivePrice,
      isOnDiscount: isDiscountActive,
      costPrice: item.cost_price != null ? Number(item.cost_price) : null,
      variations:
        item.variations?.map((variation: any) => ({
          id: variation.id,
          name: variation.name,
          price: Number(variation.price),
          image: variation.image_url || undefined,
        })) || [],
      addOns:
        item.add_ons?.map((addOn: any) => ({
          id: addOn.id,
          name: addOn.name,
          price: Number(addOn.price),
          category: addOn.category,
        })) || [],
    };
  });
