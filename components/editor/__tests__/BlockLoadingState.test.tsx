import React from 'react';
import { render, screen, act } from '@testing-library/react';
import BlockLoadingState from '../BlockLoadingState'; // Adjust path as necessary
import { useBlockStatus } from '@/lib/hooks/editor/useBlockStatus';
import { BlockStatus } from '@/app/lib/clientChatOperationState';
import { useReducedMotion, motion } from 'framer-motion'; // To mock it and use motion object

// Mock dependencies
jest.mock('@/lib/hooks/editor/useBlockStatus');
jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'), // Import and retain default behavior
  useReducedMotion: jest.fn(), // Mock only useReducedMotion
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, // Simplify AnimatePresence for tests
  motion: {
    div: jest.fn(({ children, ...props }) => <div {...props}>{children}</div>),
  },
}));

const mockUseBlockStatus = useBlockStatus as jest.MockedFunction<typeof useBlockStatus>; 
const mockUseReducedMotion = useReducedMotion as jest.MockedFunction<typeof useReducedMotion>; 

describe('BlockLoadingState', () => {
  const testBlockId = 'test-block-123';
  const childText = 'This is the child content';
  const children = <div>{childText}</div>;

  beforeEach(() => {
    // Reset mocks before each test
    mockUseBlockStatus.mockReset();
    mockUseReducedMotion.mockReset();
    // Default mock implementations
    mockUseReducedMotion.mockReturnValue(false); // Default to animations enabled
    // Clear mock calls for motion.div
    (motion.div as unknown as jest.Mock).mockClear();
  });

  it('should render children when block status is IDLE', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.IDLE);
    render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);
    expect(screen.getByText(childText)).toBeInTheDocument();
    expect(screen.queryByLabelText(`Processing content for block ${testBlockId}`)).not.toBeInTheDocument();
  });

  it('should render children when block status is ERROR', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.ERROR);
    render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);
    expect(screen.getByText(childText)).toBeInTheDocument();
    expect(screen.queryByLabelText(`Processing content for block ${testBlockId}`)).not.toBeInTheDocument();
  });

  it('should render loading overlay when block status is LOADING', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.LOADING);
    render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);

    expect(screen.getByText(childText)).toBeInTheDocument(); // Children are still part of the DOM structure
    expect(screen.getByLabelText(`Processing content for block ${testBlockId}`)).toBeInTheDocument(); // Spinner with label
    expect(screen.getByText('AI processing...')).toBeInTheDocument(); // Default loading text
    
    const overlay = screen.getByText('AI processing...').parentElement;
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveAttribute('aria-busy', 'true');
  });

  it('should render custom loading text when provided and status is LOADING', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.LOADING);
    const customLoadingText = 'Please wait, AI is thinking...';
    render(
      <BlockLoadingState blockId={testBlockId} loadingText={customLoadingText}>
        {children}
      </BlockLoadingState>
    );
    expect(screen.getByText(customLoadingText)).toBeInTheDocument();
  });

  it('should pass animation props correctly when animations are enabled', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.LOADING);
    mockUseReducedMotion.mockReturnValue(false);
    render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);

    // motion.div is the mock function itself due to jest.mock
    const mockMotionDiv = motion.div as unknown as jest.Mock;
    expect(mockMotionDiv.mock.calls.length).toBeGreaterThan(0);
    expect(mockMotionDiv.mock.calls[0][0].transition).toEqual({ duration: 0.2, ease: "easeInOut" });
  });

  it('should use zero duration for animations when reduced motion is preferred', () => {
    mockUseBlockStatus.mockReturnValue(BlockStatus.LOADING);
    mockUseReducedMotion.mockReturnValue(true); // Reduced motion ON
    render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);
    
    const mockMotionDiv = motion.div as unknown as jest.Mock;
    expect(mockMotionDiv.mock.calls.length).toBeGreaterThan(0);
    expect(mockMotionDiv.mock.calls[0][0].transition).toEqual({ duration: 0 });
  });

  // Accessibility tests with jest-axe (requires setup: yarn add -D jest-axe)
  // import { axe, toHaveNoViolations } from 'jest-axe';
  // expect.extend(toHaveNoViolations);
  // 
  // it('should have no a11y violations when loading', async () => {
  //   mockUseBlockStatus.mockReturnValue(BlockStatus.LOADING);
  //   const { container } = render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);
  //   const results = await axe(container);
  //   expect(results).toHaveNoViolations();
  // });
  // 
  // it('should have no a11y violations when idle', async () => {
  //   mockUseBlockStatus.mockReturnValue(BlockStatus.IDLE);
  //   const { container } = render(<BlockLoadingState blockId={testBlockId}>{children}</BlockLoadingState>);
  //   const results = await axe(container);
  //   expect(results).toHaveNoViolations();
  // });
}); 