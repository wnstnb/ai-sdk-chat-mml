import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FloatingActionTab } from './FloatingActionTab';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ...jest.requireActual('lucide-react'), // Import and retain default behavior
  MessageCircle: () => <svg data-testid="message-circle-icon" />,
}));

describe('FloatingActionTab', () => {
  const mockOnClick = jest.fn();
  const defaultProps = {
    onClick: mockOnClick,
    isOpen: false,
    ariaLabel: 'Test Action',
  };

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  test('renders correctly with default props', () => {
    render(<FloatingActionTab {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Test Action');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('message-circle-icon')).toBeInTheDocument();
  });

  test('calls onClick when clicked', () => {
    render(<FloatingActionTab {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('calls onClick when Enter key is pressed', () => {
    render(<FloatingActionTab {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter', code: 'Enter' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('calls onClick when Space key is pressed', () => {
    render(<FloatingActionTab {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ', code: 'Space' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('does not call onClick for other keys', () => {
    render(<FloatingActionTab {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'A', code: 'KeyA' });
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  test('sets aria-expanded to true when isOpen is true', () => {
    render(<FloatingActionTab {...defaultProps} isOpen={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  test('uses default aria-label if not provided', () => {
    const { onClick, isOpen } = defaultProps;
    render(<FloatingActionTab onClick={onClick} isOpen={isOpen} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Toggle chat');
  });
}); 