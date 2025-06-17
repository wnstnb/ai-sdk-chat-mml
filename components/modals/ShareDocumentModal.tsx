import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Users, Mail, Copy, Trash2, Shield, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useModalStore } from '@/stores/useModalStore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface DocumentPermission {
  id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  permission_level: 'owner' | 'editor' | 'commenter' | 'viewer';
  granted_at: string;
  granted_by: string;
}

interface ShareDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle?: string;
}

const PERMISSION_LEVELS = [
  { value: 'owner', label: 'Owner', description: 'Full access including sharing and deletion' },
  { value: 'editor', label: 'Editor', description: 'Can edit and comment' },
  { value: 'commenter', label: 'Commenter', description: 'Can comment only' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
] as const;

export const ShareDocumentModal: React.FC<ShareDocumentModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle = 'Document',
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissionLevel, setInvitePermissionLevel] = useState<'owner' | 'editor' | 'commenter' | 'viewer'>('editor');
  const [currentPermissions, setCurrentPermissions] = useState<DocumentPermission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareableLink, setShareableLink] = useState<string>('');
  
  // Direct permission assignment state
  const [isAssigning, setIsAssigning] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Helper function to check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return inviteEmail.trim() !== '';
  }, [inviteEmail]);

  // Enhanced close handler with confirmation
  const handleCloseModal = useCallback(() => {
    if (hasUnsavedChanges() && !isLoading && !isInviting && !isAssigning) {
      if (window.confirm('You have unsaved changes. Discard and close?')) {
        setInviteEmail('');
        onClose();
      }
      // If user chooses not to discard, modal remains open
    } else {
      // No unsaved changes or currently processing, close immediately
      onClose();
    }
  }, [hasUnsavedChanges, isLoading, isInviting, isAssigning, onClose]);

  // Load current permissions when modal opens
  const loadPermissions = useCallback(async () => {
    if (!documentId || !isOpen) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/permissions`);
      if (!response.ok) {
        throw new Error('Failed to load document permissions');
      }
      const data = await response.json();
      setCurrentPermissions(data.permissions || []);
      setCurrentUserId(data.currentUserId);
      
      // Generate shareable link (could be enhanced with tokens)
      setShareableLink(`${window.location.origin}/editor/${documentId}`);
    } catch (error: any) {
      console.error('Error loading permissions:', error);
      toast.error(`Failed to load permissions: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, isOpen]);

  // Load permissions when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPermissions();
      // Focus email input when modal opens
      setTimeout(() => emailInputRef.current?.focus(), 100);
    } else {
      // Reset form when modal closes
      setInviteEmail('');
      setInvitePermissionLevel('editor');
      setCurrentPermissions([]);
    }
  }, [isOpen, loadPermissions]);

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle inviting a new user
  const handleInviteUser = async () => {
    const email = inviteEmail.trim();
    
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Check if user is already invited
    const existingPermission = currentPermissions.find(p => p.user_email.toLowerCase() === email.toLowerCase());
    if (existingPermission) {
      toast.error('This user already has access to the document');
      return;
    }

    setIsInviting(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          permission_level: invitePermissionLevel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to invite user' }));
        throw new Error(errorData.error || 'Failed to invite user');
      }

      const result = await response.json();
      toast.success(`Successfully invited ${email} as ${invitePermissionLevel}`);
      
      // Clear form
      setInviteEmail('');
      setInvitePermissionLevel('editor');
      
      // Reload permissions
      await loadPermissions();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast.error(`Failed to invite user: ${error.message}`);
    } finally {
      setIsInviting(false);
    }
  };

  // Handle direct permission assignment (no invitation)
  const handleDirectAssignment = async () => {
    const email = inviteEmail.trim();
    
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Check if user is already assigned
    const existingPermission = currentPermissions.find(p => p.user_email.toLowerCase() === email.toLowerCase());
    if (existingPermission) {
      toast.error('This user already has access to the document');
      return;
    }

    setIsAssigning(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          permission_level: invitePermissionLevel,
          skipNotification: true, // Skip sending invitation email
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to assign permissions' }));
        throw new Error(errorData.error || 'Failed to assign permissions');
      }

      const result = await response.json();
      toast.success(`Successfully assigned ${invitePermissionLevel} permissions to ${email}`);
      
      // Clear form
      setInviteEmail('');
      setInvitePermissionLevel('editor');
      
      // Reload permissions
      await loadPermissions();
    } catch (error: any) {
      console.error('Error assigning permissions:', error);
      toast.error(`Failed to assign permissions: ${error.message}`);
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle permission level change
  const handlePermissionChange = async (userId: string, newPermissionLevel: string) => {
    if (userId === currentUserId && newPermissionLevel !== 'owner') {
      toast.error("You cannot change your own owner permissions");
      return;
    }

    const permission = currentPermissions.find(p => p.user_id === userId);
    if (!permission) return;

    try {
      const response = await fetch(`/api/documents/${documentId}/permissions/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permission_level: newPermissionLevel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update permissions' }));
        throw new Error(errorData.error?.message || errorData.error || 'Failed to update permissions');
      }

      toast.success(`Updated ${permission.user_email}'s permission to ${newPermissionLevel}`);
      await loadPermissions();
    } catch (error: any) {
      console.error('Error updating permission:', error);
      toast.error(`Failed to update permission: ${error.message}`);
    }
  };

  // Handle removing a user
  const handleRemoveUser = async (userId: string) => {
    if (userId === currentUserId) {
      toast.error("You cannot remove yourself from the document");
      return;
    }

    const permission = currentPermissions.find(p => p.user_id === userId);
    if (!permission) return;

    if (!window.confirm(`Remove ${permission.user_email} from this document?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${documentId}/permissions/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to remove user' }));
        throw new Error(errorData.error || 'Failed to remove user');
      }

      toast.success(`Removed ${permission.user_email} from the document`);
      await loadPermissions();
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error(`Failed to remove user: ${error.message}`);
    }
  };

  // Handle copying share link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success('Share link copied to clipboard');
    } catch (error) {
      console.error('Error copying link:', error);
      toast.error('Failed to copy link to clipboard');
    }
  };

  if (!isOpen) return null;

  const currentUserPermission = currentPermissions.find(p => p.user_id === currentUserId);
  const isOwner = currentUserPermission?.permission_level === 'owner';
  const canInvite = isOwner || currentUserPermission?.permission_level === 'editor';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { handleCloseModal(); } }}>
      <DialogContent 
        className="bg-[var(--editor-bg)] text-[--text-color] p-0 max-w-2xl max-h-[90vh] flex flex-col gap-0"
        style={{ zIndex: 1050 }}
        onPointerDownOutside={(e) => {
          // Allow interaction with toasts
          if ((e.target as HTMLElement).closest('[data-sonner-toast]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          // Allow interaction with toasts
          if ((e.target as HTMLElement).closest('[data-sonner-toast]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[--border-color]">
          <DialogTitle className="text-xl font-semibold flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Share &ldquo;{documentTitle}&rdquo;
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-6">
          {/* Invite New User Section */}
          {canInvite && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <UserPlus className="h-4 w-4 text-[--muted-text-color]" />
                <Label className="text-sm font-medium">Add collaborator</Label>
              </div>
              <p className="text-xs text-[--muted-text-color]">
                Send an invitation email or assign permissions directly.
              </p>
              
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Input
                    ref={emailInputRef}
                    type="email"
                    placeholder="Enter email address"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isInviting) {
                        handleInviteUser();
                      }
                    }}
                    disabled={isInviting}
                    className="bg-[--input-bg] text-[--text-color] border-[--border-color]"
                  />
                </div>
                
                <Select
                  value={invitePermissionLevel}
                  onValueChange={(value: 'owner' | 'editor' | 'commenter' | 'viewer') => setInvitePermissionLevel(value)}
                  disabled={isInviting}
                >
                  <SelectTrigger className="w-32 bg-[--input-bg] text-[--text-color] border-[--border-color]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERMISSION_LEVELS.filter(level => 
                      // For invitations, exclude owner. For direct assignment by owners, include all levels
                      level.value !== 'owner' || isOwner
                    ).map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button
                  onClick={handleInviteUser}
                  disabled={isInviting || isAssigning || !inviteEmail.trim()}
                  className="px-4"
                  title="Send invitation email"
                >
                  {isInviting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Mail size={16} />
                  )}
                </Button>
                
                {isOwner && (
                  <Button
                    onClick={handleDirectAssignment}
                    disabled={isInviting || isAssigning || !inviteEmail.trim()}
                    className="px-4"
                    variant="outline"
                    title="Assign permissions without sending email"
                  >
                    {isAssigning ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <UserCheck size={16} />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}



          {/* Share Link Section */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Copy className="h-4 w-4 text-[--muted-text-color]" />
              <Label className="text-sm font-medium">Share link</Label>
            </div>
            
            <div className="flex space-x-2">
              <Input
                value={shareableLink}
                readOnly
                className="bg-[--input-bg] text-[--text-color] border-[--border-color] flex-1"
              />
              <Button onClick={handleCopyLink} variant="outline" className="px-4">
                <Copy size={16} />
              </Button>
            </div>
            <p className="text-xs text-[--muted-text-color]">
              Anyone with this link and appropriate permissions can view the document.
            </p>
          </div>
        </div>

        {/* Current Collaborators Section */}
        <div className="px-6 py-4 flex-grow overflow-y-auto border-t border-[--border-color]">
          <div className="flex items-center space-x-2 mb-4">
            <Shield className="h-4 w-4 text-[--muted-text-color]" />
            <Label className="text-sm font-medium">People with access</Label>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-[--muted-text-color]" />
              <span className="ml-2 text-sm text-[--muted-text-color]">Loading permissions...</span>
            </div>
          ) : currentPermissions.length === 0 ? (
            <p className="text-sm text-[--muted-text-color] text-center py-8">
              No collaborators yet. Invite someone to get started!
            </p>
          ) : (
            <div className="space-y-2">
              {currentPermissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center justify-between p-3 rounded-md bg-[--input-bg] border border-[--border-color]"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-[--text-color]">
                        {permission.user_email}
                      </span>
                      {permission.user_id === currentUserId && (
                        <span className="text-xs text-[--muted-text-color]">(you)</span>
                      )}
                    </div>
                    {permission.user_name && (
                      <p className="text-xs text-[--muted-text-color]">{permission.user_name}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {isOwner && permission.user_id !== currentUserId ? (
                      <Select
                        value={permission.permission_level}
                        onValueChange={(value) => handlePermissionChange(permission.user_id, value)}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs bg-[--input-bg] text-[--text-color] border-[--border-color]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={level.value} className="text-xs">
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-[--muted-text-color] capitalize px-2 py-1 bg-[--subtle-bg] rounded">
                        {permission.permission_level}
                      </span>
                    )}
                    
                    {isOwner && permission.user_id !== currentUserId && (
                      <Button
                        onClick={() => handleRemoveUser(permission.user_id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[--border-color] flex justify-end">
          <Button onClick={handleCloseModal} variant="outline">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 