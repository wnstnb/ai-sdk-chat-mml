import React from 'react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; // Assuming tabs.tsx is in components/ui
import { FileClock, Star, Loader2 } from 'lucide-react';
import { useRecentDocuments, useStarredDocuments } from '@/hooks/useDocumentLists'; // UPDATED CORRECT PATH
import { Document } from '@/types/supabase'; // Adjust path if necessary

interface QuickAccessDocument extends Partial<Document> {
  id: string;
  name: string;
}

export const QuickAccessDropdown: React.FC = () => {
  const { documents: recentDocs, isLoading: isLoadingRecent, error: recentError } = useRecentDocuments();
  const { documents: starredDocs, isLoading: isLoadingStarred, error: starredError } = useStarredDocuments();

  const renderDocumentList = (
    docs: QuickAccessDocument[] | null | undefined, 
    isLoading: boolean, 
    error: string | null,
    emptyMessage: string
  ) => {
    if (isLoading) return <div className="flex justify-center items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-[--muted-text-color]" /></div>;
    if (error) return <div className="p-2 text-xs text-center text-red-500">Error: {error}</div>;
    if (!docs || docs.length === 0) return <div className="p-3 text-xs text-center text-[--muted-text-color]">{emptyMessage}</div>;

    return (
      <ul className="space-y-0.5 p-1 max-h-60 overflow-y-auto styled-scrollbar">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Link 
              href={`/editor/${doc.id}`} 
              className="block p-1.5 text-sm text-[--text-color] hover:bg-[--hover-bg] rounded truncate"
              title={doc.name}
            >
              {doc.name || 'Untitled Document'}
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Tabs defaultValue="recent" className="p-1">
      <TabsList className="grid w-full grid-cols-2 mb-1">
        <TabsTrigger value="recent" className="text-xs px-2 py-1.5">
          <FileClock className="w-3.5 h-3.5 mr-1.5" /> Recent
        </TabsTrigger>
        <TabsTrigger value="starred" className="text-xs px-2 py-1.5">
          <Star className="w-3.5 h-3.5 mr-1.5" /> Starred
        </TabsTrigger>
      </TabsList>
      <TabsContent value="recent" className="mt-0">
        {renderDocumentList(recentDocs, isLoadingRecent, recentError, "No recent documents.")}
      </TabsContent>
      <TabsContent value="starred" className="mt-0">
        {renderDocumentList(starredDocs, isLoadingStarred, starredError, "No starred documents yet. Star a document to see it here.")}
      </TabsContent>
    </Tabs>
  );
}; 