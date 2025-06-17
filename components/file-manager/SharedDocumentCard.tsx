import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  UserCheck 
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
  const PermissionIcon = permissionInfo.icon;

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
    >
      <Card 
        className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] 
          ${document.access_type === 'shared' ? 'border-l-4 border-l-blue-400' : ''}
          ${compact ? 'h-24' : 'h-40'}
        `}
        onClick={handleCardClick}
      >
        <CardHeader className={`${compact ? 'p-3 pb-2' : 'p-4 pb-2'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className={`${compact ? 'text-sm' : 'text-base'} font-medium truncate pr-2`}>
                {document.name}
              </CardTitle>
              
              {/* Permission and Access Type Badges */}
              <div className="flex items-center gap-2 mt-1">
                {document.access_type === 'shared' && (
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${permissionInfo.color} flex items-center gap-1`}
                    title={permissionInfo.description}
                  >
                    <PermissionIcon className="w-3 h-3" />
                    {permissionInfo.label}
                  </Badge>
                )}
                
                {document.access_type === 'shared' && (
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1"
                  >
                    <Users className="w-3 h-3" />
                    Shared
                  </Badge>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {onToggleSelect && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleSelectClick}
                >
                  <div className={`w-4 h-4 border-2 rounded ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                    {isSelected && <UserCheck className="w-3 h-3 text-white" />}
                  </div>
                </Button>
              )}
              
              {onToggleStar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleStarClick}
                >
                  {document.is_starred ? (
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  ) : (
                    <StarOff className="w-4 h-4 text-gray-400" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        {!compact && (
          <CardContent className="p-4 pt-0">
            <CardDescription className="text-sm text-gray-600 line-clamp-2 mb-2">
              {getSnippet()}
            </CardDescription>
            
            {/* Owner and Updated Info */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(document.updated_at), { addSuffix: true })}</span>
              </div>
              
              {showOwnerInfo && document.access_type === 'shared' && document.owner_email && (
                <div className="flex items-center gap-1 truncate max-w-[120px]" title={document.owner_email}>
                  <UserCheck className="w-3 h-3 text-blue-500" />
                  <span className="truncate">{document.owner_email.split('@')[0]}</span>
                </div>
              )}
            </div>
          </CardContent>
        )}
        
        {/* Hover overlay for external link indication */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-4 h-4 text-gray-400" />
        </div>
      </Card>
    </motion.div>
  );
};

export default SharedDocumentCard; 