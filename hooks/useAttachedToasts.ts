import { useState, useCallback } from 'react';
import React from 'react';

export interface AttachedToast {
    id: string;
    content: React.ReactNode;
    isRemoving?: boolean; // Track removal state for graceful exit
}

export const useAttachedToasts = () => {
    const [toasts, setToasts] = useState<AttachedToast[]>([]);

    const addToast = useCallback((content: React.ReactNode, id?: string) => {
        const toastId = id || Date.now().toString();
        const newToast: AttachedToast = {
            id: toastId,
            content,
        };

        setToasts(prev => [...prev, newToast]);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            removeToast(toastId);
        }, 3000);

        return toastId;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const clearAllToasts = useCallback(() => {
        setToasts([]);
    }, []);

    return {
        toasts,
        addToast,
        removeToast,
        clearAllToasts,
    };
}; 