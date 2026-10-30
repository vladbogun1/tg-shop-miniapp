package com.maxsolch.shopfixture.customer.app;

import com.maxsolch.shopfixture.staff.app.StaffSide;

/** customer and staff share a row and call each other: a cycle (M2, SCC). */
public class CustomerSide {
    StaffSide staff;
}
