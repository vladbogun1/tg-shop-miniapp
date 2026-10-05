-- Phase C: product reviews + personal bonus promo codes (docs/ORDERS-SUPPORT-REVIEWS.md).
--
--  product_reviews: one review per ordered product line (order_item_id is unique). The order and
--  the line may be deleted later by an admin (closed orders only) — the review stays on the product
--  page, so both links are nullable and ON DELETE SET NULL.
--  author_name is a privacy-friendly snapshot taken when the review is written ("Олена К.").
CREATE TABLE product_reviews (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    product_id     BINARY(16)    NOT NULL,
    order_id       BINARY(16)    NULL,
    order_item_id  BIGINT        NULL,
    user_id        BIGINT        NOT NULL,
    tg_user_id     BIGINT        NULL,
    author_name    VARCHAR(64)   NOT NULL,
    rating         INT           NOT NULL,
    text           VARCHAR(4000) NOT NULL,
    status         ENUM('PENDING','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'PENDING',
    admin_reply    VARCHAR(2000) NULL,
    admin_reply_at TIMESTAMP     NULL,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at   TIMESTAMP     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_product_reviews_item (order_item_id),
    KEY idx_product_reviews_product (product_id, status, published_at),
    KEY idx_product_reviews_user (user_id, created_at),
    KEY idx_product_reviews_status (status, created_at),
    KEY idx_product_reviews_order (order_id),
    CONSTRAINT fk_product_reviews_order FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE SET NULL,
    CONSTRAINT fk_product_reviews_item FOREIGN KEY (order_item_id)
        REFERENCES order_items (id) ON DELETE SET NULL,
    CONSTRAINT ck_product_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rating aggregate on the product row: the catalog DTOs read it for free (no per-card query).
-- Recomputed whenever a review of the product is published, hidden or deleted.
ALTER TABLE products
    ADD COLUMN rating_avg   DECIMAL(3,2) NULL,
    ADD COLUMN rating_count INT          NOT NULL DEFAULT 0;

-- Personal promo codes: owner_user_id = the only customer (telegram user id) allowed to use it,
-- expires_at = last moment it is valid, source = where it came from (REVIEW_BONUS), source_order_id =
-- the order it was issued for. All null for ordinary admin-made codes.
ALTER TABLE promo_codes
    ADD COLUMN owner_user_id   BIGINT      NULL,
    ADD COLUMN expires_at      TIMESTAMP   NULL,
    ADD COLUMN source          VARCHAR(32) NULL,
    ADD COLUMN source_order_id BINARY(16)  NULL,
    ADD KEY idx_promo_codes_owner (owner_user_id);

-- One review bonus per order (set atomically: "... where review_bonus_issued_at is null"), and the
-- "leave a review" reminder is sent at most once per order.
ALTER TABLE orders
    ADD COLUMN review_bonus_issued_at  TIMESTAMP NULL,
    ADD COLUMN review_reminder_sent_at TIMESTAMP NULL;
