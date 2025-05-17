'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SunIcon, MoonIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { SearchIcon, Home, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase/client';
import { PreferencesDropdown } from './PreferencesDropdown';
import { useModalStore } from '@/stores/useModalStore';

interface HeaderProps {
  onToggleTheme: () => void;
  currentTheme: 'light' | 'dark';
  onOpenSearch: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleTheme, currentTheme, onOpenSearch }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openFileBrowserModal = useModalStore((state) => state.openFileBrowserModal);

  const onLogout = async () => {
    console.log('Attempting logout...');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    } else {
      console.log('Logout successful, redirecting to /login');
      router.push('/login');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsPreferencesOpen(false);
      }
    };

    if (isPreferencesOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPreferencesOpen]);

  return (
    <header className="app-header">
      <div className="header-content">
        {/* Logo and Launch Link */}
        <div className="flex items-center gap-3">
          <Link href="/launch" className="text-[--text-color] hover:text-[--primary-color] transition-colors" title="Go to Launch Pad">
            <Home className="h-6 w-6" />
          </Link>
          <div className="header-logo">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-8 w-8" style={{ filter: 'var(--logo-filter)' }} />
          </div>
        </div>

        {/* Search Bar - Conditionally render */}
        {/* {pathname !== '/launch' && (
          <div className="flex-grow max-w-lg mx-auto px-4">
            <Omnibar displayResultsInline={true} searchType='tagging' />
          </div>
        )} */}

        {/* Actions */}
        <div className="header-actions">
          {/* ADDED: Search Icon Button */}
          <button
            onClick={onOpenSearch}
            className="theme-toggle"
            aria-label="Open search"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {/* New File Browser Modal Button */}
          <button
            onClick={openFileBrowserModal}
            className="theme-toggle"
            aria-label="Open file browser"
          >
            <FolderOpen className="h-5 w-5" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="theme-toggle"
            aria-label="Toggle theme"
          >
            {currentTheme === 'light' ? (
              <MoonIcon className="h-5 w-5" />
            ) : (
              <SunIcon className="h-5 w-5" />
            )}
          </button>

          {/* Logout Button */}
          <button onClick={onLogout} className="sign-out-button">Logout</button>

          {/* Preferences Dropdown Trigger */}
          <div className="relative">
            <button
              ref={triggerRef}
              onClick={() => setIsPreferencesOpen(!isPreferencesOpen)}
              className="theme-toggle"
              aria-label="User Preferences"
              aria-expanded={isPreferencesOpen}
              aria-haspopup="true"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>

            {isPreferencesOpen && (
              <div
                ref={dropdownRef}
                className="absolute top-full right-0 mt-2 z-50"
                role="menu"
              >
                <PreferencesDropdown />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;