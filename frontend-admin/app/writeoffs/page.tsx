"use client";

import { WriteoffsScreen } from "@/features/inventory";
import { RestoreWriteoffModal } from "@/features/returns";

export default function WriteoffsPage() {
  return <WriteoffsScreen RestoreWriteoffModal={RestoreWriteoffModal} />;
}
