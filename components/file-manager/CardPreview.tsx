import React from 'react';
import DocumentCard from './DocumentCard';
import type { Document } from '@/types/supabase';
import { mapDocumentsToMappedCardData, type MappedDocumentCardData } from '@/lib/mappers/documentMappers';

const sampleRawDocs: Document[] = [
  {
    id: '1',
    user_id: 'dummy-user-id-1',
    folder_id: null,
    name: 'Project Phoenix: Technical Architecture Overview & Design Principles',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sample content.' }] }] },
    searchable_content: 'The technical architecture for Project Phoenix leverages a microservices-based approach, utilizing Kubernetes for orchestration and Kafka for asynchronous messaging. This document outlines the core components, data flow, and deployment strategies. Key considerations include scalability, fault tolerance, and security across all layers of the application. We will also explore the integration points with existing enterprise systems and third-party services.',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    is_starred: false,
  },
  {
    id: '2',
    user_id: 'dummy-user-id-2',
    folder_id: 'dummy-folder-id-1',
    name: 'My Summer Vacation Plans & Itinerary Ideas for Next Year\'s Trip',
    content: null,
    searchable_content: 'Exploring options for next summer. Top contenders: Italian coast, Japanese temples, or a national parks road trip. Budgeting, best times to visit, and potential activities are being researched. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    is_starred: true,
  },
  {
    id: '3',
    user_id: 'dummy-user-id-3',
    folder_id: null,
    name: 'Q3 Marketing Campaign Results and Analysis Report',
    content: { someKey: 'someValue' },
    searchable_content: 'This report details the performance of our Q3 marketing campaigns, including key metrics such as conversion rates, click-through rates, and return on investment. It also includes an analysis of what worked well, what didn\'t, and recommendations for future campaigns. Overall, the campaign exceeded targets in several key areas, but there are opportunities for improvement in social media engagement.',
    created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
    is_starred: false,
  },
  {
    id: '4',
    user_id: 'dummy-user-id-4',
    folder_id: null,
    name: 'Invalid Date Test Document',
    content: null,
    searchable_content: 'This card is used to test the handling of an invalid date string for the lastUpdated field. The date utility in DocumentCard should gracefully handle this.',
    created_at: new Date().toISOString(),
    updated_at: 'this is not a date', // Invalid date string for DocumentCard to handle
    is_starred: false,
  },
  {
    id: '5',
    user_id: 'dummy-user-id-5',
    folder_id: null,
    name: '', // Empty title test, DocumentCard should handle this
    content: null,
    searchable_content: 'This card tests the behavior when the title is an empty string. DocumentCard should display "(Untitled)" as the title.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), // Today
    is_starred: true,
  },
  // New test cases for mapping logic
  {
    id: '6',
    user_id: 'dummy-user-id-6',
    folder_id: null,
    name: 'Null Snippet Test',
    content: null,
    searchable_content: null, // Mapper should provide default
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_starred: false,
  },
  {
    id: '7',
    user_id: 'dummy-user-id-7',
    folder_id: null,
    name: 'Empty Snippet Test',
    content: null,
    searchable_content: '', // Mapper should provide default
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_starred: false,
  },
  {
    id: '8',
    user_id: 'dummy-user-id-8',
    folder_id: null,
    name: 'Long Snippet Truncation Test',
    content: null,
    searchable_content: 'This is a very long snippet designed to test the truncation logic implemented in the data mapper. It should be cut off after 150 characters and have an ellipsis (...) appended to indicate that there is more content available than what is currently displayed on the card. We need to ensure this works correctly to maintain a consistent UI and prevent overly long text from breaking the card layout. This string is definitely longer than one hundred and fifty characters to ensure the test is valid. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_starred: false,
  },
  {
    id: '9',
    user_id: 'dummy-user-id-9',
    folder_id: null,
    name: 'Short Snippet (No Truncation) Test',
    content: null,
    searchable_content: 'This is a short snippet. It should not be truncated and display as is.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_starred: true,
  },
  {
    id: '10',
    user_id: 'dummy-user-id-10',
    folder_id: null,
    name: 'Special Chars Test: Title with < & > " \' `',
    content: null,
    searchable_content: 'Snippet with special characters: < & > " \' ` and some emojis ✨🎉😊. The mapping itself does not escape HTML, but React rendering handles it. Truncation should work with these characters too, if the snippet is long enough. This one is not long enough to be truncated.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_starred: false,
  },
];

const CardPreview: React.FC = () => {
  const mappedDocs: MappedDocumentCardData[] = mapDocumentsToMappedCardData(sampleRawDocs);

  return (
    <div className="p-4 bg-[var(--editor-bg)] min-h-screen">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-200">Document Card Preview (with Mapper)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {mappedDocs.map((doc) => (
          <DocumentCard
            key={doc.id}
            id={doc.id}
            title={doc.title}
            lastUpdated={doc.lastUpdated}
            snippet={doc.snippet}
            is_starred={doc.is_starred}
          />
        ))}
      </div>
    </div>
  );
};

export default CardPreview; 