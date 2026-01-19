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
        <br/>
        <b>2.</b> Полная оплата на ФОП.
        </blockquote>

        <b>Реквизиты для оплаты (ФОП ПриватБанк)</b>
        <br/>
        Карта: <code>4246001040134680</code>
        <br/>
        IBAN: <code>UA663052990000026005025918119</code>
        <br/>
        Получатель: <b>СОЛОХА МАКСИМ АНДРІЙОВИЧ</b>
        <br/>
        РНОКПП/ЄДРПОУ: <code>3547612413</code>
        <br/>
        Назначение платежа: <i>оплата за услугу / товар</i>

        <br/><br/>
        После оплаты, пожалуйста, отправьте подтверждение в ответ на это сообщение.
        """;
  }
}
