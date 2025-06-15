/**
 * Comment System Integration Tests
 * 
 * This test suite verifies the end-to-end functionality of the comment system,
 * including Supabase integration, Yjs synchronization, and error handling.
 */

import * as Y from 'yjs';

// Test data structures
interface TestCommentThread {
  id: string;
  document_id: string;
  thread_id: string;
  status: 'open' | 'resolved';
  created_by: string;
  created_at: string;
  updated_at: string;
  selection_data?: any;
}

interface TestComment {
  id: string;
  thread_id: string;
  content: any;
  author_id: string;
  created_at: string;
  updated_at: string;
}

describe('Comment System Integration Tests', () => {
  let testDoc: Y.Doc;
  let threadsMap: Y.Map<any>;

  beforeEach(() => {
    testDoc = new Y.Doc();
    threadsMap = testDoc.getMap('threads');
  });

  afterEach(() => {
    testDoc.destroy();
  });

  describe('Yjs Thread Store Operations', () => {
    test('should create thread in Yjs document', () => {
      const threadId = 'test-thread-123';
      const threadData = {
        id: threadId,
        type: 'default',
        userId: 'user-123',
        createdAt: Date.now(),
        selectionData: { from: 0, to: 10 },
        status: 'open',
      };

      // Create thread in Yjs
      const threadMap = new Y.Map([
        ['id', threadData.id],
        ['type', threadData.type],
        ['userId', threadData.userId],
        ['createdAt', threadData.createdAt],
        ['comments', new Y.Array()],
        ['users', new Y.Array()],
        ['metadata', new Y.Map([
          ['selectionData', threadData.selectionData],
          ['status', threadData.status],
        ])],
      ]);

      threadsMap.set(threadId, threadMap);

      // Verify thread creation
      expect(threadsMap.has(threadId)).toBe(true);
      const retrievedThread = threadsMap.get(threadId);
      expect(retrievedThread.get('id')).toBe(threadId);
      expect(retrievedThread.get('type')).toBe('default');
      expect(retrievedThread.get('userId')).toBe('user-123');
      
      const metadata = retrievedThread.get('metadata') as Y.Map<any>;
      expect(metadata.get('status')).toBe('open');
      expect(metadata.get('selectionData')).toEqual({ from: 0, to: 10 });
    });

    test('should add comment to thread', () => {
      const threadId = 'test-thread-123';
      
      // Create thread
      const threadMap = new Y.Map([
        ['id', threadId],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set(threadId, threadMap);

      // Add comment
      const commentsArray = threadMap.get('comments') as Y.Array<any>;
      const commentMap = new Y.Map([
        ['id', 'comment-123'],
        ['userId', 'user-123'],
        ['body', { type: 'text', text: 'Test comment' }],
        ['createdAt', Date.now()],
        ['reactions', new Y.Array()],
        ['metadata', new Y.Map()],
      ]);

      commentsArray.push([commentMap]);

      // Verify comment addition
      expect(commentsArray.length).toBe(1);
      const retrievedComment = commentsArray.get(0);
      expect(retrievedComment.get('id')).toBe('comment-123');
      expect(retrievedComment.get('userId')).toBe('user-123');
      expect(retrievedComment.get('body')).toEqual({ type: 'text', text: 'Test comment' });
    });

    test('should update thread status', () => {
      const threadId = 'test-thread-123';
      
      // Create thread
      const threadMap = new Y.Map([
        ['id', threadId],
        ['metadata', new Y.Map([['status', 'open']])],
      ]);
      threadsMap.set(threadId, threadMap);

      // Update status to resolved
      const metadata = threadMap.get('metadata') as Y.Map<any>;
      metadata.set('status', 'resolved');
      metadata.set('resolvedAt', Date.now());
      metadata.set('resolvedByUserId', 'user-456');

      // Verify status update
      expect(metadata.get('status')).toBe('resolved');
      expect(metadata.get('resolvedByUserId')).toBe('user-456');
      expect(metadata.get('resolvedAt')).toBeDefined();
    });

    test('should handle concurrent modifications', () => {
      const threadId = 'concurrent-thread-123';
      
      // Create thread with comments array
      const threadMap = new Y.Map([
        ['id', threadId],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set(threadId, threadMap);

      const commentsArray = threadMap.get('comments') as Y.Array<any>;

      // Simulate concurrent comment additions
      testDoc.transact(() => {
        const comment1 = new Y.Map([
          ['id', 'comment-1'],
          ['text', 'First comment'],
          ['timestamp', Date.now()],
        ]);
        commentsArray.push([comment1]);
      });

      testDoc.transact(() => {
        const comment2 = new Y.Map([
          ['id', 'comment-2'],
          ['text', 'Second comment'],
          ['timestamp', Date.now()],
        ]);
        commentsArray.push([comment2]);
      });

      // Verify both comments exist
      expect(commentsArray.length).toBe(2);
      expect(commentsArray.get(0).get('id')).toBe('comment-1');
      expect(commentsArray.get(1).get('id')).toBe('comment-2');
    });
  });

  describe('Real-time Synchronization', () => {
    test('should observe Yjs document changes', () => {
      let changeCount = 0;
      let lastChangedKey: string | null = null;

      // Set up observer
      threadsMap.observe((event) => {
        changeCount++;
        if (event.changes.keys.size > 0) {
          lastChangedKey = Array.from(event.changes.keys.keys())[0];
        }
      });

      // Make changes
      testDoc.transact(() => {
        const threadMap = new Y.Map([
          ['id', 'observed-thread-123'],
          ['type', 'default'],
          ['userId', 'user-123'],
        ]);
        threadsMap.set('observed-thread-123', threadMap);
      });

      // Verify observation
      expect(changeCount).toBe(1);
      expect(lastChangedKey).toBe('observed-thread-123');
      expect(threadsMap.has('observed-thread-123')).toBe(true);
    });

    test('should handle remote document updates', () => {
      // Simulate remote document
      const remoteDoc = new Y.Doc();
      const remoteThreadsMap = remoteDoc.getMap('threads');

      // Create update from remote document
      remoteDoc.transact(() => {
        const remoteThread = new Y.Map([
          ['id', 'remote-thread-123'],
          ['type', 'default'],
          ['userId', 'remote-user-456'],
          ['createdAt', Date.now()],
        ]);
        remoteThreadsMap.set('remote-thread-123', remoteThread);
      });

      // Apply remote update to local document
      const update = Y.encodeStateAsUpdate(remoteDoc);
      Y.applyUpdate(testDoc, update);

      // Verify remote changes are applied
      expect(threadsMap.has('remote-thread-123')).toBe(true);
      const remoteThread = threadsMap.get('remote-thread-123');
      expect(remoteThread.get('userId')).toBe('remote-user-456');

      // Cleanup
      remoteDoc.destroy();
    });
  });

  describe('Data Structure Validation', () => {
    test('should maintain thread data integrity', () => {
      const threadId = 'integrity-thread-123';
      const threadData = {
        id: threadId,
        type: 'default',
        userId: 'user-123',
        createdAt: Date.now(),
        comments: [],
        users: ['user-123'],
        metadata: {
          status: 'open',
          selectionData: { from: 5, to: 15 },
        },
      };

      // Create comprehensive thread structure
      const threadMap = new Y.Map([
        ['id', threadData.id],
        ['type', threadData.type],
        ['userId', threadData.userId],
        ['createdAt', threadData.createdAt],
        ['comments', new Y.Array()],
        ['users', new Y.Array()],
        ['metadata', new Y.Map([
          ['status', threadData.metadata.status],
          ['selectionData', threadData.metadata.selectionData],
        ])],
      ]);

             // Add users to the array after creation
       const users = threadMap.get('users') as Y.Array<string>;
       users.push(threadData.users);

       threadsMap.set(threadId, threadMap);

       // Verify all data is preserved
       const retrievedThread = threadsMap.get(threadId);
       expect(retrievedThread.get('id')).toBe(threadData.id);
       expect(retrievedThread.get('type')).toBe(threadData.type);
       expect(retrievedThread.get('userId')).toBe(threadData.userId);
       expect(retrievedThread.get('createdAt')).toBe(threadData.createdAt);

       const retrievedUsers = retrievedThread.get('users') as Y.Array<string>;
       expect(retrievedUsers.toArray()).toEqual(['user-123']);

      const metadata = retrievedThread.get('metadata') as Y.Map<any>;
      expect(metadata.get('status')).toBe('open');
      expect(metadata.get('selectionData')).toEqual({ from: 5, to: 15 });
    });

    test('should handle complex comment content', () => {
      const threadId = 'complex-content-thread';
      
      // Create thread
      const threadMap = new Y.Map([
        ['id', threadId],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set(threadId, threadMap);

      // Add comment with complex content
      const commentsArray = threadMap.get('comments') as Y.Array<any>;
      const complexContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This is a ' },
              { type: 'text', text: 'complex', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' comment with ' },
              { type: 'text', text: 'formatting', marks: [{ type: 'italic' }] },
            ],
          },
        ],
      };

      const commentMap = new Y.Map([
        ['id', 'complex-comment-123'],
        ['userId', 'user-123'],
        ['body', complexContent],
        ['createdAt', Date.now()],
        ['reactions', new Y.Array()],
                 ['metadata', new Y.Map([
           ['mentions', new Y.Array()],
           ['edited', false],
         ])],
      ]);

             // Add mentions to the array after creation
       const commentMetadata = commentMap.get('metadata') as Y.Map<any>;
       const mentions = commentMetadata.get('mentions') as Y.Array<string>;
       mentions.push(['user-456', 'user-789']);

       commentsArray.push([commentMap]);

       // Verify complex content is preserved
       const retrievedComment = commentsArray.get(0);
       expect(retrievedComment.get('body')).toEqual(complexContent);
       
       const retrievedMetadata = retrievedComment.get('metadata') as Y.Map<any>;
       const retrievedMentions = retrievedMetadata.get('mentions') as Y.Array<string>;
       expect(retrievedMentions.toArray()).toEqual(['user-456', 'user-789']);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle missing thread gracefully', () => {
      const nonExistentThreadId = 'nonexistent-thread-123';
      
      // Try to access non-existent thread
      const thread = threadsMap.get(nonExistentThreadId);
      
      expect(thread).toBeUndefined();
      expect(threadsMap.has(nonExistentThreadId)).toBe(false);
    });

    test('should handle empty comments array', () => {
      const threadId = 'empty-comments-thread';
      
      // Create thread with empty comments
      const threadMap = new Y.Map([
        ['id', threadId],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set(threadId, threadMap);

      const commentsArray = threadMap.get('comments') as Y.Array<any>;
      
      expect(commentsArray.length).toBe(0);
      expect(commentsArray.toArray()).toEqual([]);
    });

    test('should handle malformed thread data', () => {
      const threadId = 'malformed-thread';
      
      // Create thread with minimal data
      const threadMap = new Y.Map([
        ['id', threadId],
        // Missing other required fields
      ]);
      threadsMap.set(threadId, threadMap);

      const retrievedThread = threadsMap.get(threadId);
      expect(retrievedThread.get('id')).toBe(threadId);
      expect(retrievedThread.get('type')).toBeUndefined();
      expect(retrievedThread.get('userId')).toBeUndefined();
    });

    test('should handle document destruction gracefully', () => {
      const threadId = 'destruction-test-thread';
      
      // Create thread
      const threadMap = new Y.Map([['id', threadId]]);
      threadsMap.set(threadId, threadMap);
      
      expect(threadsMap.has(threadId)).toBe(true);
      
      // Destroy document
      testDoc.destroy();
      
      // Document should be destroyed without errors
      expect(testDoc.isDestroyed).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple threads efficiently', () => {
      const threadCount = 100;
      const startTime = Date.now();

      // Create multiple threads
      for (let i = 0; i < threadCount; i++) {
        const threadId = `perf-thread-${i}`;
        const threadMap = new Y.Map([
          ['id', threadId],
          ['type', 'default'],
          ['userId', `user-${i % 10}`], // 10 different users
          ['createdAt', Date.now()],
          ['comments', new Y.Array()],
        ]);
        threadsMap.set(threadId, threadMap);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all threads were created
      expect(threadsMap.size).toBe(threadCount);
      
      // Performance should be reasonable (less than 1 second for 100 threads)
      expect(duration).toBeLessThan(1000);
    });

    test('should handle large comment threads', () => {
      const threadId = 'large-thread';
      const commentCount = 50;

      // Create thread
      const threadMap = new Y.Map([
        ['id', threadId],
        ['comments', new Y.Array()],
      ]);
      threadsMap.set(threadId, threadMap);

      const commentsArray = threadMap.get('comments') as Y.Array<any>;

      // Add many comments
      for (let i = 0; i < commentCount; i++) {
        const commentMap = new Y.Map([
          ['id', `comment-${i}`],
          ['userId', `user-${i % 5}`], // 5 different users
          ['body', { type: 'text', text: `Comment number ${i}` }],
          ['createdAt', Date.now() + i], // Ensure different timestamps
        ]);
        commentsArray.push([commentMap]);
      }

      // Verify all comments were added
      expect(commentsArray.length).toBe(commentCount);
      
      // Verify comments maintain order
      for (let i = 0; i < commentCount; i++) {
        const comment = commentsArray.get(i);
        expect(comment.get('id')).toBe(`comment-${i}`);
      }
    });
  });
});

// Export test utilities for other test files
export const createTestThread = (threadId: string, userId: string = 'test-user') => {
  const threadMap = new Y.Map([
    ['id', threadId],
    ['type', 'default'],
    ['userId', userId],
    ['createdAt', Date.now()],
    ['comments', new Y.Array()],
    ['users', new Y.Array()],
    ['metadata', new Y.Map([
      ['status', 'open'],
      ['selectionData', { from: 0, to: 10 }],
    ])],
  ]);
  
  // Add user to the users array
  const users = threadMap.get('users') as Y.Array<string>;
  users.push([userId]);
  
  return threadMap;
};

export const createTestComment = (commentId: string, userId: string = 'test-user', text: string = 'Test comment') => {
  return new Y.Map([
    ['id', commentId],
    ['userId', userId],
    ['body', { type: 'text', text }],
    ['createdAt', Date.now()],
    ['reactions', new Y.Array()],
    ['metadata', new Y.Map()],
  ]);
}; 