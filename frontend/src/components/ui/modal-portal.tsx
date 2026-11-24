"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders modals on document.body so position:fixed overlays
 * are never trapped by transformed/overflow ancestors in the app shell.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
