"use client";

import { Check, Clock, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { SNOOZE_OPTIONS, type InboxItem, type SnoozePreset } from "../model/types";
import { primaryOf } from "./group-style";
import { SnoozeMenu } from "./SnoozeMenu";

/**
 * The row's main action: orange TINT (accent-soft + orange hairline + orange text), not solid —
 * a list of rows would otherwise be a column of solid-orange buttons (v3: one solid CTA per view).
 */
const SOFT_ACCENT = "!border-[rgba(255,102,0,.45)] !bg-[var(--accent-soft)] !text-[var(--accent-hi)] hover:!border-[var(--accent)] hover:!bg-[var(--accent-soft-2)]";

export interface RowActionsProps {
  item: InboxItem;
  dismissible: boolean;
  /** The main action is running (site rebuild). */
  busy?: boolean;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}

/** Desktop: actions inline on the right, «Отложить ▾» opens a small menu. */
export function DesktopActions({ item, dismissible, busy, onPrimary, onSnooze, onDismiss }: RowActionsProps) {
  const primary = primaryOf(item);
  const PrimaryIcon = primary.icon;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="surface"
        size="md"
        className={SOFT_ACCENT}
        loading={busy}
        icon={<PrimaryIcon className="h-4 w-4" />}
        onClick={() => onPrimary(item)}
      >
        {primary.label}
      </Button>
      <SnoozeMenu onPick={(p) => onSnooze(item, p)} />
      {dismissible && (
        <Button variant="outline" size="md" icon={<Check className="h-4 w-4" />} onClick={() => onDismiss(item)}>
          Разобрано
        </Button>
      )}
    </div>
  );
}

/** Phone: the main action full width + «⋯» (bottom sheet with the snooze options) — 44 px targets. */
export function PhoneActions({ item, dismissible, busy, onPrimary, onSnooze, onDismiss }: RowActionsProps) {
  const [sheet, setSheet] = useState(false);
  const primary = primaryOf(item);
  const PrimaryIcon = primary.icon;

  const sheetActions: SheetAction[] = [
    ...SNOOZE_OPTIONS.map((o) => ({
      key: o.value,
      label: `Отложить: ${o.label.toLowerCase()}`,
      icon: <Clock className="h-4 w-4" />,
      onSelect: () => {
        setSheet(false);
        onSnooze(item, o.value);
      },
    })),
    ...(dismissible
      ? [
          {
            key: "dismiss",
            label: "Разобрано",
            icon: <Check className="h-4 w-4" />,
            onSelect: () => {
              setSheet(false);
              onDismiss(item);
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex items-stretch gap-2">
      <Button
        variant="surface"
        size="lg"
        className={cn("min-w-0 flex-1", SOFT_ACCENT)}
        loading={busy}
        icon={<PrimaryIcon className="h-4 w-4" />}
        onClick={() => onPrimary(item)}
      >
        {primary.label}
      </Button>
      {dismissible && (
        <Button
          variant="outline"
          size="lg"
          className="w-12 shrink-0 px-0"
          aria-label="Разобрано"
          title="Разобрано"
          icon={<Check className="h-5 w-5" />}
          onClick={() => onDismiss(item)}
        />
      )}
      <Button
        variant="outline"
        size="lg"
        className="w-12 shrink-0 px-0"
        aria-label="Отложить"
        title="Отложить"
        icon={<MoreHorizontal className="h-5 w-5" />}
        onClick={() => setSheet(true)}
      />
      <ActionSheet open={sheet} title={item.title} actions={sheetActions} onClose={() => setSheet(false)} />
    </div>
  );
}
