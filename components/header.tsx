'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SunIcon, MoonIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { SearchIcon, Home, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase/client';
import { useModalStore } from '@/stores/useModalStore';

interface HeaderProps {
  onToggleTheme: () => void;
  currentTheme: 'light' | 'dark';
  onOpenSearch: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleTheme, currentTheme, onOpenSearch }) => {
  const router = useRouter();
  const pathname = usePathname();
  const openFileBrowserModal = useModalStore((state) => state.openFileBrowserModal);
  const openPreferencesModal = useModalStore((state) => state.openPreferencesModal);

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

  return (
    <header className="app-header">
      <div className="header-content flex justify-between items-center">
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
        <div className="header-actions ml-auto">
          {/* Search Icon Button */}
          <button
            onClick={onOpenSearch}
            className="theme-toggle text-[--text-color] hover:text-[--primary-color] hover:bg-transparent transition-colors"
            aria-label="Open search"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {/* File Browser Modal Button */}
          <button
            onClick={openFileBrowserModal}
            className="theme-toggle text-[--text-color] hover:text-[--primary-color] hover:bg-transparent transition-colors"
            aria-label="Open file browser"
          >
            <FolderOpen className="h-5 w-5" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="theme-toggle text-[--text-color] hover:text-[--primary-color] hover:bg-transparent transition-colors"
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

          {/* Preferences Modal Trigger */}
          <button
            onClick={openPreferencesModal}
            className="theme-toggle p-0 text-[--text-color] hover:text-[--primary-color] hover:bg-transparent transition-colors"
            aria-label="Open Preferences"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;