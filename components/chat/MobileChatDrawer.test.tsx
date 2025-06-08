import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MobileChatDrawer } from './MobileChatDrawer';
// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: () => <svg data-testid="x-icon" />,
}));

// Mock react-swipeable
const mockUseSwipeable = jest.fn();
jest.mock('react-swipeable', () => ({
  useSwipeable: (options: any) => mockUseSwipeable(options),
  // We need to allow spreading props onto a div if the mock is used that way
  // For this component, the swipeHandlers are spread on the drawer div.
}));

// Mock focus-trap-react
jest.mock('focus-trap-react', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react'); // Need React for JSX
  const MockFocusTrap = ({ active, children }: { active: boolean; children: React.ReactNode }) =>
    active ? <div data-testid="focus-trap-active">{children}</div> : <>{children}</>;
  MockFocusTrap.displayName = 'MockFocusTrap';
  return MockFocusTrap;
});


const DRAWER_TITLE_ID = 'mobile-chat-drawer-title';

describe('MobileChatDrawer', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    children: <div>Test Content</div>,
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockOnClose.mockClear();
    mockUseSwipeable.mockClear();
    // Setup a default return value for useSwipeable if needed for most tests
    mockUseSwipeable.mockReturnValue({});
  });

  test('renders correctly when open', () => {
    render(<MobileChatDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Close chat drawer')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(<MobileChatDrawer {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', () => {
    render(<MobileChatDrawer {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close chat drawer'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when backdrop is clicked', () => {
    render(<MobileChatDrawer {...defaultProps} />);
    // The backdrop is the first div child of the dialog container
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.firstChild as HTMLElement;
    expect(backdrop).toHaveClass('backdrop'); // from CSS module, actual class name might be hashed
    if (backdrop) {
        fireEvent.click(backdrop);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    }
  });

  test('renders children content', () => {
    render(<MobileChatDrawer {...defaultProps} />);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  describe('Accessibility', () => {
    test('has correct ARIA attributes for dialog', () => {
      render(<MobileChatDrawer {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', DRAWER_TITLE_ID);
      expect(screen.getByText('Chat')).toHaveAttribute('id', DRAWER_TITLE_ID);
    });

    test('calls onClose when Escape key is pressed', () => {
      render(<MobileChatDrawer {...defaultProps} />);
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
    
    test('does not call onClose for other keys', () => {
      render(<MobileChatDrawer {...defaultProps} />);
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('focus trap is active when open', () => {
      render(<MobileChatDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByTestId('focus-trap-active')).toBeInTheDocument();
    });

    test('focus trap is not active when closed (component not rendered)', () => {
      // When isOpen is false, the whole component (including FocusTrap) should not render
      const { queryByTestId } = render(<MobileChatDrawer {...defaultProps} isOpen={false} />);
      expect(queryByTestId('focus-trap-active')).not.toBeInTheDocument();
    });
  });

  describe('Body scroll prevention', () => {
    test('sets body overflow to hidden when open and restores on close', () => {
      const { rerender } = render(<MobileChatDrawer {...defaultProps} isOpen={true} />);
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<MobileChatDrawer {...defaultProps} isOpen={false} />);
      // After closing (component becomes null), the cleanup effect should restore overflow
      // Needs a small delay for the effect cleanup to run
      // For a component that returns null, the cleanup runs immediately.
      // If there was an animation before returning null, we'd need waitFor.
      expect(document.body.style.overflow).toBe('');
    });

    test('restores body overflow on unmount', () => {
      const { unmount } = render(<MobileChatDrawer {...defaultProps} isOpen={true} />);
      expect(document.body.style.overflow).toBe('hidden');
      
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });
  
  describe('Swipe Gestures (useSwipeable configuration)', () => {
    test('useSwipeable is called with onSwipedLeft configured for onClose', () => {
      render(<MobileChatDrawer {...defaultProps} />);
      expect(mockUseSwipeable).toHaveBeenCalled();
      const swipeableOptions = mockUseSwipeable.mock.calls[0][0];
      expect(swipeableOptions.onSwipedLeft).toBe(mockOnClose);
      expect(swipeableOptions.trackMouse).toBe(false);
      expect(swipeableOptions.trackTouch).toBe(true);
      expect(swipeableOptions.delta).toBe(50);
      expect(swipeableOptions.preventScrollOnSwipe).toBe(true);
    });
  });
}); 