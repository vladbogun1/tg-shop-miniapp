"use client";

/** «Ждут» по товару (все варианты): живая очередь первой, плюс «Заказать у завода». */
import { useQuery } from "@tanstack/react-query";
import { Factory } from "lucide-react";
import { useRouter } from "next/navigation";
import { PREORDERS_KEY, preordersApi } from "@/lib/preorders";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { CsvButton } from "./CsvButton";
import { SubscribersList } from "./SubscribersList";

export function WaitersModal({ open, onClose, productId, title }: { open: boolean; onClose: () => void; productId: string; title: string }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: [...PREORDERS_KEY, "product-subs", productId],
    queryFn: () => preordersApi.productSubscribers(productId),
    enabled: open,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Ждут: ${title}`}
      footer={
        <>
          <CsvButton scope={{ productId }} />
          <Button
            variant="accent"
            icon={<Factory className="h-4 w-4" />}
            onClick={() => {
              onClose();
              router.push(`/preorders?newProduct=${encodeURIComponent(productId)}`);
            }}
          >
            Заказать у завода
          </Button>
        </>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        <SubscribersList subs={q.data ?? []} />
      </QueryState>
    </Modal>
  );
}
