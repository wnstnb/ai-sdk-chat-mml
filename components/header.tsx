'use client';

import React from 'react';
import { SunIcon, MoonIcon, FolderIcon } from '@heroicons/react/24/outline'; // Removed DocumentPlusIcon and ArrowDownTrayIcon, added FolderIcon
import Link from 'next/link'; // Add Link import
import { useRouter } from 'next/navigation'; // Import useRouter
import { supabase } from '../lib/supabase/client'; // Import Supabase client

// Define props if needed, e.g., for theme toggling and logout function
interface HeaderProps {
  onToggleTheme: () => void;
  // onLogout: () => void;
  currentTheme: 'light' | 'dark';
}

const Header: React.FC<HeaderProps> = ({ onToggleTheme, /* onLogout, */ currentTheme }) => {
  const router = useRouter(); // Initialize router

  // Updated onLogout function
  const onLogout = async () => {
    console.log('Attempting logout...');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
      // Optionally show an error message to the user
    } else {
      console.log('Logout successful, redirecting to /login');
      // Redirect to login page after successful logout
      router.push('/login'); 
      // Optionally clear any local state if needed
    }
  };

  return (
    <header className="app-header"> {/* Use a specific class for the header container */}
      <div className="header-content"> {/* Use class for inner content alignment */}
        {/* Logo and Launch Link */}
        <div className="flex items-center gap-3"> {/* Group logo and icon */}
          <Link href="/launch" className="text-[--text-color] hover:text-[--primary-color] transition-colors" title="Go to Launch Pad">
            <FolderIcon className="h-6 w-6" />
          </Link>
          <div className="header-logo">
            tuon.io
          </div>
        </div>

        {/* Actions */}
        <div className="header-actions">
          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="theme-toggle" // Removed action-button class
            aria-label="Toggle theme"
          >
            {currentTheme === 'light' ? (
              <MoonIcon className="h-5 w-5" />
            ) : (
              <SunIcon className="h-5 w-5" />
            )}
          </button>

          {/* Logout Button */}
          <button onClick={onLogout} className="sign-out-button">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header; 