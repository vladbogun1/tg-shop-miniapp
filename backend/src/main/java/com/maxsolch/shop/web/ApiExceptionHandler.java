package com.maxsolch.shop.web;

import com.maxsolch.shop.security.InitDataException;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Turns exceptions into the {timestamp, status, error, message} envelope both frontends parse.
 *
 * <p>Previously only the six custom exceptions were mapped and everything else fell through to
 * Spring's default error page — a 500 with a framework-shaped body the UI could not read, and, on
 * some configurations, a stack trace. Now every failure is mapped, and anything unexpected is
 * logged with a correlation id while the client gets a generic message instead of internals.
 */
@Slf4j
@RestControllerAdvice(basePackages = "com.maxsolch.shop.web.controller")
public class ApiExceptionHandler {

    @ExceptionHandler(InitDataException.class)
    public ResponseEntity<Map<String, Object>> handleInitData(InitDataException ex) {
        return error(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, Object>> handleUnauthorized(UnauthorizedException ex) {
        return error(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NotFoundException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(BadRequestException ex) {
        return error(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String, Object>> handleForbidden(ForbiddenException ex) {
        return error(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    /** Thrown by @PreAuthorize / @RequiredAdmin when the role does not match. */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return error(HttpStatus.FORBIDDEN, "Недостаточно прав");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .orElse("validation failed");
        return error(HttpStatus.BAD_REQUEST, msg);
    }

    /** Violations on @RequestParam / @PathVariable (method-level validation). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(ConstraintViolationException ex) {
        String msg = ex.getConstraintViolations().stream()
                .findFirst()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .orElse("validation failed");
        return error(HttpStatus.BAD_REQUEST, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return error(HttpStatus.BAD_REQUEST, "Некорректное тело запроса");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(
            MissingServletRequestParameterException ex) {
        return error(HttpStatus.BAD_REQUEST, "Отсутствует параметр: " + ex.getParameterName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex) {
        return error(HttpStatus.BAD_REQUEST, "Некорректное значение параметра: " + ex.getName());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "Файл слишком большой — максимум 15 МБ");
    }

    /**
     * Constraint/length violations that reach the DB. The driver message names tables and columns,
     * so it is logged but never returned.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return error(HttpStatus.BAD_REQUEST,
                "Не удалось сохранить: проверьте длину и корректность полей");
    }

    /** Services that throw ResponseStatusException directly (e.g. BroadcastService 409). */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        return error(status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status, ex.getReason());
    }

    /** Anything unforeseen: log with a correlation id, tell the client only that id. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        String errorId = UUID.randomUUID().toString().substring(0, 8);
        log.error("Unhandled exception [{}]", errorId, ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR,
                "Внутренняя ошибка сервера (код " + errorId + ")");
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", message == null ? "" : message));
    }
}
