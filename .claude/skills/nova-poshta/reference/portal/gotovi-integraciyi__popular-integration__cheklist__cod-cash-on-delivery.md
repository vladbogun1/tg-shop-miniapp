> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/cheklist/cod-cash-on-delivery.md).

# COD (cash on delivery)

Чекліст допомагає самостійно перевірити, чи коректно налаштована передача параметрів COD в API.

**COD / Оплата при отриманні** — це послуга, яка дозволяє оплачувати товар під час отримання відправлення. Через API послуга додається як додатковий сервіс до відправлення у блоці <mark style="color:$success;">`services`</mark> з кодом <mark style="color:$success;">`serviceCode: "COD".`</mark>

Перед запуском інтеграції потрібно підписати договір з NovaPost на використання послуги COD.

#### Для використання сервісу треба заповнити наступні обов’язкові поля:

<table><thead><tr><th width="265.800048828125">Назва</th><th>Опис поля</th></tr></thead><tbody><tr><td>serviceCode</td><td><p>Код сервісу, що вказує на наявність послуги «Оплата при отриманні». </p><p>Завжди "COD" для даного типу оплати. </p></td></tr><tr><td>amount</td><td><p>Загальна сума, яку одержувач має сплатити в межах послуги COD.  Зазначається двічі:</p><ul><li>у блоці <code>services</code> — як загальна сума COD;</li><li>у блоці <code>bankAccount</code> — як сума для перерахування на рахунок.</li></ul></td></tr><tr><td>contractNumber</td><td>Якщо існує кілька договорів, необхідно вказати той що потрібно. </td></tr><tr><td>payerType</td><td>Визначає платника послуги, у прикладі це одержувач.</td></tr><tr><td>currencyCode</td><td>Валюта транзакції. Визначається за договором відправника.</td></tr><tr><td>bankAccountId</td><td>Ідентифікаційний податковий номер або еквівалентний ідентифікатор (ЄДРПОУ, ІПН, NIP, IČO). Значення поля CompanyTin відправника юридичної особи. </td></tr><tr><td>bankAccountName</td><td>IBAN</td></tr><tr><td>commissionPayer</td><td>Визначає платника комісії COD: Одержувач/Відправник.</td></tr></tbody></table>

#### Приклад:

```
"services": [
  {
    "shipmentParcelRowNumber": null,
    "serviceCode": "COD",
    "amount": 10,
    "contractNumber": null,
    "payerType": "Recipient",
    "additionalParameters": {
      "cod": {
        "cash": null,
        "card": null,
        "bankAccount": {
          "amount": 10,
          "currencyCode": "PLN",
          "bankAccountId": "1234567890",
          "bankAccountName": "PL12345678901234567890123456",
          "description": "test S",
          "commissionPayer": "Recipient"
        }
      }
    }
  }
]
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/cheklist/cod-cash-on-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
