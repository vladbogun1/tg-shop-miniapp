"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCart } from "../store";

const Drawer = dynamic(() => import("../ui/CartDrawer").then((m) => m.CartDrawer));

/** The drawer's code (and its motion) is fetched when the cart opens for the first time, not with every page. */
export function CartDrawer() {
  const open = useCart((s) => s.drawerOpen);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (open) setWanted(true);
  }, [open]);
  return wanted ? <Drawer /> : null;
}
