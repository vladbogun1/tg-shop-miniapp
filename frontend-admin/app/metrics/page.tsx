"use client";

import { Suspense } from "react";
import { MetricsScreen } from "@/features/analytics";

export default function MetricsPage() {
  return (
    <Suspense>
      <MetricsScreen />
    </Suspense>
  );
}
