import { renderHook, act } from '@testing-library/react';
import { useChatPane } from '../useChatPane'; // Adjust path as necessary

// Helper to mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

// Mock localStorage before all tests
beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
});

// Clear localStorage before each test
beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks(); // Clear any other mocks
});

describe('useChatPane', () => {
  describe('Initialization and Default State', () => {
    it('should initialize with default expanded state (true) and width ("30%") if localStorage is empty', () => {
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.isExpanded).toBe(true);
      expect(result.current.isCollapsed).toBe(false);
      expect(result.current.previousWidth).toBe('30%');
    });

    it('should initialize with mobile pane as "editor" by default', () => {
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.mobileVisiblePane).toBe('editor');
    });
  });

  describe('Loading from localStorage', () => {
    it('should load previously saved expanded state (false) from localStorage', () => {
      window.localStorage.setItem('chatPaneExpandedState', JSON.stringify(false));
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.isExpanded).toBe(false);
    });

    it('should load previously saved width from localStorage', () => {
      window.localStorage.setItem('chatPaneWidth', '500px');
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.previousWidth).toBe('500px');
    });

    it('should fallback to default if chatPaneExpandedState in localStorage is invalid JSON', () => {
      window.localStorage.setItem('chatPaneExpandedState', 'not-json');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.isExpanded).toBe(true); // Default
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading chat pane state from localStorage:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
    
    it('should fallback to default if chatPaneWidth in localStorage is present but results in JSON.parse error (though it should not as it is not parsed)', () => {
      // This test is more conceptual for width as it's not JSON.parsed in the hook
      // If it were, this test would be more direct.
      // For now, it mainly tests that getItem returning null works as expected (covered by default init)
      // and getItem returning a valid string works (covered by loading saved width).
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.previousWidth).toBe('30%');
    });
  });

  describe('Saving to localStorage', () => {
    it('should save expanded state to localStorage when toggleExpanded is called', () => {
      const { result } = renderHook(() => useChatPane({}));
      
      act(() => {
        result.current.toggleExpanded(); // true -> false
      });
      expect(result.current.isExpanded).toBe(false);
      expect(JSON.parse(window.localStorage.getItem('chatPaneExpandedState') || 'null')).toBe(false);

      act(() => {
        result.current.toggleExpanded(); // false -> true
      });
      expect(result.current.isExpanded).toBe(true);
      expect(JSON.parse(window.localStorage.getItem('chatPaneExpandedState') || 'null')).toBe(true);
    });

    it('should save width to localStorage when handleWidthChange is called', () => {
      const { result } = renderHook(() => useChatPane({}));
      
      act(() => {
        result.current.handleWidthChange('45%');
      });
      expect(result.current.previousWidth).toBe('45%');
      expect(window.localStorage.getItem('chatPaneWidth')).toBe('45%');
      
      act(() => {
        result.current.handleWidthChange('600px');
      });
      expect(result.current.previousWidth).toBe('600px');
      expect(window.localStorage.getItem('chatPaneWidth')).toBe('600px');
    });
  });

  describe('Error Handling and localStorage Unavailability', () => {
    let originalLocalStorage: Storage;

    beforeEach(() => {
      originalLocalStorage = window.localStorage;
    });

    afterEach(() => {
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage, // Restore original localStorage
        writable: true,
      });
    });

    it('should use default values and not crash if localStorage.getItem throws an error', () => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          getItem: jest.fn().mockImplementation(() => {
            throw new Error('Simulated localStorage.getItem error');
          }),
          setItem: jest.fn(), // Keep setItem as a mock to avoid further errors
        },
        writable: true,
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const { result } = renderHook(() => useChatPane({}));
      
      expect(result.current.isExpanded).toBe(true); // Default
      expect(result.current.previousWidth).toBe('30%'); // Default
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading chat pane state from localStorage:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should update internal state but not crash if localStorage.setItem throws an error', () => {
       Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          getItem: jest.fn().mockReturnValue(null), // Simulate empty storage initially
          setItem: jest.fn().mockImplementation(() => {
            throw new Error('Simulated localStorage.setItem error (e.g., QuotaExceeded)');
          }),
        },
        writable: true,
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useChatPane({}));
      
      // Test toggleExpanded
      act(() => {
        result.current.toggleExpanded(); // Should go from true to false
      });
      expect(result.current.isExpanded).toBe(false); // Internal state updates
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving chat pane state to localStorage:',
        expect.any(Error)
      );

      // Test handleWidthChange
      act(() => {
        result.current.handleWidthChange('50%');
      });
      expect(result.current.previousWidth).toBe('50%'); // Internal state updates
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving chat pane width to localStorage:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

     it('should operate with default values if localStorage is not available (e.g. null)', () => {
      Object.defineProperty(window, 'localStorage', {
        value: null, // Simulate localStorage being completely unavailable
        writable: true,
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result, rerender } = renderHook(() => useChatPane({}));

      // Initial state
      expect(result.current.isExpanded).toBe(true);
      expect(result.current.previousWidth).toBe('30%');
      
      // Actions should still update internal state but log errors
      act(() => {
        result.current.toggleExpanded();
      });
      expect(result.current.isExpanded).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving chat pane state to localStorage:',
        expect.any(TypeError) // Expect TypeError as it tries to call setItem on null
      );

      act(() => {
        result.current.handleWidthChange('40%');
      });
      expect(result.current.previousWidth).toBe('40%');
       expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving chat pane width to localStorage:',
        expect.any(TypeError) // Expect TypeError
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Mobile Pane Toggle', () => {
    it('should toggle mobileVisiblePane between "editor" and "chat"', () => {
      const { result } = renderHook(() => useChatPane({}));
      expect(result.current.mobileVisiblePane).toBe('editor');
      
      act(() => {
        result.current.toggleMobilePane();
      });
      expect(result.current.mobileVisiblePane).toBe('chat');
      
      act(() => {
        result.current.toggleMobilePane();
      });
      expect(result.current.mobileVisiblePane).toBe('editor');
    });

    it('mobileVisiblePane state should not be persisted to localStorage by default', () => {
      const { result } = renderHook(() => useChatPane({}));
      act(() => {
        result.current.toggleMobilePane(); // editor -> chat
      });
      expect(result.current.mobileVisiblePane).toBe('chat');
      
      // Simulate remount by re-rendering with a new hook instance
      const { result: result2 } = renderHook(() => useChatPane({}));
      expect(result2.current.mobileVisiblePane).toBe('editor'); // Should reset to default
      expect(window.localStorage.getItem('mobileVisiblePane')).toBeNull(); // Ensure it wasn't saved
    });
  });

  // Basic tests for handleTabPointerDown, stableHandleTabPointerMove, stableHandleTabPointerUp
  // These are more complex to test fully without a DOM and actual pointer events,
  // but we can test if they can be called without error.
  describe('Pointer Event Handlers (Basic Call Tests)', () => {
    it('handleTabPointerDown should be callable', () => {
        const { result } = renderHook(() => useChatPane({}));
        const mockPointerEvent = { clientX: 0, isPrimary: true } as React.PointerEvent;
        expect(() => {
            act(() => {
                result.current.handleTabPointerDown(mockPointerEvent);
            });
        }).not.toThrow();
    });
    // Further testing of drag logic would require more involved DOM simulation
    // and potentially a full component rendering test.
  });
}); 