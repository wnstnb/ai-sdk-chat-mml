'use client';

import React from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'; // Removed DocumentPlusIcon and ArrowDownTrayIcon

// Define props if needed, e.g., for theme toggling and logout function
interface HeaderProps {
  onToggleTheme: () => void;
  // onLogout: () => void;
  currentTheme: 'light' | 'dark';
}

const Header: React.FC<HeaderProps> = ({ onToggleTheme, /* onLogout, */ currentTheme }) => {
  // Placeholder functions/state for demonstration
  // const currentTheme = 'light'; // Replace with actual theme state
  // const onToggleTheme = () => console.log('Toggle theme');
  const onLogout = () => console.log('Logout');

  return (
    <header className="app-header"> {/* Use a specific class for the header container */}
      <div className="header-content"> {/* Use class for inner content alignment */}
        {/* Logo */}
        <div className="header-logo">
          tuon.io
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