import * as Y from 'yjs';
import { supabase } from '@/lib/supabase/client'; // Import supabase client directly
import type {
    // Assuming ThreadStoreAuth is the main interface needed from BlockNote's exports
    ThreadStoreAuth,
    User as BlockNoteUser,
    Comment as BlockNoteComment,
    Thread as BlockNoteThread,
} from '@blocknote/core/comments'; // Adjusted import path

// Define BlockNote-like types for clarity if not directly imported or for custom mapping
// These represent the data structure YjsThreadStore would manage in the Y.Map
export interface BNUser {
  id: string;
  name: string;
  // avatarUrl?: string; // Optional, often handled by resolveUsers
}

export interface BNCommentData {
  id: string; // Typically the Supabase Comment UUID
  threadId: string; // BlockNote's string thread ID
  author: string; // User ID (string)
  content: any; // BlockNote content
  createdAt: number; // Timestamp
  // users?: BNUser[]; // For mentions, if handled by YjsThreadStore structure
}

export interface BNThreadData {
  id: string; // BlockNote's string thread ID
  author: string; // User ID (string)
  type: string; // e.g., 'default'
  status: 'open' | 'resolved';
  selectionData?: any | null; // JSONB
  createdAt: number; // Timestamp
  comments: BNCommentData[];
  users: BNUser[]; // Users involved in the thread (author, commenters)
}

// For updating thread metadata, often a partial structure
export type BNPartialThreadDataForUpdate = Partial<Omit<BNThreadData, 'comments' | 'users' | 'id' | 'author' | 'createdAt'>> & {
    // Specific fields that can be updated, e.g., status or selectionData
    status?: 'open' | 'resolved';
    selectionData?: any;
    type?: string;
};


import * as commentService from './commentService';
import type { CommentThread as SupabaseCommentThread, Comment as SupabaseComment } from './commentService';

// Helper to generate a simple unique ID (BlockNote might have its own utils for this)
const generateSimpleUniqueId = (): string => `bn_${Math.random().toString(36).slice(2, 11)}`;

// Helper to map Supabase user ID (UUID string) to BNUser for BlockNote
// In a real app, you'd fetch user details (name, avatar etc.)
const mapSupabaseUserToBNUser = (userId: string | undefined | null): BNUser | undefined => {
  if (!userId) return undefined;
  // This is a placeholder. YjsThreadStore typically needs at least an `id`.
  // Full user details (name, avatar) would be resolved by the `resolveUsers` prop of YjsThreadStore
  // or by ensuring the `users` array in ThreadData is populated correctly.
  return { id: userId, name: `User ${userId.substring(0, 6)}...` }; // Minimal, name can be resolved later
};

export class SupabaseThreadStoreAuth implements ThreadStoreAuth {
  private yDocThreadsMap: Y.Map<Y.Map<any>>;

  constructor(
    private documentId: string, // Supabase document UUID
    private currentUserId: string, // Current authenticated Supabase user's ID (UUID string)
    yDocThreadsMap: Y.Map<Y.Map<any>>
  ) {
    this.yDocThreadsMap = yDocThreadsMap;
  }

  // Permission checks (client-side hints, backend RLS is the source of truth)
  canCreateThread(): boolean {
    return true; // Assume if user can access document with commenting, they can start a thread
  }

  canAddComment(thread: BlockNoteThread): boolean {
    return true; // Assume if user can see a thread, they can comment
  }

  canUpdateComment(comment: BlockNoteComment): boolean {
    return comment.userId === this.currentUserId;
  }

  canDeleteComment(comment: BlockNoteComment): boolean {
    return comment.userId === this.currentUserId;
  }

  canUpdateThreadMetadata(thread: BlockNoteThread): boolean {
    // Simplified: allow thread author. Backend RLS also allows doc owner.
    return true;
  }
  
  // This is often the primary method for status changes
  canSetThreadStatus(thread: BlockNoteThread, status: "open" | "resolved"): boolean {
    // Simplified: allow thread author. Backend RLS also allows doc owner.
    return true;
  }

  canDeleteThread(thread: BlockNoteThread): boolean {
    // Simplified: allow thread author. Backend RLS also allows doc owner.
    return true;
  }

  // Default true for other potential actions, specific UI can refine
  canReactToComment(comment: BlockNoteComment): boolean { return true; }

  // Additional stubs to satisfy a more complete ThreadStoreAuth interface
  canResolveThread(thread: BlockNoteThread): boolean { return this.canSetThreadStatus(thread, "resolved"); }
  canReopenThread(thread: BlockNoteThread): boolean { return this.canSetThreadStatus(thread, "open"); }
  canPinThread?(thread: BlockNoteThread): boolean { return true; } // Optional if in interface
  canEditThreadData?(thread: BlockNoteThread, data: Partial<BlockNoteThread>): boolean { return true; } // More generic update

  private async getSupabaseThreadByBnThreadId(bnThreadId: string): Promise<SupabaseCommentThread | null> {
    const { data, error } = await commentService.getCommentThreadByBnId(bnThreadId);
    if (error || !data) {
      if (error) console.error(`[SupabaseAuth] Error fetching SB thread for BN ID ${bnThreadId}:`, error);
      return null;
    }
    return data;
  }

  async addComment(
    bnThreadId: string,
    content: any // BlockNote comment content (JSON-like)
  ): Promise<BlockNoteComment | { error: string } | undefined> {
    const yThread = this.yDocThreadsMap.get(bnThreadId);
    // A simple placeholder for BlockNoteThread from Yjs data for the permission check:
    // In a real scenario, YjsThreadStore would ensure `thread` object is valid before calling canAddComment.
    // We create a minimal mock that would satisfy the canAddComment signature for now.
    const mockThreadForPermCheck: BlockNoteThread = { id: bnThreadId, type: 'default', userId: yThread?.get('userId') || 'unknown', createdAt: new Date(), updatedAt: new Date(), comments: [], users: [], metadata: {} }; 
    if (!this.canAddComment(mockThreadForPermCheck)) {
        return { error: "Permission denied by client to add comment." };
    }

    const sbThread = await this.getSupabaseThreadByBnThreadId(bnThreadId);
    if (!sbThread) {
      return { error: `SupabaseThreadStoreAuth: Parent thread with BlockNote ID '${bnThreadId}' not found in Supabase.` };
    }

    const { data: newSbComment, error: sbError } = await commentService.createComment(sbThread.id, content);
    if (sbError || !newSbComment) {
      console.error('[SupabaseAuth] Error creating comment in Supabase:', sbError);
      return { error: sbError?.message || 'Failed to create comment in Supabase.' };
    }

    return {
      type: "comment",
      id: newSbComment.id,
      userId: newSbComment.author_id,
      createdAt: new Date(newSbComment.created_at),
      updatedAt: new Date(newSbComment.updated_at),
      body: newSbComment.content,
      reactions: [],
      metadata: {},
      threadId: bnThreadId,
    };
  }

  async addThread(
    // BlockNote's YjsThreadStore provides most of this, including a generated `id` if not passed
    bnThreadPartialData: { type: string; selectionData?: any | null; id?: string; }
  ): Promise<BlockNoteThread | { error: string } | undefined> {
    if (!this.canCreateThread()) return { error: "Permission denied by client to create thread."};
    const bnThreadId = bnThreadPartialData.id || generateSimpleUniqueId();

    const { data: newSbThread, error: sbError } = await commentService.createCommentThread(
      this.documentId,
      bnThreadId,
      bnThreadPartialData.selectionData // selectionData from BlockNote
    );

    if (sbError || !newSbThread) {
      console.error('[SupabaseAuth] Error creating thread in Supabase:', sbError);
      return { error: sbError?.message || 'Failed to create thread in Supabase.' };
    }
    
    const authorUser = mapSupabaseUserToBNUser(newSbThread.created_by);
    if (!authorUser) {
        // Should not happen if created_by is set
        return { error: "Failed to map thread author." };
    }

    return {
      id: newSbThread.thread_id,
      type: bnThreadPartialData.type,
      userId: newSbThread.created_by,
      createdAt: new Date(newSbThread.created_at),
      updatedAt: new Date(newSbThread.updated_at),
      resolvedAt: newSbThread.resolved_at ? new Date(newSbThread.resolved_at) : undefined,
      resolvedByUserId: newSbThread.resolved_by || undefined,
      comments: [],
      users: [authorUser],
      metadata: {
        status: newSbThread.status,
        selectionData: newSbThread.selection_data,
      },
    };
  }

  async editComment(
    sbCommentId: string, // Supabase comment UUID (used as BlockNote comment ID)
    content: any
  ): Promise<BlockNoteComment | { error: string } | undefined> {
    // YjsThreadStore should pass the full comment object for permission check. For now, optimistic.
    const { data: updatedSbComment, error: sbError } = await commentService.updateCommentContent(sbCommentId, content);
    if (sbError || !updatedSbComment) {
      console.error('[SupabaseAuth] Error updating comment in Supabase:', sbError);
      return { error: sbError?.message || 'Failed to update comment in Supabase.' };
    }

    const bnThreadId = this.findBnThreadIdForSbCommentId(sbCommentId);
    
    return {
        type: "comment",
        id: updatedSbComment.id,
        userId: updatedSbComment.author_id,
        createdAt: new Date(updatedSbComment.created_at),
        updatedAt: new Date(updatedSbComment.updated_at),
        body: updatedSbComment.content,
        reactions: [],
        metadata: {},
        threadId: bnThreadId || "unknown", // Fallback if not found in Yjs
    };
  }

  private findBnThreadIdForSbCommentId(sbCommentId: string): string | undefined {
    for (const [bnThreadId, yThreadDataMap] of this.yDocThreadsMap.entries()) {
      const yCommentsArray = yThreadDataMap.get('comments') as Y.Array<Y.Map<any>> | undefined;
      if (yCommentsArray) {
        for (const yCommentMap of yCommentsArray.toArray()) {
          if (yCommentMap.get('id') === sbCommentId) {
            return bnThreadId;
          }
        }
      }
    }
    return undefined;
  }

  async deleteComment(sbCommentId: string): Promise<{ success: true } | { error: string } | undefined> {
    // YjsThreadStore should pass the full comment object for permission check. Optimistic for now.
    const { error } = await commentService.deleteComment(sbCommentId);
    if (error) {
      console.error('[SupabaseAuth] Error deleting comment in Supabase:', error);
      return { error: error.message || 'Failed to delete comment from Supabase.' };
    }
    return { success: true };
  }

  async updateThreadMetadata(
    bnThreadId: string,
    threadMetadataUpdates: Partial<BlockNoteThread> & { metadata?: any } 
  ): Promise<BlockNoteThread | { error: string } | undefined> {
    // YjsThreadStore should pass the full thread object for permission check. Optimistic for now.
    const sbThread = await this.getSupabaseThreadByBnThreadId(bnThreadId);
    if (!sbThread) {
      return { error: `SupabaseThreadStoreAuth: Thread with BlockNote ID '${bnThreadId}' not found for metadata update.` };
    }

    let updatedSbThread: SupabaseCommentThread | null = null;
    let sbError: any = null;

    if (threadMetadataUpdates.metadata?.status !== undefined) {
      const res = await commentService.updateCommentThreadStatus(sbThread.id, threadMetadataUpdates.metadata.status);
      updatedSbThread = res.data;
      sbError = res.error;
    } else if (threadMetadataUpdates.metadata?.selectionData !== undefined) {
      const res = await commentService.updateCommentThreadSelection(sbThread.id, threadMetadataUpdates.metadata.selectionData);
      updatedSbThread = res.data;
      sbError = res.error;
    } else { 
      const res = await commentService.getCommentThreadByBnId(bnThreadId);
      updatedSbThread = res.data;
      sbError = res.error;
      if (!updatedSbThread && !sbError) {
         return { error: `Thread ${bnThreadId} not found and no updatable metadata provided.`};
      }
    }

    if (sbError || !updatedSbThread) {
      console.error('[SupabaseAuth] Error updating thread metadata in Supabase:', sbError);
      return { error: sbError?.message || 'Failed to update thread metadata in Supabase.' };
    }

    const { data: sbCommentsData } = await commentService.getCommentsByThread(updatedSbThread.id);
    const bnComments: BlockNoteComment[] = (sbCommentsData || []).map(comment => ({
        type: "comment",
        id: comment.id,
        userId: comment.author_id,
        createdAt: new Date(comment.created_at),
        updatedAt: new Date(comment.updated_at),
        body: comment.content,
        reactions: [],
        metadata: {},
        threadId: updatedSbThread!.thread_id,
    }));

    const userIdsInThread = new Set<string>();
    userIdsInThread.add(updatedSbThread.created_by);
    if (updatedSbThread.resolved_by) userIdsInThread.add(updatedSbThread.resolved_by);
    bnComments.forEach(c => userIdsInThread.add(c.userId));

    const bnUsersInThread = Array.from(userIdsInThread)
                                .map(uid => mapSupabaseUserToBNUser(uid))
                                .filter((u): u is BNUser => u !== undefined);
    
    return {
      id: updatedSbThread.thread_id,
      type: (this.yDocThreadsMap.get(bnThreadId)?.get('type') as string | undefined) || 'default',
      userId: updatedSbThread.created_by,
      createdAt: new Date(updatedSbThread.created_at),
      updatedAt: new Date(updatedSbThread.updated_at),
      resolvedAt: updatedSbThread.resolved_at ? new Date(updatedSbThread.resolved_at) : undefined,
      resolvedByUserId: updatedSbThread.resolved_by || undefined,
      comments: bnComments,
      users: bnUsersInThread,
      metadata: { 
          status: updatedSbThread.status,
          selectionData: updatedSbThread.selection_data,
          ...threadMetadataUpdates.metadata 
      },
    };
  }

  async deleteThread(bnThreadId: string): Promise<{ success: true } | { error: string } | undefined> {
    // YjsThreadStore should pass the full thread object for permission check. Optimistic for now.
    const sbThread = await this.getSupabaseThreadByBnThreadId(bnThreadId);
    if (!sbThread) {
      return { error: `SupabaseThreadStoreAuth: Thread with BlockNote ID '${bnThreadId}' not found for deletion.` };
    }

    const { error } = await commentService.deleteCommentThread(sbThread.id);
    if (error) {
      console.error('[SupabaseAuth] Error deleting thread in Supabase:', error);
      return { error: error.message || 'Failed to delete thread from Supabase.' };
    }

    return { success: true };
  }

  // Additional stubs to satisfy a more complete ThreadStoreAuth interface
  async canCreateThread(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canAddComment(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canUpdateComment(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canDeleteComment(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canUpdateThreadMetadata(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canSetThreadStatus(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canDeleteThread(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canUnresolveThread(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canAddReaction(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }

  async canDeleteReaction(): Promise<boolean> {
    return true; // Optimistic - could check user permissions here
  }
} 