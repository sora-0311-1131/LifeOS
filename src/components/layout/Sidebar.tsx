'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Target, 
  Calendar,
  BookOpen,
  RefreshCw,
  Book,
  Wallet,
  Code,
  Bot,
  Settings,
  LogOut,
  Clock,
  Menu,
  X,
  Lock
} from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { siteConfig } from "@/config/site";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** true の項目は未実装。サイドバー上で無効化表示される */
  comingSoon?: boolean;
};

const NAVIGATION_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Goals', href: '/goals', icon: Target },
  { name: 'Periods', href: '/periods', icon: Clock },
  { name: 'Events', href: '/events', icon: Calendar },
  { name: 'Calendar', href: '/calendar', icon: Calendar, comingSoon: true },
  { name: 'Study', href: '/study', icon: BookOpen, comingSoon: true },
  { name: 'Habits', href: '/habits', icon: RefreshCw, comingSoon: true },
  { name: 'Journal', href: '/journal', icon: Book, comingSoon: true },
  { name: 'Finance', href: '/finance', icon: Wallet, comingSoon: true },
  { name: 'Development', href: '/development', icon: Code, comingSoon: true },
  { name: 'AI', href: '/ai', icon: Bot, comingSoon: true },
];

const SETTINGS_COMING_SOON = false;

function ComingSoonItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <div
      role="link"
      aria-disabled="true"
      title={`${item.name} は未実装です`}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-neutral-400 dark:text-neutral-600 cursor-not-allowed select-none"
    >
      <Icon className="w-4 h-4 opacity-60" />
      <span className="flex-1">{item.name}</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-700">
        <Lock className="w-2.5 h-2.5" />
        Soon
      </span>
    </div>
  );
}

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  
  // Close sidebar on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (pathname === '/login') return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.assign('/login');
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="xl:hidden flex items-center gap-3 p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0 relative z-30">
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
          <Target className="w-6 h-6 text-blue-500" />
          {siteConfig.name}
        </h2>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="xl:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800
        transform transition-transform duration-300 ease-in-out flex flex-col h-[100dvh]
        xl:relative xl:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 pb-2 flex justify-between items-center">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-500" />
            <span className="block">{siteConfig.name}</span>
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="xl:hidden p-2 -mr-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {NAVIGATION_ITEMS.filter((item) => !item.comingSoon).map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-600 dark:text-blue-400' 
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}

          {NAVIGATION_ITEMS.some((item) => item.comingSoon) && (
            <div className="pt-6">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
                Coming Soon
              </p>
              <div className="space-y-1">
                {NAVIGATION_ITEMS.filter((item) => item.comingSoon).map((item) => (
                  <ComingSoonItem key={item.name} item={item} />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
          {SETTINGS_COMING_SOON ? (
            <ComingSoonItem item={{ name: 'Settings', href: '/settings', icon: Settings, comingSoon: true }} />
          ) : (
            <Link 
              href="/settings"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/settings' 
                  ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white' 
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          )}
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 mt-1 rounded-lg text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition-colors text-left"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

