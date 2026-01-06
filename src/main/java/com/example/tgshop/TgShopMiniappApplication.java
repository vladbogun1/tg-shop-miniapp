package com.example.tgshop;

import com.example.tgshop.tg.ShopBot;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

@SpringBootApplication
public class TgShopMiniappApplication {
  public static void main(String[] args) {
    SpringApplication.run(TgShopMiniappApplication.class, args);
  }
}
