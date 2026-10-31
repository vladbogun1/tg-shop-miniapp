"use client";

import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { motion } from "framer-motion";
import { FlaskConical, Send, UserRound } from "lucide-react";
import { useState } from "react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Input } from "@/components/ui/Input";
import { riseItem } from "@/lib/motion";
import type { UserCardDto } from "@/features/customer";
import { broadcastApi } from "../api";
import { TEXT_TABS, testBody, testRecipient } from "../model/compose";
import { userLabel } from "../model/draft";
import { useSendBroadcastTest } from "../queries";
import type { Compose } from "./use-compose";

/** Карточка «Тестовая отправка»: себе или выбранному покупателю / по Telegram ID. */
export function TestCard({ c }: { c: Compose }) {
  const [selectedUser, setSelectedUser] = useState<UserCardDto | null>(null);
  const testM = useSendBroadcastTest();
  const testing = testM.isPending ? (testM.variables?.toMe ? "me" : "user") : null;
  const { text, values } = c;

  function sendTest(toMe: boolean) {
    if (!text.trim()) return toast.error("Сначала напишите текст");
    if (c.currentProblems.length) return toast.error(c.currentProblems[0].message);
    let id: number | undefined;
    if (!toMe) {
      const to = testRecipient(values.manualId, selectedUser?.telegramUserId ?? null);
      if (to === null) return toast.error("Выберите получателя в списке или введите его Telegram ID");
      id = to;
    }
    testM.mutate({ body: testBody(text, id, values), toMe });
  }

  return (
    <motion.div variants={riseItem} className="card mt-4 flex flex-col gap-3 p-5">
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <FlaskConical className="h-4 w-4 text-[var(--accent)]" />
        Тестовая отправка
        <span className="font-[family-name:var(--font-body)] text-[11.5px] font-medium normal-case tracking-normal text-[var(--text-faint)]">
          — уходит текст открытой вкладки ({TEXT_TABS.find((t) => t.value === c.editing)?.label})
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="surface" loading={testing === "me"} onClick={() => sendTest(true)} icon={<UserRound className="h-4 w-4" />}>
          Тест себе
        </Button>
        <div className="min-w-[200px] flex-1">
          <Autocomplete<UserCardDto>
            label="или пользователю"
            selectedLabel={selectedUser ? userLabel(selectedUser) : null}
            fetchItems={broadcastApi.searchUsers}
            itemLabel={userLabel}
            itemSubLabel={(u) =>
              (u.username ? "@" + u.username + " · " : "") +
              "#" +
              u.telegramUserId +
              (u.ordersCount ? " · " + u.ordersCount + " зак." : "")
            }
            itemKey={(u) => String(u.telegramUserId)}
            onSelect={(u) => {
              setSelectedUser(u);
              c.setField("manualId", "");
            }}
            onClear={() => setSelectedUser(null)}
          />
        </div>
        <div className="min-w-[140px] flex-1">
          <Input
            label="или Telegram ID"
            value={values.manualId}
            inputMode="numeric"
            onChange={(e) => {
              c.setField("manualId", e.target.value);
              if (e.target.value.trim()) setSelectedUser(null);
            }}
          />
        </div>
        <Button variant="surface" loading={testing === "user"} onClick={() => sendTest(false)} icon={<Send className="h-4 w-4" />}>
          Отправить тест
        </Button>
      </div>
    </motion.div>
  );
}
