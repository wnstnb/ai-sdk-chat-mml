import { useState, useEffect, useCallback } from 'react';
import { Document } from '@/types/supabase'; // Ensure this path is correct
import { toast } from 'sonner';

interface UseDocumentListReturn {
  documents: Document[];
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