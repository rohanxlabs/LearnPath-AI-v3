import React, { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import { User, CreditCard, Settings, FileText, LogOut } from 'lucide-react';
import { UserProfile } from '../types';

/**
 * ProfileMenu — account dropdown for the mobile header avatar.
 * No Radix/shadcn dependency (none installed in this project); implemented
 * with a plain button + absolutely-positioned panel, closed on outside
 * click/Escape, and animated in/out with anime.js.
 */

interface MenuItem {
  label: string;
  value?: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export interface ProfileMenuProps {
  profile: UserProfile;
  onTabChange: (tab: string) => void;
  onUpgradeClick: () => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;
}

export function ProfileMenu({ profile, onTabChange, onUpgradeClick, onSettingsClick, onLogout }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (isOpen && panelRef.current) {
      animate(panelRef.current, {
        opacity: [0, 1],
        scale: [0.95, 1],
        translateY: [-6, 0],
        duration: 220,
        ease: 'outQuad',
      });
      animate('[data-menu-item]', {
        opacity: [0, 1],
        translateX: [10, 0],
        delay: stagger(40),
        duration: 260,
        ease: 'outQuad',
      });
    }
  }, [isOpen]);

  const menuItems: MenuItem[] = [
    { label: 'Profile', icon: <User className="w-4 h-4" />, onClick: () => { onTabChange('profile'); close(); } },
    {
      label: 'Plan',
      value: profile.isPro ? 'PRO' : 'FREE',
      icon: <CreditCard className="w-4 h-4" />,
      onClick: () => { onUpgradeClick(); close(); },
    },
    { label: 'Settings', icon: <Settings className="w-4 h-4" />, onClick: () => { onSettingsClick?.(); close(); } },
    { label: 'Terms & Policies', icon: <FileText className="w-4 h-4" />, onClick: close },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10 hover:border-purple-500 transition-all duration-200 flex-shrink-0 cursor-pointer"
      >
        <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-2xl border border-white/10 bg-[#161616]/95 backdrop-blur-md p-2 shadow-xl shadow-black/40 z-50 opacity-0"
        >
          <div className="px-3 py-2 mb-1 border-b border-white/5">
            <div className="text-sm font-semibold text-white truncate">{profile.name}</div>
            <div className="text-xs text-zinc-400 truncate">{profile.email}</div>
          </div>

          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.label}
                data-menu-item
                onClick={item.onClick}
                role="menuitem"
                className="opacity-0 group w-full flex items-center rounded-xl border border-transparent p-2.5 transition-all duration-200 hover:border-white/10 hover:bg-white/5 cursor-pointer"
              >
                <div className="flex flex-1 items-center gap-2 text-zinc-300 group-hover:text-white">
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {item.value && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold tracking-tight ${
                      item.label === 'Plan'
                        ? item.value === 'PRO'
                          ? 'bg-gradient-to-r from-purple-500 to-blue-600 text-white'
                          : 'bg-white/5 text-zinc-400 border border-white/10'
                        : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                    }`}
                  >
                    {item.value}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="my-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <button
            data-menu-item
            onClick={() => { onLogout?.(); close(); }}
            className="opacity-0 group w-full flex items-center gap-2.5 rounded-xl border border-transparent bg-red-500/10 p-2.5 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/20 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-300" />
            <span className="text-sm font-medium text-red-400 group-hover:text-red-300">Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
