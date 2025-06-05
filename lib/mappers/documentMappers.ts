import type { Document } from '@/types/supabase';

/**
 * Interface for the data structure expected by components rendering a list of document cards.
 * It includes the document ID for keys and the props required by the DocumentCard component.
 */
export interface MappedDocumentCardData {
  id: string;
  title: string;
  lastUpdated: string | Date | number; // Matches DocumentCardProps
  snippet: string;
  is_starred: boolean;
  folder_id?: string | null; // Added for folder filtering
}

const MAX_SNIPPET_LENGTH = 150;
const DEFAULT_SNIPPET = "No preview available.";

/**
 * Maps a single Document object to MappedDocumentCardData.
 * This prepares the document data for display in a DocumentCard.
 *
 * @param document The source Document object from Supabase.
 * @returns MappedDocumentCardData object.
 */
export function mapDocumentToMappedCardData(document: Document): MappedDocumentCardData {
  let displaySnippet = document.searchable_content || DEFAULT_SNIPPET;

  if (document.searchable_content && document.searchable_content.length > MAX_SNIPPET_LENGTH) {
    displaySnippet = document.searchable_content.substring(0, MAX_SNIPPET_LENGTH) + "...";
  }

  return {
    id: document.id,
    title: document.name, // DocumentCard handles untitled cases
    lastUpdated: document.updated_at,
    snippet: displaySnippet,
    is_starred: document.is_starred ?? false,
    folder_id: document.folder_id,
  };
}

/**
 * Maps an array of Document objects to an array of MappedDocumentCardData objects.
 *
 * @param documents An array of Document objects.
 * @returns An array of MappedDocumentCardData objects.
 */
export function mapDocumentsToMappedCardData(documents: Document[]): MappedDocumentCardData[] {
  if (!documents) {
    return [];
  }
  return documents.map(mapDocumentToMappedCardData);
} 