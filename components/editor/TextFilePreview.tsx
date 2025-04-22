'use client';

import React, { useState, useEffect } from 'react';

// Text File Preview Component
export function TextFilePreview({ file }: { file: File }) {
    const [content, setContent] = useState<string>('');
    useEffect(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result;
            setContent(typeof text === 'string' ? text.slice(0, 100) : '');
        };
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            setContent('Error reading file');
        };
        reader.readAsText(file);
    }, [file]);
    return (
        <div>
            {content}
            {content.length >= 100 && '...'}
        </div>
    );
} 