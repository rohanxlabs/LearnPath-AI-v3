import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { User, CreditCard, Settings, FileText, LogOut } from 'lucide-react';
import { UserProfile } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * ProfileMenu — account dropdown for the mobile header avatar.
 * Animated with Framer Motion (replaces the previous anime.js dependency).
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
  onLegalClick?: (page: 'terms' | 'privacy') => void;
  onLogout?: () => void;
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.22, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -6,
    transition: { duration: 0.16, ease: 'easeIn' as const },
  },
};

const makeItemVariants = (reduced: boolean) => ({
  hidden: { opacity: 0, x: reduced ? 0 : 10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: reduced ? 0 : i * 0.04, duration: reduced ? 0 : 0.22, ease: 'easeOut' as const },
  }),
});

export function ProfileMenu({ profile, onTabChange, onUpgradeClick, onSettingsClick, onLegalClick, onLogout }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const itemVariants = makeItemVariants(reduced);

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

  const menuItems: MenuItem[] = [
    { label: 'Profile', icon: <User className="w-4 h-4" />, onClick: () => { onTabChange('profile'); close(); } },
    {
      label: 'Plan',
      value: profile.isPro ? 'PRO' : 'FREE',
      icon: <CreditCard className="w-4 h-4" />,
      onClick: () => { onUpgradeClick(); close(); },
    },
    { label: 'Settings', icon: <Settings className="w-4 h-4" />, onClick: () => { onSettingsClick?.(); close(); } },
    { label: 'Terms & Policies', icon: <FileText className="w-4 h-4" />, onClick: () => { onLegalClick?.('terms'); close(); } },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open profile menu"
        className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10 hover:border-purple-500 transition-all duration-200 flex-shrink-0 cursor-pointer"
      >
        <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616]/95 backdrop-blur-md p-2 shadow-[0_8px_24px_rgba(0,0,0,0.14)] z-50"
          >
            <div className="px-3 py-2 mb-1 border-b border-zinc-100 dark:border-white/10">
              <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{profile.name}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{profile.email}</div>
            </div>

            <div className="space-y-1">
              {menuItems.map((item, i) => (
                <motion.button
                  key={item.label}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  onClick={item.onClick}
                  role="menuitem"
                  className="group w-full flex items-center rounded-xl border border-transparent p-2.5 transition-all duration-200 hover:border-zinc-200 dark:hover:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <div className="flex flex-1 items-center gap-2 text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white">
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  {item.value && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold tracking-tight ${
                        item.label === 'Plan'
                          ? item.value === 'PRO'
                            ? 'bg-gradient-to-r from-purple-500 to-blue-600 text-white'
                            : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {item.value}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>

            <div className="my-2 h-px bg-zinc-100 dark:bg-white/10" />

            <motion.button
              custom={menuItems.length}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              onClick={() => { onLogout?.(); close(); }}
              className="group w-full flex items-center gap-2.5 rounded-xl border border-transparent bg-red-500/10 p-2.5 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/20 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-300" />
              <span className="text-sm font-medium text-red-400 group-hover:text-red-300">Sign Out</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProfileMenu;
