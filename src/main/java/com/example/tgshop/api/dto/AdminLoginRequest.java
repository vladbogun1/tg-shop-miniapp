package com.example.tgshop.api.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminLoginRequest(@NotBlank String password) {}
