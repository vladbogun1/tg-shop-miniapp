package com.example.tgshop.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateTagRequest(@NotBlank String name) {}
