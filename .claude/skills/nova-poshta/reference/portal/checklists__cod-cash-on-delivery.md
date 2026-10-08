> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/checklists/cod-cash-on-delivery.md).

# COD (cash on delivery)

The checklist helps you independently verify whether COD parameter transmission in the API is configured correctly.

COD / Cash on Delivery is a service that allows payment for goods at the time of shipment delivery. Through the API, this service is added as an additional shipment service within the <mark style="color:green;">`services`</mark> block using <mark style="color:$success;">`serviceCode: "COD"`</mark><mark style="color:$success;">.</mark>

Before starting the integration, it is necessary to sign an agreement with NovaPost for using the COD service.\\

#### To use the service, the following required fields must be completed:

<table><thead><tr><th width="192.39996337890625">Field name</th><th>Description</th></tr></thead><tbody><tr><td>serviceCode</td><td>Service code indicating that the shipment includes the Cash on Delivery service.<br>Always <code>"COD"</code> for this payment type.</td></tr><tr><td>amount</td><td><p>The total amount that the recipient must pay within the COD service. It is specified twice:</p><ul><li>in the <code>services</code> block — as the total COD amount;</li><li>in the <code>bankAccount</code> block — as the amount to be transferred to the account.</li></ul></td></tr><tr><td>contractNumber</td><td>If multiple contracts exist, the required one must be specified.</td></tr><tr><td>payerType</td><td>Defines the payer of the service; in this example, it is the recipient.</td></tr><tr><td>currencyCode</td><td>Transaction currency. It is determined according to the sender's contract.</td></tr><tr><td>bankAccountId</td><td>Tax identification number or equivalent identifier (EDRPOU, TIN, NIP, IČO).<br>The value corresponds to the sender company's <code>companyTin</code> field.</td></tr><tr><td>bankAccountName</td><td>IBAN</td></tr><tr><td>commissionPayer</td><td>Defines the COD commission payer: Recipient / Sender.</td></tr></tbody></table>

#### Example:

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
GET https://api-portal.novapost.com/checklists/cod-cash-on-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
