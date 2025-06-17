'use client';

import React, { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Import FileManager as per documentation
import { FileManager } from '@cubone/react-file-manager'; 
// Revert CSS path to the file confirmed to exist in node_modules
import '@cubone/react-file-manager/dist/style.css'; 
import { Document, Folder } from '@/types/supabase'; // Import types
// Import the new file manager component
import NewFileManager from '@/components/file-manager/NewFileManager';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // ADDED: Import preference store
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"; // Add Card imports
import Link from 'next/link'; // Import Link for navigation
import { Button } from "@/components/ui/button"; // ADDED: Import Button component
// ADDED: Import Lucide icons
import { FilePlus, AudioWaveform, Shovel, BookOpenText, Users, Home, ToggleLeft, ToggleRight } from 'lucide-react';
// ADDED: Import useModalStore
import { useModalStore } from '@/stores/useModalStore';

// --- NEW: Import Omnibar ---
import { Omnibar } from '@/components/search/Omnibar';
// --- NEW: Import X icon for pills ---
import { X } from 'lucide-react'; 
// --- NEW: Import DocumentCardGrid component ---
import DocumentCardGrid from '@/components/file-manager/DocumentCardGrid';
import SharedDocumentCard from '@/components/file-manager/SharedDocumentCard';
import { useSharedDocuments, useSharedDocumentsOnly } from '@/hooks/useSharedDocuments';
import { DocumentWithSharingInfo } from '@/types/supabase';

// --- NEW: Import TaggedDocument type ---
import type { TaggedDocument } from '@/lib/types';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // <<< ADDED: Import type

// Define the structure expected by Cubone File Manager (matching docs)
type CuboneFileType = {
    id?: string;
    name: string;
    isDirectory: boolean;
    path: string;
    updatedAt?: string; // Optional
    size?: number; // Optional
};

// Helper to map our DB structure to Cubone's expected structure
const mapToCuboneFiles = (documents: Document[], folders: Folder[]): CuboneFileType[] => {
    // Using names for paths to allow rendering, but adding UUID to 'id' field
    const mappedFolders: CuboneFileType[] = folders
        .filter(f => f && typeof f.name === 'string' && f.name.trim() !== '') // Ensure folder name is valid
        .map(f => ({
            id: f.id, // <-- Populate ID
            name: f.name,
            isDirectory: true,
            path: `/${f.name}`, // Use name for path
            updatedAt: f.updated_at,
        }));
     const mappedDocuments: CuboneFileType[] = documents
        .filter(d => d && typeof d.name === 'string' && d.name.trim() !== '') // Ensure document name is valid
        .map(d => ({
            id: d.id, // <-- Populate ID
            name: d.name,
            isDirectory: false,
            path: `/${d.name}`, // Use name for path
            updatedAt: d.updated_at,
        }));

    return [...mappedFolders, ...mappedDocuments];
};

// Hardcoded test data to isolate rendering issue
// const testFiles: CuboneFileType[] = [
//     { name: "Test Document 1.txt", isDirectory: false, path: "/test-doc-uuid-1", updatedAt: new Date().toISOString() },
//     { name: "Test Folder A", isDirectory: true, path: "/test-folder-uuid-a", updatedAt: new Date().toISOString() },
//     { name: "Another Doc.md", isDirectory: false, path: "/test-doc-uuid-2", updatedAt: new Date().toISOString() }
// ];

// Define a default model fallback (used if store isn't ready)
const defaultModelFallback = 'gemini-1.5-flash';

export default function LaunchPage() {
  const router = useRouter();
  // ADDED: Get openNewDocumentModal from the store
  const { openNewDocumentModal } = useModalStore();
  
  // Hook for shared documents only (no owned documents)
  const { documents: sharedDocuments, isLoading: isLoadingShared, error: sharedError, refetch } = useSharedDocumentsOnly();

  // --- Preference Store --- ADDED
  const {
      default_model: preferredModel,
      isInitialized: isPreferencesInitialized,
  } = usePreferenceStore();

  // --- State for File Manager & Page ---
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true); // For initial data fetch
  const [error, setError] = useState<string | null>(null);
  const [showSharedDocuments, setShowSharedDocuments] = useState(false);

  // ADDED: Effect to update local model state if preference loads *after* initial render
  useEffect(() => {
      if (isPreferencesInitialized && preferredModel) {
           console.log(`[LaunchPage] Preference store initialized.`);
      }
      // Only run when the preference becomes available or changes.
  }, [isPreferencesInitialized, preferredModel]);

  // Fetch initial file/folder data (for file manager)
  const fetchData = useCallback(async () => {
    console.log("[LaunchPage] Attempting to fetch data..."); // Log start
    setIsLoading(true);
    setError(null);
    try {
      console.log("[LaunchPage] Calling fetch('/api/file-manager')..."); // Log before fetch
      const response = await fetch('/api/file-manager');
      console.log("[LaunchPage] Fetch response status:", response.status); // Log status

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}`}};
        try {
          errorData = await response.json(); // Try to parse error JSON
        } catch (parseError) {
          console.error("[LaunchPage] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to fetch data (${response.status})`);
      }
      const { data }: { data: { documents: Document[], folders: Folder[] } } = await response.json();
      console.log("[LaunchPage] Fetched data:", data); // Log received data

      // Map fetched data to CuboneFile structure using the helper
      const mappedData = mapToCuboneFiles(data.documents, data.folders);
      console.log("[LaunchPage] Mapped data for FileManager:", mappedData); // Log mapped data
      setCuboneFiles(mappedData);

    } catch (err: any) {
      console.error("[LaunchPage] Error inside fetchData:", err); // Log fetch error
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle star toggle for shared documents
  const handleToggleStar = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to toggle star.' }));
        throw new Error(errorData.message || 'Failed to toggle star.');
      }

      const result = await response.json();
      toast.success(`Document ${result.is_starred ? 'starred' : 'unstarred'}.`);
      
      // Trigger refetch of shared documents to update the star status
      await refetch();
    } catch (error: any) {
      toast.error(error.message || "Error toggling star status.");
    }
  };

  // --- Return JSX ---
  return (
    <div className="flex flex-col h-screen bg-[--bg-primary] text-[--text-color] overflow-hidden">
      {/* Header with Toggle */}
      <div className="border-b border-[--border-color] p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Documents</h1>
          
          {/* View Toggle */}
          <div className="flex items-center gap-4">
            <Button
              variant={!showSharedDocuments ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSharedDocuments(false)}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              My Documents
            </Button>
            <Button
              variant={showSharedDocuments ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSharedDocuments(true)}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Shared Documents
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto">
        <div className="pt-2 px-2 md:pt-4 md:px-4 h-full flex flex-col">
          {showSharedDocuments ? (
            /* Shared Documents View */
            <div className="flex-grow">
              {isLoadingShared ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading shared documents...</p>
                  </div>
                </div>
              ) : sharedError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-600 mb-4">Error: {sharedError}</p>
                    <Button onClick={() => window.location.reload()}>
                      Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Shared Documents Grid */}
                  {sharedDocuments.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sharedDocuments.map((doc) => (
                        <SharedDocumentCard
                          key={doc.id}
                          document={doc}
                          onToggleStar={handleToggleStar}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No shared documents</h3>
                        <p className="text-gray-600">Documents shared with you will appear here.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Regular Document Grid */
            <div className="flex-grow">
              <DocumentCardGrid />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 