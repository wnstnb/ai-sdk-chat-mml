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
import { FilePlus, AudioWaveform, Shovel, BookOpenText } from 'lucide-react';
// ADDED: Import useModalStore
import { useModalStore } from '@/stores/useModalStore';

// --- NEW: Import Omnibar ---
import { Omnibar } from '@/components/search/Omnibar';
// --- NEW: Import X icon for pills ---
import { X } from 'lucide-react'; 
// --- NEW: Import DocumentCardGrid component ---
import DocumentCardGrid from '@/components/file-manager/DocumentCardGrid';

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

  // --- Preference Store --- ADDED
  const {
      default_model: preferredModel,
      isInitialized: isPreferencesInitialized,
  } = usePreferenceStore();

  // --- State for File Manager & Page ---
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true); // For initial data fetch
  const [error, setError] = useState<string | null>(null);

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

  // --- Return JSX ---
  return (
    <div className="flex flex-col h-screen bg-[--bg-primary] text-[--text-color] overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto">
        <div className="pt-2 px-2 md:pt-4 md:px-4 h-full flex flex-col">
          {/* Document Grid */}
          <div className="flex-grow">
            <DocumentCardGrid />
          </div>
        </div>
      </div>
    </div>
  );
} 