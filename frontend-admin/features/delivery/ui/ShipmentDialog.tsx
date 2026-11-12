"use client";

/** Окно «Створити / Редагувати / Пересоздать ТТН», подгружается по первому открытию (живой предпросмотр тяжёлый). */
import dynamic from "next/dynamic";

export const ShipmentDialog = dynamic(() => import("./shipment/ShipmentModal").then((m) => m.ShipmentModal), { ssr: false });
