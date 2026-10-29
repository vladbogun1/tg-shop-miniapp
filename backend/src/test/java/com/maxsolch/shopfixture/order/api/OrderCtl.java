package com.maxsolch.shopfixture.order.api;

import com.maxsolch.shopfixture.order.infra.OrderRepo;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderCtl {
    OrderRepo repo = new OrderRepo();
}
