CREATE TABLE order_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BINARY(16) NOT NULL,
  direction VARCHAR(32) NOT NULL,
  sender_name VARCHAR(255) NULL,
  sender_id BIGINT NULL,
  message_type VARCHAR(32) NOT NULL,
  text VARCHAR(8192) NULL,
  file_id VARCHAR(512) NULL,
  file_name VARCHAR(512) NULL,
  mime_type VARCHAR(128) NULL,
  tg_message_id INT NULL,
  tg_reply_to_message_id INT NULL,
  tg_thread_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_messages_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
