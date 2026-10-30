"use client";

import { ActivityTab } from "@/components/journal/ActivityTab";
import { AuditScreen } from "@/features/staff";

export default function Page() {
  return <AuditScreen botTab={<ActivityTab />} />;
}
