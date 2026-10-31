"use client";

/**
 * Состояние ленты чата: засев страницей истории, дозаписи из ws/ответа POST, «показать раньше» с сохранением
 * позиции прокрутки, автопрокрутка вниз на новое сообщение, группы по дням. Общий для чата заказа и поддержки
 * в обоих приложениях. Подключение ws, отметка «прочитано» и композер остаются у экранов: там различия
 * (когда стартует сокет, что делать при обрыве, чем инвалидировать).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { freshOlder, groupByDay, hasMoreHistory, indexById, markSeen, type ChatItem } from "./model";

export function useThread<M extends ChatItem>(opts: {
  /** Самая свежая страница истории (undefined — ещё грузится). */
  history: M[] | undefined;
  /** Страница перед сообщением с этим id. */
  fetchOlder: (beforeId: number) => Promise<M[]>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Подпись дня; ссылка должна быть стабильной, иначе группы пересчитываются на каждый рендер. */
  dayLabel: (iso: string) => string;
  /** Вызывается один раз на каждое НОВОЕ дозаписанное сообщение (не на историю). */
  onAppend?: (m: M) => void;
  /** Ошибка «показать раньше» глотается (кнопка остаётся, можно повторить) — иначе уходит наружу. */
  swallowLoadErrors?: boolean;
}) {
  const { history, fetchOlder, scrollRef, dayLabel, swallowLoadErrors } = opts;
  const onAppend = useRef(opts.onAppend);
  useEffect(() => {
    onAppend.current = opts.onAppend;
  });
  const [messages, setMessages] = useState<M[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!history) return;
    seen.current = new Set(history.map((m) => m.id));
    setMessages(history);
    setHasMore(hasMoreHistory(history.length));
  }, [history]);

  const appendMessage = useCallback((m: M) => {
    if (!markSeen(seen.current, m.id)) return;
    setMessages((prev) => [...prev, m]);
    onAppend.current?.(m);
  }, []);

  // Прокрутка вниз только на новые сообщения, не когда спереди дописали старые: значение «грузим старые»
  // читаем из ссылки, чтобы его смена сама не запускала прокрутку.
  const loadingRef = useRef(false);
  useEffect(() => {
    loadingRef.current = loadingEarlier;
  });
  const count = messages.length;
  useEffect(() => {
    if (loadingRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, scrollRef]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const older = await fetchOlder(oldest.id);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      const fresh = freshOlder(older, seen.current);
      // Позиция чтения не прыгает: сдвигаем прокрутку на высоту дописанного.
      const el = scrollRef.current;
      const before = el?.scrollHeight ?? 0;
      setMessages((prev) => [...fresh, ...prev]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before;
      });
      setHasMore(hasMoreHistory(older.length));
    } catch (e) {
      if (!swallowLoadErrors) throw e;
    } finally {
      setLoadingEarlier(false);
    }
  }

  const byId = useMemo(() => indexById(messages), [messages]);
  const days = useMemo(() => groupByDay(messages, dayLabel), [messages, dayLabel]);

  return { messages, appendMessage, hasMore, loadingEarlier, loadEarlier, byId, days };
}
