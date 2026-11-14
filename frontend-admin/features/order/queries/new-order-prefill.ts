"use client";

/**
 * С чем открыть «Новый заказ»: пусто, данные заказа (карточка заказа) или последнего заказа покупателя (профиль).
 * Пока нужное грузится — `prefill` null; сбой загрузки не блокирует окно: оно откроется с тем, что известно.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { customerApi } from "@/features/customer";
import { orderKeys } from "../keys";
import { EMPTY_NEW_ORDER } from "../model/new-order";
import { prefillForCustomer, prefillFromOrder, type NewOrderFrom, type NewOrderPrefill } from "../model/new-order-prefill";
import { useOrderQuery } from "./drawer";

const BLANK: NewOrderPrefill = { values: EMPTY_NEW_ORDER, legacyAddress: null };

export function useNewOrderPrefill(from: NewOrderFrom | null | undefined, open: boolean): NewOrderPrefill | null {
  const customer = open && from && "tgId" in from ? from : null;
  const last = useQuery({
    queryKey: orderKeys.lastOrderOf(customer?.tgId ?? null),
    queryFn: async () => (await customerApi.orders(customer!.tgId))[0]?.id ?? null,
    enabled: !!customer,
  });
  const orderId = open && from && "orderId" in from ? from.orderId : (last.data ?? null);
  const order = useOrderQuery(orderId);

  return useMemo(() => {
    if (!from) return BLANK;
    if (order.data) return prefillFromOrder(order.data, customer?.tgId);
    if (order.isError || last.isError || (customer && last.data === null)) {
      return customer ? prefillForCustomer(customer.name, customer.tgId) : BLANK;
    }
    return null;
  }, [from, customer, order.data, order.isError, last.isError, last.data]);
}
