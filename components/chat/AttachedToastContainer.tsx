import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface AttachedToastContainerProps {
    toasts: Array<{
        id: string;
        content: React.ReactNode;
        isRemoving?: boolean;
    }>;
    className?: string;
}

export const AttachedToastContainer: React.FC<AttachedToastContainerProps> = ({
    toasts,
    className = '',
}) => {
    if (toasts.length === 0) return null;

    return (
        <div className={`absolute bottom-full left-0 right-0 mb-2 z-50 ${className}`}>
            <div className="flex flex-col-reverse gap-2 px-4">
                <AnimatePresence mode="popLayout">
                    {toasts
                        .filter(toast => !toast.isRemoving) // Only show non-removing toasts
                        .map((toast, index) => (
                            <motion.div
                                key={toast.id}
                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ 
                                    duration: 0.3,
                                    ease: "easeOut",
                                    delay: index * 0.05 // Slight stagger for multiple toasts
                                }}
                                layout
                            >
                                {toast.content}
                            </motion.div>
                        ))}
                </AnimatePresence>
            </div>
        </div>
    );
}; 