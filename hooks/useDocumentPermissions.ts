import { useState, useEffect, useCallback } from 'react';

export type PermissionLevel = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface DocumentPermission {
  id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  permission_level: PermissionLevel;
  granted_at: string;
  granted_by: string;
}

export interface UseDocumentPermissionsReturn {
  // Current user's permission level
  userPermission: PermissionLevel | null;
  
  // All permissions for the document (for sharing UI)
  allPermissions: DocumentPermission[];
  
  // Current user ID
  currentUserId: string | null;
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // Methods
  refreshPermissions: () => Promise<void>;
  
  // Permission check helpers
  canEdit: boolean;
  canComment: boolean;
  canShare: boolean;
  canView: boolean;
  isOwner: boolean;
  isEditor: boolean;
  isCommenter: boolean;
  isViewer: boolean;
}

export const useDocumentPermissions = (documentId: string): UseDocumentPermissionsReturn => {
  const [userPermission, setUserPermission] = useState<PermissionLevel | null>(null);
  const [allPermissions, setAllPermissions] = useState<DocumentPermission[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!documentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/permissions`);
      
      if (!response.ok) {
        if (response.status === 403) {
          // User doesn't have access to this document
          setUserPermission(null);
          setError('You do not have access to this document');
          return;
        }
        throw new Error(`Failed to fetch permissions: ${response.status}`);
      }

      const data = await response.json();
      setAllPermissions(data.permissions || []);
      setCurrentUserId(data.currentUserId);
      
      // Find current user's permission level
      const currentUserPermission = data.permissions?.find((p: DocumentPermission) => p.user_id === data.currentUserId);
      setUserPermission(currentUserPermission?.permission_level || null);
      
    } catch (err) {
      console.error('Error fetching document permissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
      setUserPermission(null);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  // Initial fetch and refresh function
  const refreshPermissions = useCallback(async () => {
    await fetchPermissions();
  }, [fetchPermissions]);

  // Fetch permissions on mount and documentId change
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Permission check helpers
  const canEdit = userPermission === 'owner' || userPermission === 'editor';
  const canComment = userPermission === 'owner' || userPermission === 'editor' || userPermission === 'commenter';
  const canShare = userPermission === 'owner' || userPermission === 'editor';
  const canView = userPermission !== null; // Any permission level allows viewing
  const isOwner = userPermission === 'owner';
  const isEditor = userPermission === 'editor';
  const isCommenter = userPermission === 'commenter';
  const isViewer = userPermission === 'viewer';

  return {
    userPermission,
    allPermissions,
    currentUserId,
    isLoading,
    error,
    refreshPermissions,
    canEdit,
    canComment,
    canShare,
    canView,
    isOwner,
    isEditor,
    isCommenter,
    isViewer,
  };
}; 