import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  children: ReactNode;
}

export const Layout = ({ activeTab, onTabChange, children }: LayoutProps) => {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="flex-1 overflow-auto pl-8 md:pl-12 pr-6">
        <div className="py-8 md:py-10 pr-2">
          {children}
        </div>
      </main>
    </div>
  );
};
