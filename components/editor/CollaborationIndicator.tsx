'use client';

import React from 'react';
import { UserAwareness } from '@/lib/collaboration/yjsDocument';
import { ConnectionState } from '@/lib/collaboration/partykitYjsProvider';

interface CollaborationIndicatorProps {
  activeUsers: Array<UserAwareness & { userId: string; lastSeen: string }>;
  currentUserId?: string;
  isConnected?: boolean;
  connectionState?: ConnectionState | null;
  onRetryConnection?: () => void;
  className?: string;
}

export default function CollaborationIndicator({
  activeUsers,
  currentUserId,
  isConnected = false,
  connectionState,
  onRetryConnection,
  className = '',
}: CollaborationIndicatorProps) {
  // Filter out current user from the display
  const otherUsers = activeUsers.filter(user => user.userId !== currentUserId);
  
  // Calculate activity status
  const getActivityStatus = (lastSeen: string) => {
    const lastSeenTime = new Date(lastSeen).getTime();
    const now = Date.now();
    const diff = now - lastSeenTime;
    
    if (diff < 30000) return 'active'; // Active within 30 seconds
    if (diff < 300000) return 'idle'; // Idle within 5 minutes
    return 'away'; // Away
  };

  // Get connection status indicator
  const getConnectionIndicator = () => {
    if (!isConnected) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-red-600">
            {connectionState?.isReconnecting 
              ? `Reconnecting... (${connectionState.reconnectAttempts}/10)` 
              : 'Disconnected'
            }
          </span>
          {onRetryConnection && !connectionState?.isReconnecting && (
            <button
              onClick={onRetryConnection}
              className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      );
    }

    if (connectionState?.isReconnecting) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-xs text-yellow-600">
            Reconnecting... ({connectionState.reconnectAttempts}/10)
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-green-600">Connected</span>
      </div>
    );
  };

  // Render user avatars with activity indicators
  const renderUserAvatars = () => {
    if (otherUsers.length === 0) return null;

    const displayUsers = otherUsers.slice(0, 5);
    const additionalUsers = otherUsers.length - 5;

    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-2">
          {otherUsers.length} user{otherUsers.length !== 1 ? 's' : ''} online
        </span>
        {displayUsers.map((user) => {
          const activity = getActivityStatus(user.lastSeen);
          const activityColors = {
            active: 'ring-green-400',
            idle: 'ring-yellow-400',
            away: 'ring-gray-400',
          };

          return (
            <div
              key={user.userId}
              className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white ring-2 ${activityColors[activity]} transition-all duration-200`}
              style={{ backgroundColor: user.user?.color || '#3b82f6' }}
              title={`${user.user?.name || 'Anonymous User'} (${activity})`}
            >
              {(user.user?.name || 'A').charAt(0).toUpperCase()}
              {activity === 'active' && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white" />
              )}
            </div>
          );
        })}
        {additionalUsers > 0 && (
          <div 
            className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center text-xs font-medium text-white ring-2 ring-gray-300"
            title={`+${additionalUsers} more users`}
          >
            +{additionalUsers}
          </div>
        )}
      </div>
    );
  };

  // Render typing indicators
  const renderTypingIndicators = () => {
    const activeTypers = otherUsers.filter(user => {
      const activity = getActivityStatus(user.lastSeen);
      return activity === 'active';
    });

    if (activeTypers.length === 0) return null;

    return (
      <div className="flex items-center gap-1 text-xs text-blue-600">
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span>
          {activeTypers.length === 1 
            ? `${activeTypers[0].user?.name || 'Someone'} is typing...`
            : `${activeTypers.length} people are typing...`
          }
        </span>
      </div>
    );
  };

  return (
    <div className={`collaboration-indicator flex items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-4">
        {getConnectionIndicator()}
        {renderUserAvatars()}
      </div>
      
      {isConnected && renderTypingIndicators()}
      
      {/* Connection details */}
      {connectionState && connectionState.connectionStartTime && (
        <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
          <span>
            Connected: {new Date(connectionState.connectionStartTime).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
} 