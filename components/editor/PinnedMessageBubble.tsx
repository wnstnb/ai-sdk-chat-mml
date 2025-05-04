import React from 'react';
import { Card, CardContent } from '@/components/ui/card'; // Assuming shadcn Card
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Corrected path
import { SendToBack, X } from 'lucide-react'; // Or MessageSquare, Minimize2 icons

interface PinnedMessageBubbleProps {
    messageContent: string;
    onSendToEditor: (content: string) => void;
    onCollapse: () => void;
}

export const PinnedMessageBubble: React.FC<PinnedMessageBubbleProps> = ({
    messageContent,
    onSendToEditor,
    onCollapse,
}) => {
    // Extract only the textual content if messageContent might contain complex objects/parts
    // This might need refinement depending on the exact structure of the message passed down
    const textContent = typeof messageContent === 'string'
        ? messageContent
        : (messageContent as any)?.text || '[Unable to display message content]';

    return (
        <div className="pinned-message-bubble">
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        {/* Apply line-clamp utility class here */}
                        <p className="line-clamp-2 flex-grow mr-2 text-sm">
                            {textContent}
                        </p>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-[500px] whitespace-pre-wrap break-words bg-background text-foreground border shadow-md">
                        {/* Display full content in tooltip */}
                        {textContent}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-1 flex-shrink-0">
                <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6" // Smaller icon button
                                onClick={() => onSendToEditor(textContent)}
                             >
                                <SendToBack size={14} />
                             </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                             Add to Editor
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6" // Smaller icon button
                                onClick={onCollapse}
                            >
                                <X size={14} />
                            </Button>
                         </TooltipTrigger>
                         <TooltipContent side="top">
                             Hide Message
                         </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
}; 