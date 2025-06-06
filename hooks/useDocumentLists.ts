import { useState, useEffect, useCallback } from 'react';
import { Document } from '@/types/supabase'; // Ensure this path is correct
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
    const channel = client
      .channel('all-documents-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        (payload) => {
          // console.log('[useAllDocuments] Realtime change received:', payload); // Optional: for debugging
          // Re-fetch documents when a change occurs
          // No need to check payload specifics for now, just refresh the list
          // This handles inserts, updates, and deletes
          toast.info('Document list updated.', { duration: 2000 }); // Notify user
          fetchDocuments();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // console.log('[useAllDocuments] Subscribed to realtime documents changes!'); // Optional: for debugging
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[useAllDocuments] Realtime subscription error:', err);
          toast.error('Realtime update connection issue.');
        }
      });

    // Cleanup subscription on component unmount
    return () => {
      // console.log('[useAllDocuments] Unsubscribing from realtime documents changes.'); // Optional: for debugging
      client.removeChannel(channel);
    };
  }, [fetchDocuments]); // fetchDocuments is stable due to useCallback with empty deps

  return { mappedDocuments, isLoading, error, fetchDocuments };
} 