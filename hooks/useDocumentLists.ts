import { useState, useEffect, useCallback } from 'react';
import { Document, DocumentWithSharingInfo } from '@/types/supabase'; // Ensure this path is correct
import { toast } from 'sonner';
import { mapDocumentsToMappedCardData, type MappedDocumentCardData } from '@/lib/mappers/documentMappers'; // Added import
import { createClient } from '@/lib/supabase/client'; // Added Supabase client import

interface UseDocumentListReturn {
  documents: Document[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>; // Expose fetch function for manual refresh
}

// New interface for the hook that returns mapped data
interface UseMappedDocumentListReturn {
  mappedDocuments: MappedDocumentCardData[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>; // Expose fetch function for manual refresh
}

// New interface for unified documents with extended data
interface UseUnifiedDocumentsReturn {
  mappedDocuments: ExtendedMappedDocumentCardData[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
}

// Extended mapped data that includes sharing information
export interface ExtendedMappedDocumentCardData extends MappedDocumentCardData {
  access_type?: 'owned' | 'shared';
  permission_level?: 'owner' | 'editor' | 'commenter' | 'viewer';
  owner_email?: string;
}

const FILE_MANAGER_API_ENDPOINT = '/api/file-manager';

// Hook to fetch recent documents
export function useRecentDocuments(limit: number = 10): UseDocumentListReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${FILE_MANAGER_API_ENDPOINT}?recent=true&limit=${limit}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch recent documents (${response.status})`);
      }
      const { data } = await response.json();
      setDocuments(data?.documents || []);
    } catch (err: any) {
      console.error('[useRecentDocuments] Error:', err);
      setError(err.message);
      setDocuments([]);
      // Consider a toast notification for the user if appropriate
      // toast.error(`Error loading recent documents: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { documents, isLoading, error, fetchDocuments };
}

// Hook to fetch starred documents
export function useStarredDocuments(): UseDocumentListReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${FILE_MANAGER_API_ENDPOINT}?starred=true`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch starred documents (${response.status})`);
      }
      const { data } = await response.json();
      setDocuments(data?.documents || []);
    } catch (err: any) {
      console.error('[useStarredDocuments] Error:', err);
      setError(err.message);
      setDocuments([]);
      // toast.error(`Error loading starred documents: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { documents, isLoading, error, fetchDocuments };
}

// Hook to fetch all documents (newly added)
export function useAllDocuments(): UseMappedDocumentListReturn { // Updated return type
  const [mappedDocuments, setMappedDocuments] = useState<MappedDocumentCardData[]>([]); // Updated state variable
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    // console.log('[useAllDocuments] Fetching documents...'); // Optional: for debugging
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(FILE_MANAGER_API_ENDPOINT);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch all documents (${response.status})`);
      }
      const { data } = await response.json();
      const rawDocuments: Document[] = data?.documents || [];
      setMappedDocuments(mapDocumentsToMappedCardData(rawDocuments));
    } catch (err: any) {
      console.error('[useAllDocuments] Error fetching documents:', err);
      setError(err.message);
      setMappedDocuments([]);
      // Consider a toast notification for the user if appropriate
      // toast.error(`Error loading documents: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array means fetchDocuments itself doesn't change

  // Initial fetch
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Realtime subscription for changes
  useEffect(() => {
    const client = createClient();
    let isSubscribed = false;
    let channel: any = null;
    
    try {
      channel = client
        .channel('all-documents-realtime-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'documents' },
          (payload) => {
            // console.log('[useAllDocuments] Realtime change received:', payload); // Optional: for debugging
            // Re-fetch documents when a change occurs
            // No need to check payload specifics for now, just refresh the list
            // This handles inserts, updates, and deletes
            // Silently refresh document list - no toast needed for automatic updates
            fetchDocuments();
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            // console.log('[useAllDocuments] Subscribed to realtime documents changes!'); // Optional: for debugging
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[useAllDocuments] Realtime subscription error:', err);
            // Connection status is now handled by ConnectionStatusIndicator
          }
        });
    } catch (error) {
      console.error('[useAllDocuments] Error setting up subscription:', error);
    }

    // Cleanup subscription on component unmount
    return () => {
      // console.log('[useAllDocuments] Unsubscribing from realtime documents changes.'); // Optional: for debugging
      if (channel && isSubscribed) {
        try {
          client.removeChannel(channel);
        } catch (error) {
          console.error('[useAllDocuments] Error removing channel:', error);
        }
      }
    };
  }, [fetchDocuments]); // fetchDocuments is stable due to useCallback with empty deps

  return { mappedDocuments, isLoading, error, fetchDocuments };
}

// Helper function to map DocumentWithSharingInfo to ExtendedMappedDocumentCardData
function mapSharedDocumentToExtendedCardData(document: DocumentWithSharingInfo): ExtendedMappedDocumentCardData {
  const MAX_SNIPPET_LENGTH = 150;
  const DEFAULT_SNIPPET = "No preview available.";
  
  let displaySnippet = document.searchable_content || DEFAULT_SNIPPET;
  if (document.searchable_content && document.searchable_content.length > MAX_SNIPPET_LENGTH) {
    displaySnippet = document.searchable_content.substring(0, MAX_SNIPPET_LENGTH) + "...";
  }

  return {
    id: document.id,
    title: document.name,
    lastUpdated: document.updated_at,
    snippet: displaySnippet,
    is_starred: document.is_starred ?? false,
    folder_id: document.folder_id,
    is_shared_with_others: Boolean(document.sharing_info && document.sharing_info.permission_count > 1),
    access_type: document.access_type,
    permission_level: document.permission_level as 'owner' | 'editor' | 'commenter' | 'viewer',
    owner_email: document.owner_email,
  };
}

// NEW: Hook to fetch both owned and shared documents in a unified view
export function useUnifiedDocuments(): UseUnifiedDocumentsReturn {
  const [mappedDocuments, setMappedDocuments] = useState<ExtendedMappedDocumentCardData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use the documents API which returns both owned and shared documents with proper metadata
      const response = await fetch('/api/documents'); // No type parameter = get all documents

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch documents (${response.status})`);
      }

      const { documents: allDocuments } = await response.json();
      const documentsWithSharing: DocumentWithSharingInfo[] = allDocuments || [];

      // Convert documents to extended mapped data
      const mappedDocs = documentsWithSharing.map(doc => 
        mapSharedDocumentToExtendedCardData(doc)
      );

      // Sort by updated_at (most recent first)
      const sortedDocs = mappedDocs
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

      setMappedDocuments(sortedDocs);
    } catch (err: any) {
      console.error('[useUnifiedDocuments] Error fetching documents:', err);
      setError(err.message);
      setMappedDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Realtime subscription for changes
  useEffect(() => {
    const client = createClient();
    let isSubscribed = false;
    let channel: any = null;
    
    try {
      channel = client
        .channel('unified-documents-realtime-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'documents' },
          (payload) => {
            // Silently refresh document list - no toast needed for automatic updates
            fetchDocuments();
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[useUnifiedDocuments] Realtime subscription error:', err);
            // Connection status is now handled by ConnectionStatusIndicator
          }
        });
    } catch (error) {
      console.error('[useUnifiedDocuments] Error setting up subscription:', error);
    }

    return () => {
      if (channel && isSubscribed) {
        try {
          client.removeChannel(channel);
        } catch (error) {
          console.error('[useUnifiedDocuments] Error removing channel:', error);
        }
      }
    };
  }, [fetchDocuments]);

  return { mappedDocuments, isLoading, error, fetchDocuments };
} 