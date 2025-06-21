import React from 'react';
import { Badge } from "@/components/ui/badge";
import { DocumentWithSharingInfo } from '@/types/supabase';
import { 
  Clock, 
  Star, 
  StarOff, 
  Users, 
  Eye, 
  Edit3, 
  MessageSquare, 
  Crown,
  ExternalLink,
  UserCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

interface SharedDocumentCardProps {
  document: DocumentWithSharingInfo;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onToggleStar?: (documentId: string) => void;
  showOwnerInfo?: boolean;
  compact?: boolean;
}

const SharedDocumentCard: React.FC<SharedDocumentCardProps> = ({
  document,
  isSelected = false,
  onToggleSelect,
  onToggleStar,
  showOwnerInfo = true,
  compact = false
}) => {
  const router = useRouter();

  // Get permission level details
  const getPermissionInfo = () => {
    switch (document.permission_level) {
      case 'owner':
        return { 
          icon: Crown, 
          label: 'Owner', 
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          description: 'Full access'
        };
      case 'editor':
        return { 
          icon: Edit3, 
          label: 'Editor', 
          color: 'bg-green-100 text-green-800 border-green-200',
          description: 'Can edit and comment'
        };
      case 'commenter':
        return { 
          icon: MessageSquare, 
          label: 'Commenter', 
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          description: 'Can comment only'
        };
      case 'viewer':
        return { 
          icon: Eye, 
          label: 'Viewer', 
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          description: 'Read-only access'
        };
      default:
        return { 
          icon: Users, 
          label: 'Shared', 
          color: 'bg-purple-100 text-purple-800 border-purple-200',
          description: 'Shared document'
        };
    }
  };

  const permissionInfo = getPermissionInfo();

  const handleCardClick = () => {
    router.push(`/editor/${document.id}`);
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(document.id);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.();
  };

  // Get snippet text for preview
  const getSnippet = () => {
    return document.searchable_content?.slice(0, 120) + '...' || 'No preview available';
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`
        group relative flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-md 
        transition-all duration-300 ease-in-out motion-reduce:transition-none 
        overflow-hidden w-full max-w-[220px] aspect-[3/4] touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[var(--title-hover-color)] shadow-lg' : 'focus:ring-[var(--title-hover-color)]'}
        ${!isSelected ? 'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none' : ''}
        will-change-[transform,box-shadow,opacity]
        cursor-pointer
      `}
      role="button"
      tabIndex={0}
        onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Glass Header Section (Top 20%) */}
      <div className="relative h-[20%] p-3 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-600/50 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md rounded-t-lg">
        {/* Selection Checkbox */}
        {onToggleSelect && (
          <button 
            onClick={handleSelectClick}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors"
            aria-label={isSelected ? `Deselect document ${document.name}` : `Select document ${document.name}`}
            title={isSelected ? `Deselect document ${document.name}` : `Select document ${document.name}`}
          >
            {isSelected ? 
              <CheckSquare size={16} className="text-[var(--title-hover-color)]" /> : 
              <Square size={16} className="text-gray-500 dark:text-gray-400" />
            }
          </button>
        )}

        {/* Star Button */}
        {onToggleStar && (
          <button
            onClick={handleStarClick}
            className={`flex-shrink-0 p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors transition-opacity ${
              document.is_starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            aria-label={document.is_starred ? 'Remove from favorites' : 'Add to favorites'}
            title={document.is_starred ? 'Remove from favorites' : 'Add to favorites'}
          >
            {document.is_starred ? (
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
            ) : (
              <StarOff className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* Content Section (Bottom 80%) */}
      <div className="flex-1 flex flex-col p-3 bg-white dark:bg-gray-800 rounded-b-lg min-h-0">
        {/* Title */}
        <h3 
          title={document.name}
          className="text-base font-semibold leading-tight text-gray-900 dark:text-gray-100 truncate mb-2"
        >
          {document.name}
        </h3>
        
        {/* Content Snippet */}
        {!compact && (
          <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-3 flex-1">
            {getSnippet()}
          </div>
        )}
        
        {/* Footer with Two Rows */}
        <div className="mt-auto">
          {/* First Row: Owner Name (left-aligned) */}
          {showOwnerInfo && document.access_type === 'shared' && document.owner_email && (
            <div className="flex justify-start mb-1">
              <div className="flex items-center gap-1 truncate max-w-[150px] text-xs text-gray-500 dark:text-gray-400" title={document.owner_email}>
                <UserCheck className="w-3 h-3 text-blue-500" />
                <span className="truncate">{document.owner_email.split('@')[0]}</span>
              </div>
            </div>
          )}

          {/* Second Row: Timestamp and Badges */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(new Date(document.updated_at), { addSuffix: true })}</span>
            </div>
            
            {/* Badge Icons */}
            <div className="flex items-center gap-2">
              {document.access_type === 'shared' && (
                <Badge 
                  variant="outline" 
                  className={`${permissionInfo.color} flex items-center justify-center w-5 h-5 p-0 rounded-full`}
                  title={`${permissionInfo.label}: ${permissionInfo.description}`}
                >
                  <permissionInfo.icon className="w-2.5 h-2.5" />
                </Badge>
              )}
              
              {document.access_type === 'shared' && (
                <Badge 
                  variant="outline" 
                  className="bg-blue-50 text-blue-700 border-blue-200 flex items-center justify-center w-5 h-5 p-0 rounded-full"
                  title="Shared document"
                >
                  <Users className="w-2.5 h-2.5" />
                </Badge>
              )}
            </div>
          </div>
        </div>
              </div>
        
        {/* Hover overlay for external link indication */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
    </motion.article>
  );
};

export default SharedDocumentCard; 