import { useLayoutEffect, useRef, type MutableRefObject } from "react";

/**
 * Ref с актуальным значением последнего рендера: эффект с узким списком зависимостей читает из него
 * «текущее» (шаблон, заказ, обработчик), не перезапускаясь при каждом его обновлении — например,
 * сброс формы только при открытии, а не при фоновом обновлении заказа.
 * Пишем в layout-эффекте (не во время рендера), поэтому хук нужно вызывать РАНЬШЕ эффектов, которые из него читают.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
