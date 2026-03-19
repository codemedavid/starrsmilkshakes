'use client';

import { useState } from 'react';
import type { MenuItem, Category } from '@/types';
import type { Bundle } from '@/types/bundle';
import UpsellUpgradesTab from '@/components/admin/UpsellUpgradesTab';
import UpsellAddonsTab from '@/components/admin/UpsellAddonsTab';
import UpsellPairsTab from '@/components/admin/UpsellPairsTab';
import UpsellInterstitialsTab from '@/components/admin/UpsellInterstitialsTab';

const TABS = [
  { key: 'upgrades', label: 'Upgrades' },
  { key: 'addons', label: 'Add-on Suggestions' },
  { key: 'pairs', label: 'Best Pairs' },
  { key: 'interstitials', label: 'Interstitials' },
] as const;

type TabKey = typeof TABS[number]['key'];

interface Props {
  rules: any[];
  suggestions: any[];
  pairRules: any[];
  menuItems: MenuItem[];
  categories: Category[];
  bundles: Bundle[];
}

export default function UpsellContent({ rules, suggestions, pairRules, menuItems, categories, bundles }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('upgrades');

  const upgradeRules = rules.filter((r: any) => r.phase === 'upgrade');
  const interstitialRules = rules.filter((r: any) => r.phase === 'interstitial');

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">Upsell Configuration</h1>
        <p className="font-nunito text-sm text-stone-500 mt-1">Configure upgrade offers, add-on suggestions, best pairs, and checkout interstitials</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#E8E3DA] bg-white px-6">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-nunito font-semibold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#7BBFB5] text-[#3D8A80]'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'upgrades' && (
          <UpsellUpgradesTab rules={upgradeRules} menuItems={menuItems} categories={categories} bundles={bundles} />
        )}
        {activeTab === 'addons' && (
          <UpsellAddonsTab suggestions={suggestions} menuItems={menuItems} />
        )}
        {activeTab === 'pairs' && (
          <UpsellPairsTab pairRules={pairRules} menuItems={menuItems} categories={categories} bundles={bundles} />
        )}
        {activeTab === 'interstitials' && (
          <UpsellInterstitialsTab rules={interstitialRules} menuItems={menuItems} categories={categories} bundles={bundles} />
        )}
      </div>
    </div>
  );
}
