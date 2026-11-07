package com.maxsolch.shop.ai.domain;

/** One field of an object before and after an application of an AI result; null means «empty». */
public record FieldChange(String before, String after) {
}
