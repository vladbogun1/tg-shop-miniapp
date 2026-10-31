"use client";

import { ActivityTab } from "@/features/activity";
import { AuditScreen } from "@/features/staff";

export default function Page() {
  return <AuditScreen botTab={<ActivityTab />} />;
}
