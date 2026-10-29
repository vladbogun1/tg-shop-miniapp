"use client";

/** «Скачать CSV» со списком ждущих (по поставке или по товару/варианту). */
import { useState } from "react";
import { Download } from "lucide-react";
import { downloadSubscribersCsv } from "@/lib/preorders";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";

export function CsvButton({ scope }: { scope: Parameters<typeof downloadSubscribersCsv>[0] }) {
  const { push } = useToast();
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
          push(e instanceof Error ? e.message : "Не удалось скачать CSV", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      CSV
    </Button>
  );
}
