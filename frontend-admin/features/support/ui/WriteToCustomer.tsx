"use client";

import { useRouter } from "next/navigation";
import type { UserCardDto } from "@/features/customer";
import { StartThreadModal } from "./StartThreadModal";

/** «Написать» из профиля клиента: окно нового вопроса с подставленным клиентом, затем — в «Поддержку» на этот вопрос. */
export function WriteToCustomer({ user, onClose }: { user: UserCardDto | null; onClose: () => void }) {
  const router = useRouter();
  return (
    <StartThreadModal
      open={!!user}
      initialUser={user}
      onClose={onClose}
      onStarted={(t) => {
        onClose();
        router.push(`/support?thread=${encodeURIComponent(t.id)}`);
      }}
    />
  );
}
