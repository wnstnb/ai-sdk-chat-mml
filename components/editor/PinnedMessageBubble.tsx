import React, { useState, useEffect, useRef } from 'react';
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
    const [isHovering, setIsHovering] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Extract only the textual content if messageContent might contain complex objects/parts
    // This might need refinement depending on the exact structure of the message passed down
    const textContent = typeof messageContent === 'string'
        ? messageContent
        : (messageContent as any)?.text || '[Unable to display message content]';

    useEffect(() => {
        if (!isHovering && isVisible) {
            timerRef.current = setTimeout(() => {
                setIsVisible(false);
                // Call onCollapse after the fade-out animation completes
                // Assuming a 300ms fade-out duration (same as the transition)
                setTimeout(onCollapse, 300);
            }, 1500);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [isHovering, isVisible, onCollapse]);

    const handleMouseEnter = () => {
        setIsHovering(true);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
    };

    const handleMouseLeave = () => {
        setIsHovering(false);
    };

    return (
        <div
            className={`pinned-message-bubble transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '8px', background: 'hsl(var(--background))', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)' }} // Added some basic styling for visibility
        >
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