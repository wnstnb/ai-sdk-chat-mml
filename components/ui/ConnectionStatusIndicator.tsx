import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface ConnectionStatusIndicatorProps {
  className?: string;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ 
  className = '' 
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [lastError, setLastError] = useState<string>('');

  useEffect(() => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Test connection with a simple query
    const testConnection = async () => {
      try {
        const { error } = await client.from('documents').select('id').limit(1);
        if (error) {
          setStatus('disconnected');
          setLastError(error.message);
        } else {
          setStatus('connected');
          setLastError('');
        }
      } catch (error) {
        setStatus('disconnected');
        setLastError('Network error');
      }
    };

    // Test connection immediately
    testConnection();

    // Set up realtime connection monitoring
    const channel = client.channel('connection-status-monitor');
    
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        setStatus('connected');
        setLastError('');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setStatus('disconnected');
        setLastError(err?.message || 'Connection error');
      } else if (status === 'CLOSED') {
        setStatus('reconnecting');
      }
    });

    // Periodic connection check
    const interval = setInterval(testConnection, 30000); // Check every 30 seconds

    return () => {
      clearInterval(interval);
      client.removeChannel(channel);
    };
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-500',
          icon: Wifi,
          tooltip: 'Connected - Real-time updates active',
          pulse: false
        };
      case 'reconnecting':
        return {
          color: 'bg-yellow-500',
          icon: AlertTriangle,
          tooltip: 'Reconnecting...',
          pulse: true
        };
      case 'disconnected':
        return {
          color: 'bg-red-500',
          icon: WifiOff,
          tooltip: `Disconnected${lastError ? ` - ${lastError}` : ''}`,
          pulse: false
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`relative group ${className}`}>
      <div 
        className={`
          flex items-center justify-center w-4 h-4 rounded-full 
          ${config.color} 
          ${config.pulse ? 'animate-pulse' : ''}
          transition-colors duration-300
          shadow-lg border border-white/20
        `}
        title={config.tooltip}
      >
        <Icon className="w-2.5 h-2.5 text-white" />
      </div>
      
      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg border border-gray-700">
        {config.tooltip}
      </div>
    </div>
  );
}; 