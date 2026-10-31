import { useEffect, useRef } from "react";

/**
 * Ссылка на самое свежее значение: эффект читает `latest.current`, а в deps ставит только стабильный `latest`
 * (docs/ARCHITECTURE-FRONT.md, 2.5). Нужна, когда эффект должен сработать один раз по своему триггеру,
 * но пользоваться актуальными функциями/объектами рендера. Обновление — в эффекте, объявленном раньше
 * потребителя, поэтому к его запуску значение уже от текущего рендера.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
