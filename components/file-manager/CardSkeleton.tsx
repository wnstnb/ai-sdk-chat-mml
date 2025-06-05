import React from 'react';

const CardSkeleton: React.FC = () => {
  return (
    <article className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-[256px] aspect-[3/4] animate-pulse overflow-hidden">
      {/* Top Section Placeholder (approx 20%) */}
      <div className="h-[20%] bg-gray-200 dark:bg-gray-700 p-3 flex items-center border-b border-gray-300/50 dark:border-gray-600/50">
        <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded ml-auto"></div> {/* Icon Placeholder */}
      </div>

      {/* Body Section Placeholder (approx 80%) */}
      <div className="h-[80%] px-4 py-3 flex flex-col space-y-2.5">
        {/* Title Placeholder */}
        <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
        <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
        
        {/* Last Updated Placeholder */}
        <div className="h-3.5 bg-gray-200 dark:bg-gray-500 rounded w-1/3 mt-1 mb-1.5"></div>
        
        {/* Snippet Placeholder */}
        <div className="flex-grow space-y-2 pt-1">
          <div className="h-4 bg-gray-200 dark:bg-gray-500 rounded w-full"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-500 rounded w-full"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-500 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-500 rounded w-3/4"></div>
        </div>
      </div>
    </article>
  );
};

export default CardSkeleton; 