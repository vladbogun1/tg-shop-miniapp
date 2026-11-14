"use client";

import { useState } from "react";
import { NewOrderModal, OrderDrawer } from "@/features/order";
import { displayName, UsersScreen, type UserCardDto } from "@/features/customer";
import { WriteToCustomer } from "@/features/support";

export default function UsersPage() {
  // «Написать» из профиля: окно поддержки рисует страница (клиенты не импортируют поддержку — был бы цикл).
  const [writeTo, setWriteTo] = useState<UserCardDto | null>(null);
  return (
    <>
      <UsersScreen
        renderOrderDrawer={(orderId, onClose) => <OrderDrawer orderId={orderId} onClose={onClose} />}
        renderNewOrder={({ open, user, onClose, onCreated }) => (
          <NewOrderModal
            open={open}
            from={user ? { tgId: user.telegramUserId, name: displayName(user) } : null}
            onClose={onClose}
            onCreated={onCreated}
          />
        )}
        onWrite={setWriteTo}
      />
      <WriteToCustomer user={writeTo} onClose={() => setWriteTo(null)} />
    </>
  );
}
