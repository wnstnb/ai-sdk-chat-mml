import { useState, useEffect, useCallback } from 'react';
import { DocumentWithSharingInfo } from '@/types/supabase';

interface UseSharedDocumentsReturn {
  documents: DocumentWithSharingInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseSharedDocumentsOptions {
  type?: 'all' | 'shared' | 'owned';
}

/**
 * Hook to fetch both owned and shared documents with sharing information
 * Uses the new /api/documents endpoint that includes permission levels and access types
 */
export function useSharedDocuments(options: UseSharedDocumentsOptions = {}): UseSharedDocumentsReturn {
  const { type = 'all' } = options;
  const [documents, setDocuments] = useState<DocumentWithSharingInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const queryParams = type !== 'all' ? `?type=${type}` : '';
      const url = `/api/documents${queryParams}`;
      
      console.log(`[useSharedDocuments] Fetching from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch documents (${response.status})`);
      }
      
      const { documents: responseDocuments } = await response.json();
      console.log(`[useSharedDocuments] Received ${responseDocuments?.length || 0} documents`);
      setDocuments(responseDocuments || []);
    } catch (err: any) {
      console.error('[useSharedDocuments] Error:', err);
      setError(err.message);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { 
    documents, 
    isLoading, 
    error, 
    refetch: fetchDocuments 
  };
}

/**
 * Convenience hook that fetches only documents shared with the user (not owned by them)
 */
export function useSharedDocumentsOnly(): UseSharedDocumentsReturn {
  return useSharedDocuments({ type: 'shared' });
} 