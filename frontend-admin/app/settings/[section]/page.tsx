"use client";

import { useParams } from "next/navigation";
import { SettingsSectionScreen } from "@/features/settings";

export default function Page() {
  const { section } = useParams<{ section: string }>();
  return <SettingsSectionScreen key={section} id={section} />;
}
