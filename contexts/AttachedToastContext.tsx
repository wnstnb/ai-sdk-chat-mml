import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AttachedToast } from '@/hooks/useAttachedToasts';
import { setGlobalAttachedToastContext } from '@/lib/utils/aiToast';

interface AttachedToastContextType {
    toasts: AttachedToast[];
    addToast: (content: React.ReactNode, id?: string) => string;
    removeToast: (id: string) => void;
    clearAllToasts: () => void;
}

const AttachedToastContext = createContext<AttachedToastContextType | null>(null);

export const AttachedToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<AttachedToast[]>([]);

    const addToast = useCallback((content: React.ReactNode, id?: string) => {
        const toastId = id || Date.now().toString();
        const newToast: AttachedToast = {
            id: toastId,
            content,
            isRemoving: false,
        };

        setToasts(prev => [...prev, newToast]);

        // Auto-remove after 3 seconds with graceful fade
        setTimeout(() => {
            removeToast(toastId);
        }, 3000);

        return toastId;
    }, []);

    const removeToast = useCallback((id: string) => {
        // First mark as removing to trigger exit animation
        setToasts(prev => prev.map(toast => 
            toast.id === id ? { ...toast, isRemoving: true } : toast
        ));
        
        // Actually remove after animation duration (300ms)
        setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id));
        }, 300);
    }, []);

    const clearAllToasts = useCallback(() => {
        setToasts([]);
    }, []);

    // Register this context with the global aiToast system
    useEffect(() => {
        setGlobalAttachedToastContext({ addToast, removeToast });
        
        // Cleanup on unmount
        return () => {
            setGlobalAttachedToastContext(null);
        };
    }, [addToast, removeToast]);

    return (
        <AttachedToastContext.Provider value={{ toasts, addToast, removeToast, clearAllToasts }}>
            {children}
        </AttachedToastContext.Provider>
    );
};

export const useAttachedToastContext = () => {
    const context = useContext(AttachedToastContext);
    if (!context) {
        throw new Error('useAttachedToastContext must be used within an AttachedToastProvider');
    }
    return context;
}; 