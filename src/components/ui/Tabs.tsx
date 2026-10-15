import React from 'react';
import { cn } from '../../utils/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('border-b border-ink-200 overflow-x-auto no-scrollbar', className)}>
      <nav className="flex space-x-1 sm:space-x-4 min-w-max" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-all min-h-[44px]',
                isActive
                  ? 'border-crimson-600 text-crimson-700 font-semibold'
                  : 'border-transparent text-ink-500 hover:text-ink-800 hover:border-ink-300'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon && <span className="inline-flex shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs rounded-full font-mono',
                    isActive ? 'bg-crimson-100 text-crimson-800' : 'bg-ink-100 text-ink-600'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
