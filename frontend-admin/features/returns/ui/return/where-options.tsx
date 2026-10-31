import type { ReactNode } from "react";
import { Home, Truck, Wallet } from "lucide-react";
import type { ReturnWhere } from "../../model/types";

export interface WhereOption {
  value: ReturnWhere;
  label: string;
  hint: string;
  icon: ReactNode;
}

/** Где может быть товар сейчас: зависит от того, доставлена посылка или ещё на почте. */
export function whereOptions(delivered: boolean, shipped: boolean): WhereOption[] {
  return [
    ...(delivered
      ? [
          {
            value: "POST" as ReturnWhere,
            label: "Едет к нам почтой",
            hint: "Покупатель отправит посылку. Когда придёт — нажмёте «Посылка вернулась».",
            icon: <Truck className="h-4 w-4" />,
          },
        ]
      : shipped
        ? [
            {
              value: "POST" as ReturnWhere,
              label: "Не забрал на почте — едет назад",
              hint: "Покупатель забрал не всё. Отказанное едет к нам, наложка уменьшится на его стоимость. Когда придёт — нажмёте «Посылка вернулась».",
              icon: <Truck className="h-4 w-4" />,
            },
          ]
        : []),
    {
      value: "HERE",
      label: "Уже у нас",
      hint: "Товар у вас в руках — сразу вернётся на склад (или в брак).",
      icon: <Home className="h-4 w-4" />,
    },
    {
      value: "KEPT",
      label: "Остаётся у покупателя",
      hint: "Товар не возвращают — только часть денег (компенсация).",
      icon: <Wallet className="h-4 w-4" />,
    },
  ];
}
