import { useContext } from 'react';
import { HoverKitContext } from '../components/provider.js';

export function useHoverKit() {
  const context = useContext(HoverKitContext);
  
  if (!context) {
    throw new Error('useHoverKit must be used within a HoverKitProvider');
  }
  
  return context;
}

export function useHoverKitOptional() {
  return useContext(HoverKitContext);
}
