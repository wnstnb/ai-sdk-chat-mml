// Utility functions related to BlockNote editor content manipulation

import {
    InlineContent,
    BlockNoteSchema,
    StyleSchema,
    InlineContentSchema
} from '@blocknote/core';

// Define a default schema or allow passing one if needed, for type safety
// Using a basic schema definition for the types here
const schema = BlockNoteSchema.create();
type BNSchema = typeof schema;

// Helper function to extract text from BlockNote InlineContent[]
export const getInlineContentText = (
    content: InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[]
): string => {
    let text = '';
    for (const item of content) {
        if (item.type === 'text') {
            text += item.text;
        } else if (item.type === 'link') {
            text += getInlineContentText(item.content);
        }
        // Add cases for other inline content types if necessary
    }
    return text;
};

// Replaces the first occurrence of targetText with replacementText within InlineContent[].
export const replaceTextInInlineContent = (
    content: InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[],
    targetText: string,
    replacementText: string
): InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[] | null => {
    const newContent: InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[] = [];
    let replaced = false;

    for (const item of content) {
        if (!replaced && item.type === 'text' && item.text.includes(targetText)) {
            const parts = item.text.split(targetText);
            const before = parts.shift() || '';
            const after = parts.join(targetText);

            if (before) {
                newContent.push({ ...item, text: before });
            }
            newContent.push({
                type: 'text',
                text: replacementText,
                styles: item.styles || {},
            });
            if (after) {
                newContent.push({ ...item, text: after });
            }
            replaced = true;
        } else {
            newContent.push(item);
        }
    }
    return replaced ? newContent : null;
};

// Deletes the first occurrence of targetText within InlineContent[].
export const deleteTextInInlineContent = (
    content: InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[],
    targetText: string
): InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[] | null => {
    const newContent: InlineContent<BNSchema['inlineContentSchema'], BNSchema['styleSchema']>[] = [];
    let deleted = false;

    for (const item of content) {
        if (!deleted && item.type === 'text' && item.text.includes(targetText)) {
            const parts = item.text.split(targetText);
            const before = parts.shift() || '';
            const after = parts.join(targetText);

            if (before) {
                newContent.push({ ...item, text: before });
            }
            if (after) {
                newContent.push({ ...item, text: after });
            }
            deleted = true;
        } else {
            newContent.push(item);
        }
    }
    return deleted ? newContent : null;
};

// Helper to get text from data URL (for text file previews)
export const getTextFromDataUrl = (dataUrl: string): string => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return '';
    try {
        return window.atob(base64);
    } catch (e) {
        console.error('Error decoding base64 string:', e);
        return 'Error decoding data'; // Return error message instead of empty
    }
}; 