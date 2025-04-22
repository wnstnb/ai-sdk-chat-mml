'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/header';

interface ThemeHandlerProps {
  children: React.ReactNode;
}

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children }) => {
  // Default state to 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Effect to set initial theme from localStorage and update <html> attribute
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    // Check if window is defined (ensures runs only on client)
    if (typeof window !== 'undefined') { 
      // Default fallback to 'dark'
      const initialTheme = storedTheme || 'dark';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  // Effect to update localStorage and <html> attribute when theme changes
  useEffect(() => {
    // Check if window is defined (ensures runs only on client)
    if (typeof window !== 'undefined') { 
      localStorage.setItem('theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    // Apply flex layout and full height to this container
    <div className="flex flex-col h-screen">
      {/* Header takes its natural height */}
      <Header currentTheme={theme} onToggleTheme={handleToggleTheme} /> 
      {/* Main content area takes remaining space and handles overflow */}
      <main className="flex-grow overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default ThemeHandler; 