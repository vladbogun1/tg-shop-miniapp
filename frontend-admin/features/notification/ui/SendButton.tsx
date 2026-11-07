"use client";

import { Button } from "@shop/ui/admin-button";
import { Send } from "lucide-react";

interface Props {
  count: number;
  /** Пусто — можно слать; иначе причина блокировки. */
  reason: string;
  running: boolean;
  starting: boolean;
  onClick: () => void;
  className?: string;
}

/** «Разослать (N)»: одна кнопка на экран; под ней причина, если она неактивна. */
export function SendButton({ count, reason, running, starting, onClick, className }: Props) {
  return (
    <Button
      variant="accent"
      chamfer
      className={className}
      loading={starting}
      disabled={!!reason}
      title={reason || undefined}
      onClick={onClick}
      icon={<Send className="h-4 w-4" />}
    >
      {running ? "Идёт рассылка…" : `Разослать (${count})`}
    </Button>
  );
}
