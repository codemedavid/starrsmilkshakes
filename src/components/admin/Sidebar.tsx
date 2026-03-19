'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  UtensilsCrossed,
  LayoutGrid,
  Users,
  Star,
  MapPin,
  CreditCard,
  Settings,
  MessageCircle,
  LogOut,
  Menu,
  X,
  Shield,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

interface SidebarProps {
  adminType: 'admin' | 'super_admin';
}

const navItems = [
  { label: 'Orders', href: '/admin/orders', icon: ClipboardList },
  { label: 'Menu', href: '/admin/menu', icon: UtensilsCrossed },
  { label: 'Categories', href: '/admin/categories', icon: LayoutGrid },
  { label: 'Customers', href: '/admin/customers', icon: Users },
  { label: 'Loyalty', href: '/admin/loyalty', icon: Star },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Branches', href: '/admin/branches', icon: MapPin },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

const superAdminItems = [
  { label: 'Facebook', href: '/admin/facebook', icon: MessageCircle },
];

export function Sidebar({ adminType }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const allItems = adminType === 'super_admin'
    ? [...navItems, ...superAdminItems]
    : navItems;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if logout request fails, redirect to login
    } finally {
      router.push('/admin/login');
    }
  };

  const isActive = (href: string) => {
    if (href === '/admin/orders') {
      return pathname === '/admin' || pathname === '/admin/orders' || pathname.startsWith('/admin/orders/');
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6">
        <Link
          href="/admin/orders"
          className="block"
          onClick={() => setMobileOpen(false)}
        >
          <h1 className="font-playfair text-xl font-semibold text-[#3D8A80] leading-tight">
            starr&apos;s<br />famous shakes
          </h1>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-1">
        {allItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-nunito font-medium
                transition-all duration-200
                ${active
                  ? 'bg-[#7BBFB5]/10 text-[#3D8A80] border-r-2 border-[#7BBFB5]'
                  : 'text-stone-500 hover:bg-[#F2EEE8] hover:text-stone-900'
                }
              `}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-3 border-t border-[#E8E3DA] pt-4 mt-2">
        {/* Admin type badge */}
        <div className="flex items-center gap-2 px-3 py-2">
          {adminType === 'super_admin' ? (
            <ShieldCheck className="h-4 w-4 text-[#3D8A80]" />
          ) : (
            <Shield className="h-4 w-4 text-stone-400" />
          )}
          <span className="text-xs font-nunito font-medium text-stone-500">
            {adminType === 'super_admin' ? 'Super Admin' : 'Admin'}
          </span>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="
            flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-nunito font-medium
            text-stone-500 hover:bg-red-50 hover:text-red-600
            transition-all duration-200 disabled:opacity-50
          "
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span>{loggingOut ? 'Logging out...' : 'Log out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="
          fixed top-4 left-4 z-40 lg:hidden
          p-2 bg-white rounded-lg border border-[#E8E3DA] shadow-sm
          text-stone-600 hover:text-stone-900 hover:bg-[#F2EEE8]
          transition-all duration-200
        "
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-[#E8E3DA]
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-all duration-200"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 bg-white border-r border-[#E8E3DA]">
        {sidebarContent}
      </aside>
    </>
  );
}
