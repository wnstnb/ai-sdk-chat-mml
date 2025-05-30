import { create } from 'zustand';
import { Document, Folder } from '@/types/supabase'; // Assuming types are defined here

// Define the structure for a breadcrumb item
interface BreadcrumbItem {
  id: string | null; // null represents the root
  name: string;
}

// Define the state structure
interface FileMediaStoreState {
  // All folders fetched (used by FolderTree for structure)
  allFolders: Folder[];
  // --- Add all documents --- 
  allDocuments: Document[]; // Keep track of ALL fetched documents
  // Folders and documents currently displayed in the main view
  currentViewFolders: Folder[];
  currentViewDocuments: Document[];
  // ID of the currently viewed folder (null for root)
  currentFolderId: string | null;
  // Array representing the path to the current folder for breadcrumbs
  currentPath: BreadcrumbItem[];
  // --- New State for Expansion ---
  expandedFolderIds: Set<string>; // IDs of folders expanded in the main view
  isLoading: boolean;
  error: string | null;
  selectedItemIds: Set<string>; // NEW: Set to store IDs of selected items

  // Setters and Actions
  setAllFolders: (folders: Folder[]) => void; // Keep track of all folders for tree/path building
  setAllDocuments: (documents: Document[]) => void; // Setter for all documents
  setCurrentViewItems: (folders: Folder[], documents: Document[]) => void; // Items for the main view
  setCurrentFolder: (folderId: string | null, allFolders: Folder[]) => void; // Action to change folder and update path
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleFolderExpansion: (folderId: string) => void;
  // Rename action for clarity with checkboxes
  toggleSelectItem: (id: string) => void;
  clearSelection: () => void;
  // TODO: Add more specific actions later (e.g., addFolder, removeDocument, updateItem)
  updateDocumentInStore: (documentId: string, updates: Partial<Document>) => void;
}

// Helper function to build the breadcrumb path
const buildBreadcrumbPath = (folderId: string | null, allFolders: Folder[]): BreadcrumbItem[] => {
  const path: BreadcrumbItem[] = [{ id: null, name: 'My Files' }]; // Start with root
  let currentId = folderId;
  while (currentId) {
    const currentFolder = allFolders.find(f => f.id === currentId);
    if (currentFolder) {
      path.splice(1, 0, { id: currentFolder.id, name: currentFolder.name }); // Insert after root
      currentId = currentFolder.parent_folder_id;
    } else {
      // Should not happen if allFolders is comprehensive, but good to handle
      console.error("Could not find folder in path:", currentId);
      break;
    }
  }
  return path;
};

// Create the store
export const useFileMediaStore = create<FileMediaStoreState>((set, get) => ({
  // Initial State
  allFolders: [],
  allDocuments: [], // Initialize all documents
  currentViewFolders: [],
  currentViewDocuments: [],
  currentFolderId: null, // Start at root
  currentPath: [{ id: null, name: 'My Files' }], // Initial path is just the root
  expandedFolderIds: new Set(), // Initialize as empty set
  isLoading: false,
  error: null,
  selectedItemIds: new Set(), // Initialize selected IDs as an empty set

  // Implement Setters and Actions
  setAllFolders: (folders) => set({ allFolders: folders }),
  setAllDocuments: (documents) => set({ allDocuments: documents }), // Implement setter
  setCurrentViewItems: (folders, documents) => set({ currentViewFolders: folders, currentViewDocuments: documents }),
  setCurrentFolder: (folderId, allFolders) => {
    const newPath = buildBreadcrumbPath(folderId, allFolders);
    set({
      currentFolderId: folderId,
      currentPath: newPath,
      selectedItemIds: new Set(), // Clear selection when navigating
      expandedFolderIds: new Set(), // Collapse all folders when navigating
    });
  },
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  toggleFolderExpansion: (folderId) => set((state) => {
    const newSet = new Set(state.expandedFolderIds);
    if (newSet.has(folderId)) {
      newSet.delete(folderId);
    } else {
      newSet.add(folderId);
    }
    return { expandedFolderIds: newSet };
  }),

  // --- Selection Actions (Updated for Checkboxes) ---
  toggleSelectItem: (id) => set((state) => {
    const newSelection = new Set(state.selectedItemIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    return { selectedItemIds: newSelection };
  }),

  clearSelection: () => set({ selectedItemIds: new Set() }),
  // --- End Selection Actions ---

  // Add this function to update a document in the store
  updateDocumentInStore: (documentId, updates) => set((state) => ({
    allDocuments: state.allDocuments.map(doc =>
      doc.id === documentId ? { ...doc, ...updates } : doc
    ),
    currentViewDocuments: state.currentViewDocuments.map(doc =>
      doc.id === documentId ? { ...doc, ...updates } : doc
    ),
  })),
}));

// Example Usage (can be removed later):
// const { folders, isLoading, setIsLoading, setFolders } = useFileMediaStore(); 