import { describe, it, expect } from 'vitest';
import { fuzzyMatchMenuItem, fuzzyMatchMenuItems } from '../../src/lib/ai-menu-matcher';

const menuItems = [
  { id: '1', name: 'Chocolate Shake', base_price: 149 },
  { id: '2', name: 'Cookies and Cream Shake', base_price: 159 },
  { id: '3', name: 'Strawberry Shake', base_price: 149 },
  { id: '4', name: 'Mango Graham Shake', base_price: 169 },
  { id: '5', name: 'Classic Fries', base_price: 79 },
];

describe('ai-menu-matcher', () => {
  it('matches exact name (case-insensitive)', () => {
    const result = fuzzyMatchMenuItem('chocolate shake', menuItems);
    expect(result?.item.id).toBe('1');
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('matches partial name', () => {
    const result = fuzzyMatchMenuItem('cookies cream', menuItems);
    expect(result?.item.id).toBe('2');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('matches with typo via Levenshtein', () => {
    const result = fuzzyMatchMenuItem('choclate shake', menuItems);
    expect(result?.item.id).toBe('1');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('returns null for completely unrelated input', () => {
    const result = fuzzyMatchMenuItem('pizza margherita', menuItems);
    expect(result).toBeNull();
  });

  it('matches substring', () => {
    const result = fuzzyMatchMenuItem('mango', menuItems);
    expect(result?.item.id).toBe('4');
  });

  describe('fuzzyMatchMenuItems', () => {
    it('separates matched and unmatched items', () => {
      const queries = [
        { name: 'chocolate shake', quantity: 1 },
        { name: 'pizza', quantity: 2 },
        { name: 'strawberry shake', size: 'Large', quantity: 1 },
      ];
      const { matched, unmatched } = fuzzyMatchMenuItems(queries, menuItems);
      expect(matched.length).toBe(2);
      expect(unmatched).toContain('pizza');
      expect(matched[1].size).toBe('Large');
    });
  });
});
