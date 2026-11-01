"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCompare } from "../store";

const Modal = dynamic(() => import("../ui/CompareModal").then((m) => m.CompareModal));

/**
 * Loaded when the comparison opens for the first time — or at once when the page address carries
 * `?compare=…` (the modal itself adds those products and opens).
 */
export function CompareModal() {
  const open = useCompare((s) => s.open);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (open || new URL(window.location.href).searchParams.has("compare")) setWanted(true);
  }, [open]);
  return wanted ? <Modal /> : null;
}
