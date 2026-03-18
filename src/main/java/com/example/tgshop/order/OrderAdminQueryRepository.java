package com.example.tgshop.order;

import java.time.LocalDate;

public interface OrderAdminQueryRepository {

  AdminOrderPageResult findAdminOrdersPage(
      String query,
      String status,
      LocalDate createdFrom,
      LocalDate createdTo,
      String sort,
      int page,
      int size
  );
}
