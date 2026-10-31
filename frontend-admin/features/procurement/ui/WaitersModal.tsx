"use client";

/** «Ждут» по товару (все варианты): живая очередь первой, плюс «Заказать у завода». */
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Factory } from "lucide-react";
import { useRouter } from "next/navigation";
import { QueryState } from "@/components/ui/QueryState";
import { useProductSubscribers } from "../queries";
import { CsvButton } from "./CsvButton";
import { SubscribersList } from "./SubscribersList";

export function WaitersModal({ open, onClose, productId, title }: { open: boolean; onClose: () => void; productId: string; title: string }) {
  const router = useRouter();
  const q = useProductSubscribers(productId, open);
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
