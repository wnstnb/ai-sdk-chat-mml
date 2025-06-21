'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User, Check, X, AlertCircle } from 'lucide-react';

interface UsernameManagerProps {
  className?: string;
}

interface UsernameData {
  username: string;
  email: string;
}

interface UsernameValidation {
  isValid: boolean;
  isAvailable: boolean | null;
  message: string;
  isChecking: boolean;
}

const UsernameManager: React.FC<UsernameManagerProps> = ({ className = '' }) => {
  const [usernameData, setUsernameData] = useState<UsernameData | null>(null);
  const [currentUsername, setCurrentUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<UsernameValidation>({
    isValid: true,
    isAvailable: null,
    message: '',
    isChecking: false
  });

  // Debounced username validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentUsername && currentUsername !== usernameData?.username) {
        validateUsername(currentUsername);
      } else if (currentUsername === usernameData?.username) {
        setValidation({
          isValid: true,
          isAvailable: true,
          message: '',
          isChecking: false
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [currentUsername, usernameData?.username]);

  // Load current username on component mount
  useEffect(() => {
    fetchCurrentUsername();
  }, []);

  const fetchCurrentUsername = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/username');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load username');
      }
      
      setUsernameData(data);
      setCurrentUsername(data.username || '');
    } catch (err) {
      console.error('Error fetching username:', err);
      setError(err instanceof Error ? err.message : 'Failed to load username');
    } finally {
      setIsLoading(false);
    }
  };

  const validateUsername = async (username: string) => {
    setValidation(prev => ({ ...prev, isChecking: true }));
    
    // Client-side validation first
    if (!username) {
      setValidation({
        isValid: false,
        isAvailable: null,
        message: 'Username is required',
        isChecking: false
      });
      return;
    }
    
    if (username.length < 3 || username.length > 30) {
      setValidation({
        isValid: false,
        isAvailable: null,
        message: 'Username must be 3-30 characters long',
        isChecking: false
      });
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setValidation({
        isValid: false,
        isAvailable: null,
        message: 'Username can only contain letters, numbers, underscores, and hyphens',
        isChecking: false
      });
      return;
    }
    
    // Server-side availability check
    try {
      const response = await fetch('/api/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setValidation({
          isValid: false,
          isAvailable: false,
          message: data.error || 'Failed to check username availability',
          isChecking: false
        });
        return;
      }
      
      setValidation({
        isValid: true,
        isAvailable: data.available,
        message: data.available ? 'Username is available' : 'Username is already taken',
        isChecking: false
      });
      
    } catch (err) {
      console.error('Error validating username:', err);
      setValidation({
        isValid: false,
        isAvailable: null,
        message: 'Failed to check username availability',
        isChecking: false
      });
    }
  };

  const handleUsernameUpdate = async () => {
    if (!currentUsername || !validation.isValid || !validation.isAvailable) {
      return;
    }
    
    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await fetch('/api/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update username');
      }
      
      setUsernameData({ username: data.username, email: data.email });
      setSuccessMessage('Username updated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err) {
      console.error('Error updating username:', err);
      setError(err instanceof Error ? err.message : 'Failed to update username');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentUsername(value);
    setError(null);
    setSuccessMessage(null);
    
    // Reset validation when user starts typing
    if (value !== usernameData?.username) {
      setValidation({
        isValid: true,
        isAvailable: null,
        message: '',
        isChecking: false
      });
    }
  };

  const canUpdate = currentUsername !== usernameData?.username && 
                   validation.isValid && 
                   validation.isAvailable === true &&
                   !isUpdating;

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div>
          <h4 className="text-xs font-medium text-[--text-color] mb-1">Username</h4>
          <p className="text-xs text-[--muted-text-color]">Loading username...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div>
        <h4 className="text-xs font-medium text-[--text-color] mb-1">Username</h4>
        <p className="text-xs text-[--muted-text-color]">
          Your username is shown in comments and collaboration features
        </p>
      </div>
      
      <div className="space-y-2">
        {/* Username Input */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-[--muted-text-color]" />
            <input
              type="text"
              value={currentUsername}
              onChange={handleInputChange}
              placeholder="Enter username"
              className={`flex-1 px-2 py-1 text-xs bg-[--input-bg] border rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none ${
                validation.isValid 
                  ? validation.isAvailable === false 
                    ? 'border-red-400' 
                    : validation.isAvailable === true 
                      ? 'border-green-400' 
                      : 'border-[--border-color]'
                  : 'border-red-400'
              }`}
              disabled={isUpdating}
            />
            
            {/* Validation Icon */}
            <div className="w-4 h-4 flex items-center justify-center">
              {validation.isChecking ? (
                <div className="w-3 h-3 border border-[--primary-color] border-t-transparent rounded-full animate-spin" />
              ) : validation.isValid && validation.isAvailable === true ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : validation.isValid === false || validation.isAvailable === false ? (
                <X className="h-3 w-3 text-red-500" />
              ) : null}
            </div>
          </div>
          
          {/* Validation Message */}
          {validation.message && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${
              validation.isValid && validation.isAvailable === true
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              <AlertCircle className="h-3 w-3" />
              {validation.message}
            </div>
          )}
        </div>
        
        {/* Update Button */}
        <button
          onClick={handleUsernameUpdate}
          disabled={!canUpdate}
          className={`w-full px-3 py-1 text-xs rounded-md border transition-colors ${
            canUpdate
              ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color] hover:bg-[--primary-color-hover]'
              : 'bg-transparent border-[--border-color] text-[--muted-text-color] cursor-not-allowed'
          }`}
        >
          {isUpdating ? 'Updating...' : 'Update Username'}
        </button>
        
        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-1 p-2 text-xs bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
        
        {/* Success Message */}
        {successMessage && (
          <div className="flex items-center gap-1 p-2 text-xs bg-green-100 border border-green-400 text-green-700 rounded-md dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-400">
            <Check className="h-3 w-3" />
            {successMessage}
          </div>
        )}
        
        {/* Current Username Display */}
        {usernameData?.username && (
          <div className="text-xs text-[--muted-text-color]">
            Current: <span className="font-mono">{usernameData.username}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsernameManager; 