import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ShareDocumentModal } from '../ShareDocumentModal';
import { toast } from 'sonner';

// Mock global fetch
global.fetch = jest.fn();

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(),
  },
  writable: true,
});

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}));

// Mock window.confirm
global.confirm = jest.fn();

// Mock window.location
delete (window as any).location;
window.location = { origin: 'https://example.com' } as any;

describe('ShareDocumentModal', () => {
  const mockOnClose = jest.fn();
  const mockDocumentId = 'test-doc-123';
  const mockDocumentTitle = 'Test Document';

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    documentId: mockDocumentId,
    documentTitle: mockDocumentTitle,
  };

  const mockPermissions = [
    {
      id: '1',
      user_id: 'user-1',
      user_email: 'user1@example.com',
      user_name: 'User One',
      permission_level: 'owner',
      granted_at: '2023-01-01T00:00:00Z',
      granted_by: 'current-user',
    },
    {
      id: '2',
      user_id: 'user-2',
      user_email: 'user2@example.com',
      user_name: 'User Two',
      permission_level: 'editor',
      granted_at: '2023-01-02T00:00:00Z',
      granted_by: 'user-1',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    (global.confirm as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Modal Rendering', () => {
    it('should render modal when isOpen is true', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      expect(screen.getByText('Share "Test Document"')).toBeInTheDocument();
      expect(screen.getByText('Invite by email')).toBeInTheDocument();
      expect(screen.getByText('Share link')).toBeInTheDocument();
    });

    it('should not render modal when isOpen is false', () => {
      render(<ShareDocumentModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Share "Test Document"')).not.toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ShareDocumentModal {...defaultProps} />);

      expect(screen.getByText('Loading permissions...')).toBeInTheDocument();
    });
  });

  describe('Permissions Loading', () => {
    it('should load and display current permissions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
        expect(screen.getByText('user2@example.com')).toBeInTheDocument();
        expect(screen.getByText('(you)')).toBeInTheDocument();
      });

      expect(global.fetch).toHaveBeenCalledWith(`/api/documents/${mockDocumentId}/permissions`);
    });

    it('should handle permissions loading error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load permissions'));
      });
    });

    it('should show empty state when no collaborators exist', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: [],
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No collaborators yet. Invite someone to get started!')).toBeInTheDocument();
      });
    });
  });

  describe('Email Invitation', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      (global.fetch as jest.Mock).mockClear();
    });

    it('should allow typing email address', async () => {
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
      
      expect(emailInput).toHaveValue('newuser@example.com');
    });

    it('should validate email format', async () => {
      const emailInput = screen.getByPlaceholderText('Enter email address');
      const sendButton = screen.getByRole('button', { name: /send invitation/i });

      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please enter a valid email address');
      });
    });

    it('should successfully invite a new user', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message: 'User successfully added to document',
          permission: {}
        }),
      });

      // Mock the reload permissions call
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: [...mockPermissions, {
            id: '3',
            user_id: 'user-3',
            user_email: 'newuser@example.com',
            user_name: 'New User',
            permission_level: 'editor',
            granted_at: '2023-01-03T00:00:00Z',
            granted_by: 'user-1',
          }],
          currentUserId: 'user-1'
        }),
      });

      const emailInput = screen.getByPlaceholderText('Enter email address');
      const sendButton = screen.getByRole('button', { name: /send invitation/i });

      fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Successfully invited newuser@example.com as editor');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/documents/${mockDocumentId}/permissions`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'newuser@example.com',
            permission_level: 'editor',
          }),
        })
      );
    });

    it('should handle invitation errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: 'User already has access to the document'
        }),
      });

      const emailInput = screen.getByPlaceholderText('Enter email address');
      const sendButton = screen.getByRole('button', { name: /send invitation/i });

      fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to invite user'));
      });
    });

    it('should prevent duplicate invitations', async () => {
      const emailInput = screen.getByPlaceholderText('Enter email address');
      const sendButton = screen.getByRole('button', { name: /send invitation/i });

      fireEvent.change(emailInput, { target: { value: 'user1@example.com' } });
      fireEvent.click(sendButton);

      expect(toast.error).toHaveBeenCalledWith('This user already has access to the document');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should allow selecting different permission levels', async () => {
      const permissionSelect = screen.getByDisplayValue('Editor');
      
      fireEvent.click(permissionSelect);
      
      await waitFor(() => {
        expect(screen.getByText('Viewer')).toBeInTheDocument();
        expect(screen.getByText('Commenter')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Viewer'));
      
      expect(permissionSelect).toHaveValue('viewer');
    });
  });

  describe('Share Link', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });
    });

    it('should display shareable link', () => {
      const linkInput = screen.getByDisplayValue(`https://example.com/editor/${mockDocumentId}`);
      expect(linkInput).toBeInTheDocument();
      expect(linkInput).toHaveAttribute('readonly');
    });

    it('should copy link to clipboard', async () => {
      const copyButton = screen.getByRole('button', { name: /copy link/i });
      
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`https://example.com/editor/${mockDocumentId}`);
        expect(toast.success).toHaveBeenCalledWith('Share link copied to clipboard');
      });
    });

    it('should handle clipboard copy failure', async () => {
      (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('Clipboard error'));
      
      const copyButton = screen.getByRole('button', { name: /copy link/i });
      
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy link to clipboard');
      });
    });
  });

  describe('Permission Management', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user2@example.com')).toBeInTheDocument();
      });

      (global.fetch as jest.Mock).mockClear();
    });

    it('should allow owner to change other user permissions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message: 'Permission updated successfully'
        }),
      });

      // Mock reload permissions
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      // Find user2's permission dropdown
      const permissionDropdowns = screen.getAllByRole('combobox');
      const user2Dropdown = permissionDropdowns.find(dropdown => 
        dropdown.closest('[data-testid]')?.textContent?.includes('user2@example.com')
      );

      if (user2Dropdown) {
        fireEvent.click(user2Dropdown);
        
        await waitFor(() => {
          const viewerOption = screen.getByRole('option', { name: 'Viewer' });
          fireEvent.click(viewerOption);
        });

        await waitFor(() => {
          expect(toast.success).toHaveBeenCalledWith("Updated user2@example.com's permission to viewer");
        });
      }
    });

    it('should allow owner to remove other users', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      // Mock reload permissions
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: [mockPermissions[0]], // Only owner remains
          currentUserId: 'user-1'
        }),
      });

      const removeButtons = screen.getAllByRole('button', { name: /remove user/i });
      
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Removed user2@example.com from the document');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/documents/${mockDocumentId}/permissions/user-2`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should prevent owner from removing themselves', async () => {
      // The current user (user-1) should not have a remove button
      const ownerRow = screen.getByText('user1@example.com').closest('div');
      const removeButton = ownerRow?.querySelector('button[aria-label*="remove"]');
      
      expect(removeButton).not.toBeInTheDocument();
    });

    it('should show permission levels as read-only for non-owners', async () => {
      // Re-render as non-owner user
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-2' // Now user-2 is the current user
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user2@example.com')).toBeInTheDocument();
        expect(screen.getByText('(you)')).toBeInTheDocument();
      });

      // Should show permission levels as text, not dropdowns for non-owners
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('Modal Interactions', () => {
    it('should show confirmation when closing with unsaved invitation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      // Type email but don't send
      const emailInput = screen.getByPlaceholderText('Enter email address');
      fireEvent.change(emailInput, { target: { value: 'unsent@example.com' } });

      // Try to close
      const doneButton = screen.getByRole('button', { name: 'Done' });
      fireEvent.click(doneButton);

      expect(global.confirm).toHaveBeenCalledWith('You have an unsent invitation. Discard and close?');
    });

    it('should close without confirmation when no unsaved changes', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      const doneButton = screen.getByRole('button', { name: 'Done' });
      fireEvent.click(doneButton);

      expect(global.confirm).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should focus email input when modal opens', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText('Enter email address');
        expect(emailInput).toHaveFocus();
      });
    });

    it('should handle Enter key in email input', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      // Mock successful invitation
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Success', permission: {} }),
      });

      // Mock reload
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('Enter email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
      });
    });

    it('should handle malformed API responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'));
      });
    });

    it('should disable invitation form during loading', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          permissions: mockPermissions,
          currentUserId: 'user-1'
        }),
      });

      // Mock slow invitation request
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<ShareDocumentModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('Enter email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const sendButton = screen.getByRole('button', { name: /send invitation/i });
      fireEvent.click(sendButton);

      // Form should be disabled during request
      expect(emailInput).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });
  });
}); 