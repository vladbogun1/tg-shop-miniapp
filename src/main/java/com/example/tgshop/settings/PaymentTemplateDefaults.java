package com.example.tgshop.settings;

public final class PaymentTemplateDefaults {

  public static final String PAYMENT_TEMPLATE_KEY = "PAYMENT_TEMPLATE_HTML";

  private PaymentTemplateDefaults() {}

  public static String defaultTemplate() {
    return """
        <b>Оплата заказа</b>

        Пожалуйста, выберите удобный вариант оплаты:

        <blockquote>
        <b>1.</b> Предоплата <b>100 грн</b> — страховка доставки + наложенный платёж.
        <b>2.</b> Полная оплата на ФОП.
        </blockquote>

        <b>Реквизиты для оплаты (ФОП ПриватБанк)</b>

        Карта: <code>4246001040134680</code>
        IBAN: <code>UA663052990000026005025918119</code>
        Получатель: <b>СОЛОХА МАКСИМ АНДРІЙОВИЧ</b>
        РНОКПП/ЄДРПОУ: <code>3547612413</code>
        Назначение платежа: <i>оплата за услугу / товар</i>

        После оплаты, пожалуйста, отправьте подтверждение в ответ на это сообщение.
        """;
  }
}
