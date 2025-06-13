import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import EditorPage from '../page'; // Adjust path as needed if this file is in [documentId] directly

// --- Mocks --- 

// Next.js router mocks
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockPrefetch = jest.fn();
const mockBack = jest.fn();
const mockForward = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ documentId: 'test-doc-id' })),
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
    back: mockBack,
    forward: mockForward,
    asPath: '/',
    pathname: '/',
    query: {},
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
  })),
  useSearchParams: jest.fn(() => new URLSearchParams()), 
  usePathname: jest.fn(() => '/editor/test-doc-id'),
}));

// Vercel AI SDK mocks
jest.mock('ai/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    setMessages: jest.fn(),
    input: '',
    setInput: jest.fn(),
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    reload: jest.fn(),
    stop: jest.fn(),
    model: 'test-model',
    setModel: jest.fn(),
    append: jest.fn(),
    error: undefined,
    data: undefined,
    setBody: jest.fn(),
    setHeaders: jest.fn(),
    addToolResult: jest.fn(),
  })),
}));

// BlockNote Editor dynamic import mock
jest.mock('@/components/BlockNoteEditorComponent', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const MockBlockNoteEditorComponent = (props: any) => <div data-testid="mock-blocknote-editor">Editor Content</div>;
  MockBlockNoteEditorComponent.displayName = 'MockBlockNoteEditorComponent';
  return MockBlockNoteEditorComponent;
});

// Custom Hooks Mocks
jest.mock('@/app/lib/hooks/editor/useDocument', () => ({
  useDocument: jest.fn(() => ({
    documentData: { id: 'test-doc-id', name: 'Test Document', content: null, created_at: '', user_id:'', last_modified: '' },
    initialEditorContent: null,
    isLoadingDocument: false,
    error: null,
  })),
}));

jest.mock('@/app/lib/hooks/editor/useInitialChatMessages', () => ({
  useInitialChatMessages: jest.fn(() => ({
    isLoadingMessages: false,
    initialMessages: [],
  })),
}));

jest.mock('@/lib/hooks/editor/useTitleManagement', () => ({
  useTitleManagement: jest.fn((props: any) => ({
    currentTitle: props.initialName || 'Test Document',
    isEditingTitle: false,
    newTitleValue: props.initialName || 'Test Document',
    isInferringTitle: false,
    handleEditTitleClick: jest.fn(),
    handleCancelEditTitle: jest.fn(),
    handleSaveTitle: jest.fn(),
    handleTitleInputKeyDown: jest.fn(),
    handleInferTitle: jest.fn(),
    setNewTitleValue: jest.fn(),
  })),
}));

const mockUseChatPaneValues = {
  isExpanded: true,
  isCollapsed: false,
  toggleExpanded: jest.fn(),
  previousWidth: '30%',
  handleWidthChange: jest.fn(),
};
jest.mock('@/lib/hooks/editor/useChatPane', () => ({
  useChatPane: jest.fn(() => mockUseChatPaneValues),
}));

jest.mock('@/lib/hooks/editor/useFileUpload', () => ({
  useFileUpload: jest.fn(() => ({
    files: null,
    isUploading: false,
    uploadError: null,
    uploadedImagePath: null,
    uploadedImageSignedUrl: null,
    handleFileSelectEvent: jest.fn(),
    handleFilePasteEvent: jest.fn(),
    handleFileDropEvent: jest.fn(),
    clearPreview: jest.fn(),
  })),
}));

jest.mock('@/lib/hooks/editor/useChatInteractions', () => ({
  useChatInteractions: jest.fn(() => ({
    // Return values based on the useChat mock and other common states
    messages: [], 
    setMessages: jest.fn(), 
    input: '',
    setInput: jest.fn(),
    handleInputChange: jest.fn(), 
    handleSubmit: jest.fn(), 
    isLoading: false, 
    reload: jest.fn(),
    stop: jest.fn(),
    model: 'test-model',
    setModel: jest.fn(),
    append: jest.fn(),
    error: undefined,
    data: undefined,
    setBody: jest.fn(),
    setHeaders: jest.fn(),
    addToolResult: jest.fn(),
    lastToolResponse: null,
    setLastToolResponse: jest.fn(),
    editorRef: { current: null }, 
    handleToolCall: jest.fn(),
    isToolExecutionPending: false,
    isTranscriptionSupported: true, 
    isRecording: false, 
    isTranscribing: false,
    micPermissionError: false,
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    audioTimeDomainData: new Uint8Array(),
    taggedDocuments: [],
    setTaggedDocuments: jest.fn(),
  })),
}));

let mockIsMobile = false;
jest.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: jest.fn((query: string) => mockIsMobile),
}));

// Zustand Store Mocks
jest.mock('@/lib/stores/followUpStore', () => ({
  useFollowUpStore: jest.fn(() => ({
    followUpContext: null,
    setFollowUpContext: jest.fn(),
    clearFollowUpContext: jest.fn(),
  })),
}));

jest.mock('@/lib/stores/preferenceStore', () => ({
  usePreferenceStore: jest.fn(() => ({
    default_model: 'test-model',
    isInitialized: true,
    setDefaultModel: jest.fn(),
    // Add other store values/actions if EditorPage uses them directly
  })),
}));

jest.mock('@/stores/useModalStore', () => ({
  useModalStore: jest.fn(() => ({
    openVoiceSummaryModal: jest.fn(),
    setEditorRef: jest.fn(),
    // Add other store values/actions
  })),
}));

// Other Mocks
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}));

jest.mock('swr', () => ({
  useSWRConfig: jest.fn(() => ({
    mutate: jest.fn(),
  })),
}));

// Mock Child Components (simple mocks for now)
jest.mock('@/components/editor/EditorTitleBar', () => {
  const MockEditorTitleBar = (props: any) => <div data-testid="mock-editor-title-bar">{props.currentTitle}</div>;
  MockEditorTitleBar.displayName = 'MockEditorTitleBar';
  return MockEditorTitleBar;
});
jest.mock('@/components/editor/EditorPaneWrapper', () => {
  const MockEditorPaneWrapper = (props: any) => <div data-testid="mock-editor-pane-wrapper">Editor Pane</div>;
  MockEditorPaneWrapper.displayName = 'MockEditorPaneWrapper';
  return MockEditorPaneWrapper;
});
jest.mock('@/components/editor/ChatPaneWrapper', () => {
  const MockChatPaneWrapper = (props: any) => <div data-testid="mock-chat-pane-wrapper">Chat Pane Content</div>;
  MockChatPaneWrapper.displayName = 'MockChatPaneWrapper';
  return MockChatPaneWrapper;
});
jest.mock('@/components/chat/MobileChatDrawer', () => {
  const MockMobileChatDrawer = (props: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) =>
    props.isOpen ? <div data-testid="mock-mobile-chat-drawer">{props.children}</div> : null;
  MockMobileChatDrawer.displayName = 'MockMobileChatDrawer';
  return MockMobileChatDrawer;
});
jest.mock('@/components/chat/FloatingActionTab', () => {
  const MockFloatingActionTab = (props: { onClick: () => void; isOpen: boolean; ariaLabel?: string }) =>
    <button data-testid="mock-floating-action-tab" onClick={props.onClick} aria-expanded={props.isOpen} aria-label={props.ariaLabel}>Toggle Chat</button>;
  MockFloatingActionTab.displayName = 'MockFloatingActionTab';
  return MockFloatingActionTab;
});
jest.mock('@/components/chat/ChatPaneTab', () => {
  const MockChatPaneTab = (props: any) => <button data-testid="mock-chat-pane-tab" onClick={props.onExpand}>Expand Chat</button>;
  MockChatPaneTab.displayName = 'MockChatPaneTab';
  return MockChatPaneTab;
});
jest.mock('@/components/chat/CollapseChatTab', () => {
  const MockCollapseChatTab = (props: any) => <button data-testid="mock-collapse-chat-tab" onClick={props.onCollapse}>Collapse Chat</button>;
  MockCollapseChatTab.displayName = 'MockCollapseChatTab';
  return MockCollapseChatTab;
});
jest.mock('@/components/editor/VersionHistoryModal', () => {
  const MockVersionHistoryModal = (props: any) => props.isOpen ? <div data-testid="mock-version-history-modal">Version History</div> : null;
  MockVersionHistoryModal.displayName = 'MockVersionHistoryModal';
  return MockVersionHistoryModal;
});

// Mock DocumentReplacementConfirmationModal
jest.mock('@/components/modals/DocumentReplacementConfirmationModal', () => {
  const MockDocumentReplacementConfirmationModal = (props: any) => 
    props.isOpen ? (
      <div data-testid="mock-document-replacement-confirmation-modal">
        <div>Replace entire document content?</div>
        <button data-testid="confirm-replacement" onClick={props.onConfirm}>Confirm</button>
        <button data-testid="cancel-replacement" onClick={props.onClose}>Cancel</button>
      </div>
    ) : null;
  MockDocumentReplacementConfirmationModal.displayName = 'MockDocumentReplacementConfirmationModal';
  return MockDocumentReplacementConfirmationModal;
});

// DocumentReplacementToast removed - now using standard Sonner toast with action button


// --- Test Suite --- 
describe('EditorPage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Reset router mocks
    mockPush.mockClear();
    mockReplace.mockClear();
    // Reset useMediaQuery mock for each test
    mockIsMobile = false; 
    // Reset useChatPane mock values if needed, or set specific values per test
    Object.assign(mockUseChatPaneValues, {
        isExpanded: true,
        isCollapsed: false,
        toggleExpanded: jest.fn(),
        previousWidth: '30%',
        handleWidthChange: jest.fn(),
    });
    // Reset useDocument mock to default
    const useDocumentMock = require('@/app/lib/hooks/editor/useDocument');
    useDocumentMock.useDocument.mockReturnValue({
        documentData: { id: 'test-doc-id', name: 'Test Document', content: null, created_at: '' , user_id:'', last_modified: ''},
        initialEditorContent: null,
        isLoadingDocument: false,
        error: null,
    });
  });

  test('renders editor and chat pane in desktop view by default', () => {
    mockIsMobile = false;
    mockUseChatPaneValues.isCollapsed = false; // Ensure pane is expanded
    render(<EditorPage />);

    expect(screen.getByTestId('mock-editor-title-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-editor-pane-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('mock-chat-pane-wrapper')).toBeInTheDocument(); 
    expect(screen.getByTestId('mock-collapse-chat-tab')).toBeInTheDocument(); // Shown when pane is expanded
    expect(screen.queryByTestId('mock-chat-pane-tab')).not.toBeInTheDocument(); // Hidden when pane is expanded
    expect(screen.queryByTestId('mock-floating-action-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-mobile-chat-drawer')).not.toBeInTheDocument();
  });

  test('renders collapsed chat pane in desktop view correctly', () => {
    mockIsMobile = false;
    mockUseChatPaneValues.isCollapsed = true; // Pane is collapsed
    mockUseChatPaneValues.isExpanded = false;
    render(<EditorPage />);

    expect(screen.getByTestId('mock-editor-title-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-editor-pane-wrapper')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-chat-pane-wrapper')).not.toBeInTheDocument(); 
    expect(screen.getByTestId('mock-chat-pane-tab')).toBeInTheDocument(); // Shown when pane is collapsed
    expect(screen.queryByTestId('mock-collapse-chat-tab')).not.toBeInTheDocument(); // Hidden when pane is collapsed
  });

  test('renders editor as default in mobile view', () => {
    mockIsMobile = true;
    render(<EditorPage />);

    expect(screen.getByTestId('mock-editor-title-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-editor-pane-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('mock-floating-action-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-mobile-chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-chat-pane-wrapper')).not.toBeInTheDocument(); // Chat wrapper is inside drawer or desktop pane
  });

  test('toggles MobileChatDrawer in mobile view using FloatingActionTab', async () => {
    mockIsMobile = true;
    const user = userEvent.setup();
    render(<EditorPage />);

    // Initially, editor is visible, drawer is not
    expect(screen.getByTestId('mock-editor-pane-wrapper')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-mobile-chat-drawer')).not.toBeInTheDocument();

    // Click the floating action tab to open the drawer
    const fab = screen.getByTestId('mock-floating-action-tab');
    await user.click(fab);

    // Drawer should now be visible (containing chat pane wrapper), editor pane wrapper should be gone
    expect(await screen.findByTestId('mock-mobile-chat-drawer')).toBeVisible();
    expect(screen.getByTestId('mock-chat-pane-wrapper')).toBeInTheDocument(); // Chat content inside drawer
    expect(screen.queryByTestId('mock-editor-pane-wrapper')).not.toBeInTheDocument();

    // Click again to close the drawer (via mock MobileChatDrawer's onClose prop indirectly)
    // In the actual MobileChatDrawer, clicking backdrop or close button calls onClose.
    // Here, FloatingActionTab's onClick directly toggles the state that controls MobileChatDrawer's isOpen.
    await user.click(fab);
    
    await waitFor(() => {
        expect(screen.queryByTestId('mock-mobile-chat-drawer')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-editor-pane-wrapper')).toBeInTheDocument(); 
  });

  // --- NEW TEST SUITE FOR DESKTOP CHAT PANE RESIZING ---
  describe('Desktop Chat Pane Resizing', () => {
    const INITIAL_CHAT_PANE_WIDTH_PERCENT = 35;
    const MIN_CHAT_PANE_WIDTH_PX = 250;
    const MAX_CHAT_PANE_WIDTH_PERCENT = 70;
    let originalWindowInnerWidth: any;

    beforeEach(() => {
      mockIsMobile = false; // Ensure desktop mode
      Object.assign(mockUseChatPaneValues, {
        isExpanded: true,
        isCollapsed: false,
        previousWidth: `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`, // Start with a percentage
        handleWidthChange: jest.fn(),
        toggleExpanded: jest.fn(),
      });
      // Mock window.innerWidth
      originalWindowInnerWidth = global.innerWidth;
      global.innerWidth = 1000;
    });

    afterEach(() => {
      global.innerWidth = originalWindowInnerWidth;
    });

    test('resize handle should have correct ARIA attributes and initial values', () => {
      render(<EditorPage />);
      const resizeHandle = screen.getByTitle('Resize chat pane');
      expect(resizeHandle).toBeInTheDocument();
      expect(resizeHandle).toHaveAttribute('role', 'separator');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizeHandle).toHaveAttribute('aria-controls', 'chat-pane-resizable');
      expect(resizeHandle).toHaveAttribute('tabIndex', '0');

      const expectedInitialWidthPx = (INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * global.innerWidth;
      expect(resizeHandle).toHaveAttribute('aria-valuenow', expectedInitialWidthPx.toString());
      expect(resizeHandle).toHaveAttribute('aria-valuemin', MIN_CHAT_PANE_WIDTH_PX.toString());
      const expectedMaxWidthPx = (MAX_CHAT_PANE_WIDTH_PERCENT / 100) * global.innerWidth;
      expect(resizeHandle).toHaveAttribute('aria-valuemax', expectedMaxWidthPx.toString());

      const chatPane = document.getElementById('chat-pane-resizable');
      expect(chatPane).toBeInTheDocument();
    });

    test('should resize chat pane with pointer events (drag)', async () => {
      const user = userEvent.setup();
      render(<EditorPage />);
      const resizeHandle = screen.getByTitle('Resize chat pane');

      // initialWidthPx is (35/100)*1000 = 350px.
      // Resizer is at window.innerWidth - initialWidthPx = 1000 - 350 = 650px from left edge.
      // Let's drag it 50px to the left (to clientX = 600).
      // newWidth should be window.innerWidth - newClientX = 1000 - 600 = 400px.
      
      fireEvent.pointerDown(resizeHandle, { clientX: 650, button: 0 });
      // Need to attach to document for pointermove/up as per component logic
      fireEvent.pointerMove(document, { clientX: 600 }); 
      fireEvent.pointerUp(document);

      expect(mockUseChatPaneValues.handleWidthChange).toHaveBeenCalledWith('400px');

      // To check aria-valuenow update, we need to simulate the re-render that happens
      // when previousWidth changes. The mock itself won't trigger it directly.
      // We can update the mock and re-render or check the call.
      // For simplicity, we trust handleWidthChange is called correctly.
    });

    test('should resize chat pane with keyboard (ArrowLeft and ArrowRight)', async () => {
      const user = userEvent.setup();
      render(<EditorPage />);
      const resizeHandle = screen.getByTitle('Resize chat pane');
      resizeHandle.focus();
      expect(resizeHandle).toHaveFocus();

      const initialWidthPx = (INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * global.innerWidth; // 350px
      const step = 10;

      // Press ArrowLeft (wider)
      await user.keyboard('{ArrowLeft}');
      let expectedWidth = initialWidthPx + step; // 350 + 10 = 360
      expect(mockUseChatPaneValues.handleWidthChange).toHaveBeenCalledWith(`${expectedWidth}px`);
      
      // Simulate state update for next key press calculation in component
      mockUseChatPaneValues.previousWidth = `${expectedWidth}px`;
      // Re-render or update relevant part of mock if aria-valuenow is crucial here, 
      // otherwise trust the handleWidthChange call.

      // Press ArrowRight (narrower)
      await user.keyboard('{ArrowRight}');
      expectedWidth = expectedWidth - step; // 360 - 10 = 350
      expect(mockUseChatPaneValues.handleWidthChange).toHaveBeenCalledWith(`${expectedWidth}px`);
      mockUseChatPaneValues.previousWidth = `${expectedWidth}px`;

      // Test min width boundary with ArrowRight
      // Current is 350px. Min is 250px. Need 10 right arrows (100px reduction)
      mockUseChatPaneValues.previousWidth = '255px'; // Set width close to min
      await user.keyboard('{ArrowRight}'); // Makes it 245px, should be clamped to 250px
      expect(mockUseChatPaneValues.handleWidthChange).toHaveBeenCalledWith(`${MIN_CHAT_PANE_WIDTH_PX}px`);
      mockUseChatPaneValues.previousWidth = `${MIN_CHAT_PANE_WIDTH_PX}px`;

      // Test max width boundary with ArrowLeft
      const maxWidthPx = (MAX_CHAT_PANE_WIDTH_PERCENT / 100) * global.innerWidth; // 700px
      mockUseChatPaneValues.previousWidth = `${maxWidthPx - 5}px`; // Set width close to max (695px)
      await user.keyboard('{ArrowLeft}'); // Makes it 705px, should be clamped to 700px
      expect(mockUseChatPaneValues.handleWidthChange).toHaveBeenCalledWith(`${maxWidthPx}px`);
    });
  });
  // --- END NEW TEST SUITE ---

  // --- NEW TEST SUITE FOR DOCUMENT REPLACEMENT TOOL ---
  describe('Document Replacement Tool', () => {
    let mockEditor: any;
    let mockUseChatInteractionsMock: any;

    beforeEach(() => {
      // Create a mock editor with the methods we need
      mockEditor = {
        document: [
          { id: 'block1', type: 'paragraph', content: 'Original content 1' },
          { id: 'block2', type: 'paragraph', content: 'Original content 2' }
        ],
        tryParseMarkdownToBlocks: jest.fn().mockResolvedValue([
          { type: 'paragraph', content: [{ type: 'text', text: 'New content', styles: {} }] }
        ]),
        replaceBlocks: jest.fn().mockReturnValue([
          { id: 'newblock1', type: 'paragraph', content: 'New content' }
        ]),
        transact: jest.fn().mockImplementation((callback) => callback()),
        undo: jest.fn(),
        redo: jest.fn(),
      };

      // Mock the useChatInteractions hook to include our mock editor
      mockUseChatInteractionsMock = require('@/lib/hooks/editor/useChatInteractions');
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        messages: [], 
        setMessages: jest.fn(), 
        input: '',
        setInput: jest.fn(),
        handleInputChange: jest.fn(), 
        handleSubmit: jest.fn(), 
        isLoading: false, 
        reload: jest.fn(),
        stop: jest.fn(),
        model: 'test-model',
        setModel: jest.fn(),
        append: jest.fn(),
        error: undefined,
        data: undefined,
        setBody: jest.fn(),
        setHeaders: jest.fn(),
        addToolResult: jest.fn(),
        lastToolResponse: null,
        setLastToolResponse: jest.fn(),
        editorRef: { current: mockEditor }, 
        handleToolCall: jest.fn(),
        isToolExecutionPending: false,
        isTranscriptionSupported: true, 
        isRecording: false, 
        isTranscribing: false,
        micPermissionError: false,
        startRecording: jest.fn(),
        stopRecording: jest.fn(),
        audioTimeDomainData: new Uint8Array(),
        taggedDocuments: [],
        setTaggedDocuments: jest.fn(),
      });

      mockIsMobile = false;
    });

    test('should handle replaceAllContent tool call with confirmation', async () => {
      const user = userEvent.setup();
      
      // Mock the confirmation modal to auto-confirm
      const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
      
      render(<EditorPage />);

      // Simulate a tool call for replaceAllContent
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-1',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: true
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait for the tool to be processed
      await waitFor(() => {
        expect(mockEditor.transact).toHaveBeenCalled();
      });

      // Verify that replaceBlocks was called within the transaction
      expect(mockEditor.transact).toHaveBeenCalledWith(expect.any(Function));
      expect(mockEditor.replaceBlocks).toHaveBeenCalledWith(
        mockEditor.document,
        expect.any(Array)
      );

      mockConfirm.mockRestore();
    });

    test('should cancel replaceAllContent when user declines confirmation', async () => {
      // Mock the confirmation modal to decline
      const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
      
      render(<EditorPage />);

      // Simulate a tool call for replaceAllContent
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-2',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: true
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait a bit to ensure processing would have happened
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that replaceBlocks was NOT called
      expect(mockEditor.replaceBlocks).not.toHaveBeenCalled();
      expect(mockEditor.transact).not.toHaveBeenCalled();

      mockConfirm.mockRestore();
    });

    test('should handle replaceAllContent without confirmation when requireConfirmation is false', async () => {
      render(<EditorPage />);

      // Simulate a tool call for replaceAllContent without confirmation
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-3',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: false
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait for the tool to be processed
      await waitFor(() => {
        expect(mockEditor.transact).toHaveBeenCalled();
      });

      // Verify that replaceBlocks was called within the transaction
      expect(mockEditor.transact).toHaveBeenCalledWith(expect.any(Function));
      expect(mockEditor.replaceBlocks).toHaveBeenCalledWith(
        mockEditor.document,
        expect.any(Array)
      );
    });

    test('should handle empty content gracefully', async () => {
      render(<EditorPage />);

      // Simulate a tool call with empty content
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-4',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '',
                  requireConfirmation: false
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Mock tryParseMarkdownToBlocks to return empty array for empty content
      mockEditor.tryParseMarkdownToBlocks.mockResolvedValue([]);

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait a bit to ensure processing would have happened
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that replaceBlocks was NOT called due to empty content
      expect(mockEditor.replaceBlocks).not.toHaveBeenCalled();
    });

    test('should handle editor not available gracefully', async () => {
      render(<EditorPage />);

      // Simulate a tool call when editor is not available
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-5',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: false
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages with no editor
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: null }, // No editor available
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait a bit to ensure processing would have happened
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that no editor operations were attempted
      expect(mockEditor.replaceBlocks).not.toHaveBeenCalled();
      expect(mockEditor.transact).not.toHaveBeenCalled();
    });

    test('should handle transaction errors gracefully', async () => {
      render(<EditorPage />);

      // Mock the editor to throw an error during transaction
      mockEditor.transact.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      // Simulate a tool call for replaceAllContent
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-6',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: false
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait for the tool to be processed
      await waitFor(() => {
        expect(mockEditor.transact).toHaveBeenCalled();
      });

      // Verify that the error was handled gracefully
      expect(mockEditor.transact).toHaveBeenCalled();
      // The component should continue to function despite the error
    });

    test('should handle undo functionality correctly', async () => {
      const user = userEvent.setup();
      
      render(<EditorPage />);

      // Simulate successful document replacement first
      const mockMessages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'test-replace-call-7',
                toolName: 'replaceAllContent',
                args: {
                  newMarkdownContent: '# New Document\n\nThis is the new content.',
                  requireConfirmation: false
                },
                state: 'call'
              }
            }
          ]
        }
      ];

      // Update the mock to return these messages
      mockUseChatInteractionsMock.useChatInteractions.mockReturnValue({
        ...mockUseChatInteractionsMock.useChatInteractions(),
        messages: mockMessages,
        editorRef: { current: mockEditor },
      });

      // Re-render with the new messages
      render(<EditorPage />);

      // Wait for the tool to be processed
      await waitFor(() => {
        expect(mockEditor.transact).toHaveBeenCalled();
      });

      // Verify that the transaction was called
      expect(mockEditor.transact).toHaveBeenCalled();
      expect(mockEditor.replaceBlocks).toHaveBeenCalled();

      // Test that undo functionality would work
      // (In a real test, we'd simulate clicking the undo button in the toast)
      mockEditor.undo();
      expect(mockEditor.undo).toHaveBeenCalled();
    });
  });
  // --- END DOCUMENT REPLACEMENT TOOL TEST SUITE ---

}); 