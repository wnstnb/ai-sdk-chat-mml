import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// Mock Supabase
const mockSupabaseClient = {
  auth: {
    getSession: jest.fn(),
  },
  from: jest.fn(),
};

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

// Mock cookies
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

describe('/api/documents/[documentId]/permissions', () => {
  const mockDocumentId = 'test-doc-123';
  const mockUserId = 'user-123';
  const mockTargetUserId = 'user-456';

  const mockPermissions = [
    {
      id: '1',
      user_id: mockUserId,
      permission_level: 'owner',
      granted_at: '2023-01-01T00:00:00Z',
      granted_by: 'system',
      auth_users: {
        email: 'owner@example.com',
        raw_user_meta_data: { full_name: 'Owner User' },
      },
    },
    {
      id: '2',
      user_id: mockTargetUserId,
      permission_level: 'editor',
      granted_at: '2023-01-02T00:00:00Z',
      granted_by: mockUserId,
      auth_users: {
        email: 'editor@example.com',
        raw_user_meta_data: { full_name: 'Editor User' },
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default auth session mock
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: mockUserId } } },
      error: null,
    });
  });

  describe('GET /api/documents/[documentId]/permissions', () => {
    const createGetRequest = () => 
      new NextRequest('http://localhost/api/documents/test-doc-123/permissions');

    const params = { documentId: mockDocumentId };

    it('should return permissions for authorized user', async () => {
      // Mock permission check
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'document_permissions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { permission_level: 'owner' },
              error: null,
            }),
            order: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: mockPermissions,
            error: null,
          }),
        };
      });

      const response = await GET(createGetRequest(), { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.permissions).toHaveLength(2);
      expect(data.currentUserId).toBe(mockUserId);
      expect(data.permissions[0].user_email).toBe('owner@example.com');
    });

    it('should return 403 for user without document access', async () => {
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'document_permissions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
          };
        }
      });

      const response = await GET(createGetRequest(), { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const response = await GET(createGetRequest(), { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHENTICATED');
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      }));

      const response = await GET(createGetRequest(), { params });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/documents/[documentId]/permissions', () => {
    const createPostRequest = (body: any) => {
      const request = new NextRequest('http://localhost/api/documents/test-doc-123/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return request;
    };

    const params = { documentId: mockDocumentId };

    beforeEach(() => {
      // Mock user has owner permission by default
      mockSupabaseClient.from.mockImplementation((table) => {
        switch (table) {
          case 'document_permissions':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { permission_level: 'owner' },
                error: null,
              }),
              insert: jest.fn().mockReturnThis(),
            };
          default:
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
            };
        }
      });
    });

    it('should successfully invite a new user', async () => {
      const inviteData = {
        email: 'newuser@example.com',
        permission_level: 'editor',
      };

      // Mock user lookup - user exists
      mockSupabaseClient.from.mockImplementation((table) => {
        switch (table) {
          case 'document_permissions':
            const mockDocPermissions = {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn(),
              insert: jest.fn().mockReturnThis(),
            };
            
            // First call: check user permission
            // Second call: check existing permission (should return not found)
            // Third call: insert new permission
            mockDocPermissions.single
              .mockResolvedValueOnce({ data: { permission_level: 'owner' }, error: null })
              .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
            
            mockDocPermissions.insert.mockResolvedValue({
              data: { id: 'new-permission-id', ...inviteData },
              error: null,
            });
            
            return mockDocPermissions;
            
          case 'auth_users':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: 'new-user-id' },
                error: null,
              }),
            };
            
          case 'notifications':
            return {
              insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
            };
            
          default:
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
            };
        }
      });

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.message).toBe('User successfully added to document');
    });

    it('should validate email format', async () => {
      const invalidData = {
        email: 'invalid-email',
        permission_level: 'editor',
      };

      const response = await POST(createPostRequest(invalidData), { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('Invalid email format');
    });

    it('should validate permission level', async () => {
      const invalidData = {
        email: 'user@example.com',
        permission_level: 'invalid',
      };

      const response = await POST(createPostRequest(invalidData), { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('Valid permission_level is required');
    });

    it('should prevent non-owners from inviting users', async () => {
      // Mock user has editor permission (not owner)
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'document_permissions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { permission_level: 'editor' },
              error: null,
            }),
          };
        }
      });

      const inviteData = {
        email: 'newuser@example.com',
        permission_level: 'editor',
      };

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should handle user not found', async () => {
      mockSupabaseClient.from.mockImplementation((table) => {
        switch (table) {
          case 'document_permissions':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { permission_level: 'owner' },
                error: null,
              }),
            };
          case 'auth_users':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            };
        }
      });

      const inviteData = {
        email: 'nonexistent@example.com',
        permission_level: 'editor',
      };

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.message).toContain('User with this email address not found');
    });

    it('should prevent duplicate invitations', async () => {
      mockSupabaseClient.from.mockImplementation((table) => {
        switch (table) {
          case 'document_permissions':
            const mockDocPermissions = {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn(),
            };
            
            // First call: check user permission (owner)
            // Second call: check existing permission (already exists)
            mockDocPermissions.single
              .mockResolvedValueOnce({ data: { permission_level: 'owner' }, error: null })
              .mockResolvedValueOnce({ data: { id: 'existing' }, error: null });
            
            return mockDocPermissions;
            
          case 'auth_users':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: 'existing-user-id' },
                error: null,
              }),
            };
        }
      });

      const inviteData = {
        email: 'existing@example.com',
        permission_level: 'editor',
      };

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error.code).toBe('CONFLICT');
    });

    it('should prevent non-owners from granting owner permissions', async () => {
      // Mock user has editor permission
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'document_permissions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { permission_level: 'editor' },
              error: null,
            }),
          };
        }
      });

      const inviteData = {
        email: 'newuser@example.com',
        permission_level: 'owner',
      };

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.message).toContain('Only document owners can grant owner permissions');
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost/api/documents/test-doc-123/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_INPUT');
    });

    it('should handle database insertion errors', async () => {
      mockSupabaseClient.from.mockImplementation((table) => {
        switch (table) {
          case 'document_permissions':
            const mockDocPermissions = {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn(),
              insert: jest.fn().mockReturnThis(),
            };
            
            mockDocPermissions.single
              .mockResolvedValueOnce({ data: { permission_level: 'owner' }, error: null })
              .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
            
            mockDocPermissions.insert.mockResolvedValue({
              data: null,
              error: { message: 'Foreign key constraint violation' },
            });
            
            return mockDocPermissions;
            
          case 'auth_users':
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: 'user-id' },
                error: null,
              }),
            };
        }
      });

      const inviteData = {
        email: 'user@example.com',
        permission_level: 'editor',
      };

      const response = await POST(createPostRequest(inviteData), { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should handle session errors', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session expired' },
      });

      const request = new NextRequest('http://localhost/api/documents/test-doc-123/permissions');
      const response = await GET(request, { params: { documentId: mockDocumentId } });

      expect(response.status).toBe(500);
    });

    it('should handle missing session', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/documents/test-doc-123/permissions');
      const response = await GET(request, { params: { documentId: mockDocumentId } });

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error');
      });

      const request = new NextRequest('http://localhost/api/documents/test-doc-123/permissions');
      const response = await GET(request, { params: { documentId: mockDocumentId } });

      expect(response.status).toBe(500);
    });
  });
}); 