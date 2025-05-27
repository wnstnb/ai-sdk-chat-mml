'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const MinimalEditor = dynamic(() => import('@/components/editor/MinimalBlockNoteEditor'), {
  ssr: false,
  loading: () => <p>Loading Editor...</p>,
});

export default function BasicEditorPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Basic BlockNote Editor</h1>
      <MinimalEditor />
    </div>
  );
} 