import React, { useMemo } from 'react';
import { useBlockStatus } from '@/lib/hooks/editor/useBlockStatus';
import Spinner from '@/components/ui/Spinner'; // Import the Spinner
import { BlockStatus } from '@/app/lib/clientChatOperationState'; // Import BlockStatus enum
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // Added Framer Motion imports

export interface BlockLoadingStateProps {
  blockId: string;
  children: React.ReactNode;
  loadingText?: string; // Optional custom loading text
}

// Moved overlayVariants outside as it's a constant
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const BlockLoadingStateRaw: React.FC<BlockLoadingStateProps> = ({
  blockId,
  children,
  loadingText = 'AI processing...',
}) => {
  const blockStatus = useBlockStatus(blockId);
  const shouldReduceMotion = useReducedMotion();

  // Memoized transitionSettings
  const transitionSettings = useMemo(() => (
    shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }
  ), [shouldReduceMotion]);

  if (blockStatus === BlockStatus.LOADING) {
    return (
      <div className="relative">
        {children}
        <AnimatePresence>
          <motion.div
            className="absolute inset-0 bg-gray-100/50 dark:bg-gray-900/50 flex flex-col items-center justify-center z-10"
            aria-live="polite"
            aria-busy="true"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={overlayVariants}
            transition={transitionSettings}
          >
            <Spinner size="sm" label={`Processing content for block ${blockId}`} />
            <span className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {loadingText}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // TODO: Handle BlockStatus.ERROR in a later subtask (e.g., show error icon and message)
  // TODO: Handle BlockStatus.MODIFIED (highlighting) will be a separate component/logic

  return <>{children}</>;
};

// Wrap with React.memo
const BlockLoadingState = React.memo(BlockLoadingStateRaw);

export default BlockLoadingState; 