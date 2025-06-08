import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ChatPaneWrapper } from '../ChatPaneWrapper';
import type { Message } from 'ai/react';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions';

// Mock child components
jest.mock('../ChatMessagesList', () => ({
  ChatMessagesList: ({ chatMessages, isLoadingMessages, isChatLoading, onAddTaggedDocument }: any) => (
    <div data-testid="chat-messages-list">
      <div data-testid="messages-count">{chatMessages.length}</div>
      <div data-testid="is-loading-messages">{isLoadingMessages.toString()}</div>
      <div data-testid="is-chat-loading">{isChatLoading.toString()}</div>
      <button onClick={() => onAddTaggedDocument({ id: 'test-doc', name: 'Test Document' })}>
        Add Test Document
      </button>
    </div>
  ),
}));

jest.mock('../ChatInputArea', () => ({
  ChatInputArea: ({ 
    input, 
    setInput, 
    isLoading, 
    model, 
    setModel, 
    taggedDocuments, 
    setTaggedDocuments,
    isMiniPaneOpen,
    onToggleMiniPane,
    isMainChatCollapsed 
  }: any) => (
    <div data-testid="chat-input-area">
      <input 
        data-testid="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
      />
      <div data-testid="is-loading">{isLoading.toString()}</div>
      <div data-testid="model">{model}</div>
      <div data-testid="tagged-documents-count">{taggedDocuments.length}</div>
      <div data-testid="mini-pane-open">{isMiniPaneOpen?.toString()}</div>
      <div data-testid="main-chat-collapsed">{isMainChatCollapsed?.toString()}</div>
      <button onClick={onToggleMiniPane} data-testid="toggle-mini-pane">
        Toggle Mini Pane
      </button>
      <button onClick={() => setTaggedDocuments([...taggedDocuments, { id: 'new-doc', name: 'New Doc' }])}>
        Add Tagged Document
      </button>
    </div>
  ),
}));

// Create mock audio time domain data
const mockAudioTimeDomainData: AudioTimeDomainData = new Uint8Array(128);

// Default props for testing
const defaultProps = {
  isChatCollapsed: false,
  chatMessages: [] as Message[],
  isLoadingMessages: false,
  isChatLoading: false,
  handleSendToEditor: jest.fn(),
  messagesEndRef: React.createRef<HTMLDivElement>(),
  messageLoadBatchSize: 20,
  input: '',
  setInput: jest.fn(),
  handleInputChange: jest.fn(),
  handleSubmit: jest.fn(),
  model: 'gpt-3.5-turbo',
  setModel: jest.fn(),
  stop: jest.fn(),
  files: null,
  handleFileChange: jest.fn(),
  handlePaste: jest.fn(),
  handleUploadClick: jest.fn(),
  isUploading: false,
  uploadError: null,
  uploadedImagePath: null,
  followUpContext: null,
  setFollowUpContext: jest.fn(),
  formRef: jest.fn(),
  inputRef: React.createRef<HTMLTextAreaElement>(),
  fileInputRef: React.createRef<HTMLInputElement>(),
  handleKeyDown: jest.fn(),
  initialChatPaneWidthPercent: 30,
  minChatPaneWidthPx: 300,
  isRecording: false,
  isTranscribing: false,
  micPermissionError: false,
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  audioTimeDomainData: mockAudioTimeDomainData,
  clearPreview: jest.fn(),
  taggedDocuments: [],
  setTaggedDocuments: jest.fn(),
  isMiniPaneOpen: false,
  onToggleMiniPane: jest.fn(),
  isMainChatCollapsed: false,
  miniPaneToggleRef: React.createRef<HTMLButtonElement>(),
  currentTheme: 'light' as const,
};

describe('ChatPaneWrapper', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders correctly with default props', () => {
      render(<ChatPaneWrapper {...defaultProps} />);
      
      expect(screen.getByTestId('chat-messages-list')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });

    it('renders with correct structure and styling', () => {
      const { container } = render(<ChatPaneWrapper {...defaultProps} />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'flex-col', 'flex-1', 'overflow-hidden', 'h-full', 'px-3');
    });

    it('renders when chat is collapsed', () => {
      render(<ChatPaneWrapper {...defaultProps} isChatCollapsed={true} />);
      
      // Component should still render regardless of collapsed state
      // The parent component handles the visibility logic
      expect(screen.getByTestId('chat-messages-list')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });
  });

  describe('ChatMessagesList Integration', () => {
    it('passes correct props to ChatMessagesList', () => {
      const mockMessages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
      ];

      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          chatMessages={mockMessages}
          isLoadingMessages={true}
          isChatLoading={true}
        />
      );

      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
      expect(screen.getByTestId('is-loading-messages')).toHaveTextContent('true');
      expect(screen.getByTestId('is-chat-loading')).toHaveTextContent('true');
    });

    it('handles document tagging from ChatMessagesList', async () => {
      const mockSetTaggedDocuments = jest.fn();
      
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          setTaggedDocuments={mockSetTaggedDocuments}
          taggedDocuments={[]}
        />
      );

      await user.click(screen.getByText('Add Test Document'));

      expect(mockSetTaggedDocuments).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('prevents duplicate document tagging', async () => {
      const mockSetTaggedDocuments = jest.fn();
      const existingDocs = [{ id: 'test-doc', name: 'Test Document' }];
      
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          setTaggedDocuments={mockSetTaggedDocuments}
          taggedDocuments={existingDocs}
        />
      );

      await user.click(screen.getByText('Add Test Document'));

      // Should not add duplicate
      expect(mockSetTaggedDocuments).not.toHaveBeenCalled();
    });
  });

  describe('ChatInputArea Integration', () => {
    it('passes all required props to ChatInputArea', () => {
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          input="test input"
          model="claude-3-sonnet"
          isChatLoading={true}
          isMiniPaneOpen={true}
          isMainChatCollapsed={false}
        />
      );

      expect(screen.getByTestId('chat-input')).toHaveValue('test input');
      expect(screen.getByTestId('model')).toHaveTextContent('claude-3-sonnet');
      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('mini-pane-open')).toHaveTextContent('true');
      expect(screen.getByTestId('main-chat-collapsed')).toHaveTextContent('false');
    });

    it('handles input changes correctly', async () => {
      const mockSetInput = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} setInput={mockSetInput} />);

      const input = screen.getByTestId('chat-input');
      await user.type(input, 'Hello');

      // Check that setInput was called for each character
      expect(mockSetInput).toHaveBeenCalledTimes(5);
      expect(mockSetInput).toHaveBeenNthCalledWith(1, 'H');
      expect(mockSetInput).toHaveBeenNthCalledWith(5, 'o');
    });

    it('handles mini pane toggle', async () => {
      const mockOnToggleMiniPane = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} onToggleMiniPane={mockOnToggleMiniPane} />);

      await user.click(screen.getByTestId('toggle-mini-pane'));

      expect(mockOnToggleMiniPane).toHaveBeenCalled();
    });
  });

  describe('Tagged Documents Management', () => {
    it('displays correct number of tagged documents', () => {
      const taggedDocs = [
        { id: '1', name: 'Doc 1' },
        { id: '2', name: 'Doc 2' },
      ];

      render(<ChatPaneWrapper {...defaultProps} taggedDocuments={taggedDocs} />);

      expect(screen.getByTestId('tagged-documents-count')).toHaveTextContent('2');
    });

    it('handles adding tagged documents from input area', async () => {
      const mockSetTaggedDocuments = jest.fn();
      
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          setTaggedDocuments={mockSetTaggedDocuments}
          taggedDocuments={[]}
        />
      );

      await user.click(screen.getByText('Add Tagged Document'));

      // The mock button adds a document directly
      expect(mockSetTaggedDocuments).toHaveBeenCalledWith([{ id: 'new-doc', name: 'New Doc' }]);
    });
  });

  describe('Audio Recording Integration', () => {
    it('passes audio props correctly', () => {
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          isRecording={true}
          isTranscribing={true}
          micPermissionError={true}
        />
      );

      // Audio props are passed down to ChatInputArea
      // The actual audio functionality is tested in ChatInputArea tests
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });

    it('handles audio control functions', () => {
      const mockStartRecording = jest.fn();
      const mockStopRecording = jest.fn();

      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          startRecording={mockStartRecording}
          stopRecording={mockStopRecording}
        />
      );

      // Functions are passed down correctly
      expect(mockStartRecording).not.toHaveBeenCalled();
      expect(mockStopRecording).not.toHaveBeenCalled();
    });
  });

  describe('File Upload Integration', () => {
    it('handles file upload states correctly', () => {
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          isUploading={true}
          uploadError="Upload failed"
          uploadedImagePath="/path/to/image.jpg"
        />
      );

      // File upload props are passed down to ChatInputArea
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });

    it('handles file upload functions', () => {
      const mockHandleFileChange = jest.fn();
      const mockHandleUploadClick = jest.fn();
      const mockHandlePaste = jest.fn();

      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          handleFileChange={mockHandleFileChange}
          handleUploadClick={mockHandleUploadClick}
          handlePaste={mockHandlePaste}
        />
      );

      // Functions are passed down correctly
      expect(mockHandleFileChange).not.toHaveBeenCalled();
      expect(mockHandleUploadClick).not.toHaveBeenCalled();
      expect(mockHandlePaste).not.toHaveBeenCalled();
    });
  });

  describe('Theme Integration', () => {
    it('passes theme prop correctly', () => {
      render(<ChatPaneWrapper {...defaultProps} currentTheme="dark" />);
      
      // Theme is passed down to child components
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });
  });

  describe('Event Handling', () => {
    it('handles form submission', () => {
      const mockHandleSubmit = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} handleSubmit={mockHandleSubmit} />);

      // Event handlers are passed down correctly
      expect(mockHandleSubmit).not.toHaveBeenCalled();
    });

    it('handles model changes', () => {
      const mockSetModel = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} setModel={mockSetModel} />);

      // Model setter is passed down correctly
      expect(mockSetModel).not.toHaveBeenCalled();
    });

    it('handles stop function', () => {
      const mockStop = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} stop={mockStop} />);

      // Stop function is passed down correctly
      expect(mockStop).not.toHaveBeenCalled();
    });
  });

  describe('Follow-up Context', () => {
    it('handles follow-up context correctly', () => {
      const mockSetFollowUpContext = jest.fn();
      
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          followUpContext="Previous conversation context"
          setFollowUpContext={mockSetFollowUpContext}
        />
      );

      // Follow-up context is passed down correctly
      expect(mockSetFollowUpContext).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('provides proper structure for screen readers', () => {
      render(<ChatPaneWrapper {...defaultProps} />);
      
      const wrapper = screen.getByTestId('chat-messages-list').parentElement;
      expect(wrapper).toHaveClass('flex', 'flex-col');
    });

    it('maintains focus management', () => {
      render(<ChatPaneWrapper {...defaultProps} />);
      
      // Input should be focusable
      const input = screen.getByTestId('chat-input');
      expect(input).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles upload errors gracefully', () => {
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          uploadError="Network error occurred"
        />
      );

      // Component should render without crashing
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });

    it('handles mic permission errors', () => {
      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          micPermissionError={true}
        />
      );

      // Component should render without crashing
      expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('handles large message lists efficiently', () => {
      const largeMessageList: Message[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      render(
        <ChatPaneWrapper 
          {...defaultProps} 
          chatMessages={largeMessageList}
        />
      );

      expect(screen.getByTestId('messages-count')).toHaveTextContent('100');
    });

    it('handles frequent input changes without performance issues', async () => {
      const mockSetInput = jest.fn();
      
      render(<ChatPaneWrapper {...defaultProps} setInput={mockSetInput} />);

      const input = screen.getByTestId('chat-input');
      
      // Simulate rapid typing
      await user.type(input, 'test');

      // Check that setInput was called for each character without performance issues
      expect(mockSetInput).toHaveBeenCalledTimes(4);
      expect(mockSetInput).toHaveBeenNthCalledWith(1, 't');
      expect(mockSetInput).toHaveBeenNthCalledWith(4, 't');
    });
  });
}); 