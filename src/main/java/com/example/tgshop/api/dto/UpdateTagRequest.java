package com.example.tgshop.api.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateTagRequest(@NotBlank String name) {}
