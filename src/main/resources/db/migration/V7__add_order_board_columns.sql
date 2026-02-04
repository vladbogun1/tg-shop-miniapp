ALTER TABLE orders
  ADD COLUMN admin_board_chat_id BIGINT NULL,
  ADD COLUMN admin_board_thread_id INT NULL,
  ADD COLUMN admin_board_message_id INT NULL;
