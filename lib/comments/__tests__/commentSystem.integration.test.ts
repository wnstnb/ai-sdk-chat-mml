import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { YjsThreadStore, DefaultThreadStoreAuth } from '@blocknote/core/comments';

// Import our services and components
import * as commentService from '../commentService';
import { CollaborationProvider } from '@/contexts/CollaborationContext';
import CollaborativeBlockNoteEditor from '@/components/editor/CollaborativeBlockNoteEditor';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

// Mock PartyKit provider
jest.mock('y-partykit/provider', () => {
  return jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }));
});

describe('Comment System Integration Tests', () => {
  let mockSupabase: any;
  let testDoc: Y.Doc;
  let testUser: any;

  beforeEach(() => {
    // Setup test environment
    testDoc = new Y.Doc();
    testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      user_metadata: { name: 'Test User' },
    };

    // Mock Supabase responses
    mockSupabase = {
      from: jest.fn(() => ({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: {
                id: 'thread-uuid-123',
                document_id: 'doc-123',
                thread_id: 'bn-thread-123',
                status: 'open',
                created_by: testUser.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                selection_data: { from: 0, to: 10 },
              },
              error: null,
            })),
          })),
        })),
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: {
                id: 'thread-uuid-123',
                thread_id: 'bn-thread-123',
                status: 'open',
              },
              error: null,
            })),
            order: jest.fn(() => Promise.resolve({
              data: [],
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({
                data: { id: 'thread-uuid-123', status: 'resolved' },
                error: null,
              })),
            })),
          })),
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({
                data: { id: 'thread-uuid-123' },
                error: null,
              })),
            })),
          })),
        })),
      })),
      auth: {
        getUser: jest.fn(() => Promise.resolve({
          data: { user: testUser },
          error: null,
        })),
      },
    };

    // Replace the mocked supabase
    (require('@/lib/supabase/client') as any).supabase = mockSupabase;
  });

  afterEach(() => {
    testDoc.destroy();
    jest.clearAllMocks();
  });

  describe('Comment Thread CRUD Operations', () => {
    it('should create a comment thread successfully', async () => {
      const result = await commentService.createCommentThread(
        'doc-123',
        'bn-thread-123',
        { from: 0, to: 10 }
      );

      expect(result.data).toBeDefined();
      expect(result.data?.thread_id).toBe('bn-thread-123');
      expect(result.error).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('comment_threads');
    });

    it('should retrieve comment thread by BlockNote ID', async () => {
      const result = await commentService.getCommentThreadByBnId('bn-thread-123');

      expect(result.data).toBeDefined();
      expect(result.data?.thread_id).toBe('bn-thread-123');
      expect(mockSupabase.from).toHaveBeenCalledWith('comment_threads');
    });

    it('should update comment thread status', async () => {
      const result = await commentService.updateCommentThreadStatus(
        'thread-uuid-123',
        'resolved'
      );

      expect(result.data).toBeDefined();
      expect(result.data?.status).toBe('resolved');
      expect(mockSupabase.from).toHaveBeenCalledWith('comment_threads');
    });

    it('should delete comment thread', async () => {
      const result = await commentService.deleteCommentThread('thread-uuid-123');

      expect(result.data).toBeDefined();
      expect(mockSupabase.from).toHaveBeenCalledWith('comment_threads');
    });
  });

  describe('Comment CRUD Operations', () => {
    beforeEach(() => {
      // Mock comment responses
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'comments') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: {
                    id: 'comment-uuid-123',
                    thread_id: 'thread-uuid-123',
                    content: { type: 'text', text: 'Test comment' },
                    author_id: testUser.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                })),
              })),
            })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => Promise.resolve({
                  data: [{
                    id: 'comment-uuid-123',
                    content: { type: 'text', text: 'Test comment' },
                    author_id: testUser.id,
                  }],
                  error: null,
                })),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(() => Promise.resolve({
                    data: {
                      id: 'comment-uuid-123',
                      content: { type: 'text', text: 'Updated comment' },
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            delete: jest.fn(() => ({
              eq: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(() => Promise.resolve({
                    data: { id: 'comment-uuid-123' },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        return mockSupabase.from('comment_threads');
      });
    });

    it('should create a comment successfully', async () => {
      const result = await commentService.createComment(
        'thread-uuid-123',
        { type: 'text', text: 'Test comment' }
      );

      expect(result.data).toBeDefined();
      expect(result.data?.content).toEqual({ type: 'text', text: 'Test comment' });
      expect(result.error).toBeNull();
    });

    it('should retrieve comments by thread', async () => {
      const result = await commentService.getCommentsByThread('thread-uuid-123');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data?.[0]?.content).toEqual({ type: 'text', text: 'Test comment' });
    });

    it('should update comment content', async () => {
      const result = await commentService.updateCommentContent(
        'comment-uuid-123',
        { type: 'text', text: 'Updated comment' }
      );

      expect(result.data).toBeDefined();
      expect(result.data?.content).toEqual({ type: 'text', text: 'Updated comment' });
    });

    it('should delete comment', async () => {
      const result = await commentService.deleteComment('comment-uuid-123');

      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('comment-uuid-123');
    });
  });

  describe('YjsThreadStore Integration', () => {
    let threadStore: YjsThreadStore;
    let threadsMap: Y.Map<any>;

    beforeEach(() => {
      threadsMap = testDoc.getMap('threads');
      const auth = new DefaultThreadStoreAuth(testUser.id, 'editor');
      threadStore = new YjsThreadStore(testUser.id, threadsMap, auth);
    });

    it('should create thread in Yjs document', async () => {
      const threadData = {
        id: 'test-thread-123',
        type: 'default',
        selectionData: { from: 0, to: 10 },
      };

      // Simulate thread creation
      threadsMap.set('test-thread-123', new Y.Map([
        ['id', threadData.id],
        ['type', threadData.type],
        ['userId', testUser.id],
        ['createdAt', Date.now()],
        ['comments', new Y.Array()],
        ['users', new Y.Array()],
        ['metadata', new Y.Map([
          ['selectionData', threadData.selectionData],
          ['status', 'open'],
        ])],
      ]));

      expect(threadsMap.has('test-thread-123')).toBe(true);
      const thread = threadsMap.get('test-thread-123');
      expect(thread.get('id')).toBe('test-thread-123');
      expect(thread.get('type')).toBe('default');
    });

    it('should add comment to thread in Yjs document', async () => {
      // First create a thread
      const threadMap = new Y.Map([
        ['id', 'test-thread-123'],
        ['type', 'default'],
        ['userId', testUser.id],
        ['createdAt', Date.now()],
        ['comments', new Y.Array()],
        ['users', new Y.Array()],
        ['metadata', new Y.Map([['status', 'open']])],
      ]);
      threadsMap.set('test-thread-123', threadMap);

      // Add comment
      const commentsArray = threadMap.get('comments') as Y.Array<any>;
      const commentMap = new Y.Map([
        ['id', 'comment-123'],
        ['userId', testUser.id],
        ['body', { type: 'text', text: 'Test comment' }],
        ['createdAt', Date.now()],
        ['reactions', new Y.Array()],
        ['metadata', new Y.Map()],
      ]);
      commentsArray.push([commentMap]);

      expect(commentsArray.length).toBe(1);
      expect(commentsArray.get(0).get('id')).toBe('comment-123');
    });

    it('should update thread status in Yjs document', async () => {
      // Create thread
      const threadMap = new Y.Map([
        ['id', 'test-thread-123'],
        ['metadata', new Y.Map([['status', 'open']])],
      ]);
      threadsMap.set('test-thread-123', threadMap);

      // Update status
      const metadata = threadMap.get('metadata') as Y.Map<any>;
      metadata.set('status', 'resolved');
      metadata.set('resolvedAt', Date.now());
      metadata.set('resolvedByUserId', testUser.id);

      expect(metadata.get('status')).toBe('resolved');
      expect(metadata.get('resolvedByUserId')).toBe(testUser.id);
    });
  });

  describe('Authentication and Permissions', () => {
    it('should handle unauthenticated user', async () => {
      // Mock unauthenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await commentService.createCommentThread(
        'doc-123',
        'bn-thread-123',
        null
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('401');
      expect(result.error?.message).toBe('User not authenticated');
    });

    it('should handle Supabase errors gracefully', async () => {
      // Mock Supabase error
      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: null,
              error: {
                message: 'Database connection failed',
                code: '500',
              },
            })),
          })),
        })),
      });

      const result = await commentService.createCommentThread(
        'doc-123',
        'bn-thread-123',
        null
      );

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Database connection failed');
    });
  });

  describe('Real-time Synchronization', () => {
    it('should handle Yjs document changes', async () => {
      const threadsMap = testDoc.getMap('threads');
      let changeCount = 0;

      // Listen for changes
      threadsMap.observe(() => {
        changeCount++;
      });

      // Simulate remote changes
      testDoc.transact(() => {
        const threadMap = new Y.Map([
          ['id', 'remote-thread-123'],
          ['type', 'default'],
          ['userId', 'remote-user-456'],
          ['createdAt', Date.now()],
        ]);
        threadsMap.set('remote-thread-123', threadMap);
      });

      expect(changeCount).toBe(1);
      expect(threadsMap.has('remote-thread-123')).toBe(true);
    });

    it('should handle concurrent modifications', async () => {
      const threadsMap = testDoc.getMap('threads');
      
      // Create thread
      const threadMap = new Y.Map([
        ['id', 'concurrent-thread-123'],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set('concurrent-thread-123', threadMap);

      const commentsArray = threadMap.get('comments') as Y.Array<any>;

      // Simulate concurrent comment additions
      testDoc.transact(() => {
        const comment1 = new Y.Map([['id', 'comment-1'], ['text', 'First comment']]);
        commentsArray.push([comment1]);
      });

      testDoc.transact(() => {
        const comment2 = new Y.Map([['id', 'comment-2'], ['text', 'Second comment']]);
        commentsArray.push([comment2]);
      });

      expect(commentsArray.length).toBe(2);
      expect(commentsArray.get(0).get('id')).toBe('comment-1');
      expect(commentsArray.get(1).get('id')).toBe('comment-2');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing thread gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Thread not found', code: 'PGRST116' },
            })),
          })),
        })),
      });

      const result = await commentService.getCommentThreadByBnId('nonexistent-thread');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should handle invalid comment content', async () => {
      const result = await commentService.createComment(
        'thread-uuid-123',
        null // Invalid content
      );

      // Should still work as JSONB can store null
      expect(result.data).toBeDefined();
    });

    it('should handle network failures', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => {
          throw new Error('Network error');
        }),
      });

      await expect(commentService.createCommentThread(
        'doc-123',
        'bn-thread-123',
        null
      )).rejects.toThrow('Network error');
    });
  });
}); 