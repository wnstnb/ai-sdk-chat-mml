import React, { useState, useEffect } from 'react';
import Skeleton, { SkeletonProps } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface BlockSkeletonProps extends SkeletonProps {
  isLoading?: boolean;
  count?: number;
  width?: string | number;
  height?: string | number;
  className?: string; // Allow passing className to the Skeleton component itself
  containerClassName?: string; // Allow passing className to the container of skeletons if count > 1
  // enableAnimation is part of SkeletonProps, so no need to redefine
}

const BlockSkeleton: React.FC<BlockSkeletonProps> = ({
  isLoading = true, // Default to true, so it shows when used directly
  count = 1,
  width,
  height,
  className,
  containerClassName,
  enableAnimation: propEnableAnimation, // Capture prop if user wants to override
  ...rest
}) => {
  const [animationEnabled, setAnimationEnabled] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      // Respect propEnableAnimation if explicitly provided, otherwise use media query
      setAnimationEnabled(propEnableAnimation !== undefined ? propEnableAnimation : !mediaQuery.matches);
    };

    handleChange(); // Initial check
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [propEnableAnimation]);

  if (!isLoading) {
    return null;
  }

  // If a specific height is provided, we can use it, otherwise let Skeleton default.
  // For multiple lines, Skeleton handles this well with `count`.
  // We can also provide a wrapper to style the container of skeletons if count > 1.

  return (
    <div className={containerClassName}>
      <Skeleton
        count={count}
        width={width}
        height={height}
        className={className}
        enableAnimation={animationEnabled}
        {...rest}
      />
    </div>
  );
};

export default BlockSkeleton; 