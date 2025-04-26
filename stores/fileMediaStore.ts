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
  selectedItems: string[]; // Store IDs of selected items (folders/documents)

  // Setters and Actions
  setAllFolders: (folders: Folder[]) => void; // Keep track of all folders for tree/path building
  setAllDocuments: (documents: Document[]) => void; // Setter for all documents
  setCurrentViewItems: (folders: Folder[], documents: Document[]) => void; // Items for the main view
  setCurrentFolder: (folderId: string | null, allFolders: Folder[]) => void; // Action to change folder and update path
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedItems: (ids: string[]) => void;
  // --- New Action for Expansion ---
  toggleFolderExpansion: (folderId: string) => void;
  // TODO: Add more specific actions later (e.g., addFolder, removeDocument, updateItem)
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
  selectedItems: [],

  // Implement Setters and Actions
  setAllFolders: (folders) => set({ allFolders: folders }),
  setAllDocuments: (documents) => set({ allDocuments: documents }), // Implement setter
  setCurrentViewItems: (folders, documents) => set({ currentViewFolders: folders, currentViewDocuments: documents }),
  setCurrentFolder: (folderId, allFolders) => {
    const newPath = buildBreadcrumbPath(folderId, allFolders);
    set({
      currentFolderId: folderId,
      currentPath: newPath,
      selectedItems: [],
      expandedFolderIds: new Set(), // Collapse all folders when navigating
    });
  },
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setSelectedItems: (ids) => set({ selectedItems: ids }),
  // --- Implement Expansion Action ---
  toggleFolderExpansion: (folderId) => set((state) => {
    const newSet = new Set(state.expandedFolderIds);
    if (newSet.has(folderId)) {
      newSet.delete(folderId);
    } else {
      newSet.add(folderId);
    }
    return { expandedFolderIds: newSet };
  }),
}));

// Example Usage (can be removed later):
// const { folders, isLoading, setIsLoading, setFolders } = useFileMediaStore(); 