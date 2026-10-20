import React, { createContext, useContext, useRef } from 'react';

export interface KeyboardContextValue {
  isSpacePressedRef: React.RefObject<boolean>;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export const KeyboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSpacePressedRef = useRef(false);

  return (
    <KeyboardContext.Provider value={{ isSpacePressedRef }}>
      {children}
    </KeyboardContext.Provider>
  );
};

export const useKeyboardContext = (): KeyboardContextValue => {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    // Graceful fallback for test environments or isolated component rendering
    return { isSpacePressedRef: { current: false } };
  }
  return ctx;
};
