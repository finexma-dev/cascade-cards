import React, { type ReactNode } from 'react';

interface HoverKitSlotsProps {
  children: ReactNode;
}

// Slot components for extensibility
export function HoverKitSlots({ children }: HoverKitSlotsProps) {
  return <>{children}</>;
}

interface ActionsSlotProps {
  children: ReactNode;
}

HoverKitSlots.Actions = function ActionsSlot({ children }: ActionsSlotProps) {
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
      {children}
    </div>
  );
};
