"use client";

import { Suspense } from "react";
import { SupportChatScreen } from "@/features/support";

export default function SupportChatPage() {
  // useSearchParams needs a Suspense boundary, or the whole route bails out of static rendering.
  return (
    <Suspense fallback={null}>
      <SupportChatScreen />
    </Suspense>
  );
}
