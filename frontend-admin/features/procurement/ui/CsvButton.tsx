"use client";

/** «Скачать CSV» со списком ждущих (по поставке или по товару/варианту). */
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { Download } from "lucide-react";
import { useState } from "react";
import { downloadSubscribersCsv } from "../files";

export function CsvButton({ scope }: { scope: Parameters<typeof downloadSubscribersCsv>[0] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      icon={<Download className="h-4 w-4" />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadSubscribersCsv(scope);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Не удалось скачать CSV");
        } finally {
          setBusy(false);
        }
      }}
    >
      CSV
    </Button>
  );
}
