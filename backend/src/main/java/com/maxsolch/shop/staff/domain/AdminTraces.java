package com.maxsolch.shop.staff.domain;

/**
 * One kind of trace an admin leaves in a module that stands above {@code staff} (order chats, inbox marks): how many
 * rows carry the admin's id. Declared here and implemented by those modules, so {@code staff} does not depend on
 * them; deleting an admin with any trace is blocked so «who did it» never points at nobody.
 */
public interface AdminTraces {

    /** What is counted, as it reads in the «can't delete» message: «сообщений в чатах заказов». */
    String label();

    long countBy(long adminId);
}
