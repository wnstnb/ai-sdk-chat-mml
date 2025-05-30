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

  const renderDocumentList = (docs: any[], isLoading: boolean, error: string | null) => {
    if (isLoading) return <div className="flex justify-center items-center p-4"><Loader2 className="h-5 w-5 animate-spin text-[--muted-text-color]" /></div>;
    if (error) return <div className="p-2 text-red-500 text-xs">Error: {error}</div>;
    if (docs.length === 0) return <div className="p-2 text-xs text-center text-[--muted-text-color]">No documents found.</div>;

    return (
      <ul className="space-y-1 p-1 max-h-60 overflow-y-auto">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Link 
              href={`/editor/${doc.id}`} 
              className="block p-1.5 text-sm text-[--text-color] hover:bg-[--hover-bg] rounded truncate"
            >
              {doc.name}
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Tabs defaultValue="recent" className="p-1">
      <TabsList className="grid w-full grid-cols-2 bg-[--input-bg] border-[--border-color]">
        <TabsTrigger 
          value="recent" 
          className="data-[state=active]:bg-[--primary-color] data-[state=active]:text-gray-700 text-[--muted-text-color] hover:text-[--text-color]"
        >
          <FileClock className="w-4 h-4 mr-1.5" /> Recent
        </TabsTrigger>
        <TabsTrigger 
          value="starred"
          className="data-[state=active]:bg-[--primary-color] data-[state=active]:text-gray-700 text-[--muted-text-color] hover:text-[--text-color]"
        >
          <Star className="w-4 h-4 mr-1.5" /> Starred
        </TabsTrigger>
      </TabsList>
      <TabsContent value="recent" className="mt-1">
        {renderDocumentList(recentDocs, isLoadingRecent, recentError)}
      </TabsContent>
      <TabsContent value="starred" className="mt-1">
        {renderDocumentList(starredDocs, isLoadingStarred, starredError)}
      </TabsContent>
    </Tabs>
  );
}; 