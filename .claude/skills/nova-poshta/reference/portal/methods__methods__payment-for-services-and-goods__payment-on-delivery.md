> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/payment-for-services-and-goods/payment-on-delivery.md).

# Payment on Delivery

The Cash on Delivery (COD) service allows the recipient to pay for the goods directly upon receiving them, without the need for prepayment. The sender can add this service to the shipment, and the recipient has the option to pay upon delivery, taking into account the payment method restrictions set for specific countries.

{% hint style="warning" %}

### Geographical Restrictions

International directions:

* Poland, Czech Republic, Germany, Slovakia → Ukraine
* Romania → Moldova\*\
  \* In testing mode

Domestic shipments within these countries:

* Czech Republic, Poland, Germany

The service is planned to expand to other countries and delivery directions in the future, both for international shipments and within European countries.
{% endhint %}

#### Available Payment Methods:

* **Poland, Czech Republic, Germany → Ukraine:** only online via the Nova Post mobile app or via the link
* **Local shipments within the Czech Republic, Poland, and Germany:** only online via the app
* **From Romania to Moldova\*:** Cash, card, or bank transfer, and online via the Nova Post mobile app.<br>

#### Key Features of the Cash on Delivery (COD) Service:

* The recipient pays for the parcel upon receipt and has the option to inspect the goods before making the payment.
* The sender can set the payment parameters for the COD service.\
  \
  Payment parameters include the choice of currency, as specified in the contract, automatic conversion, and the party responsible for covering the COD service fee.

#### The payer of the service fee is specified in the contract for all parcels:

* Sender
* Recipient

#### Integration of Cash on Delivery (COD) Service via API

To integrate the COD service through the API, you need to use the "services" block, which contains information about the additional services for the shipment. Below is an example of the settings for COD.

<details>

<summary>Example</summary>

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

</details>

#### Description of Fields in the Services Block

* <mark style="color:$success;">serviceCode: "COD"</mark> — the code indicating the Cash on Delivery (COD) service.
* <mark style="color:$success;">amount</mark> — the total amount the recipient must pay under the COD service.
* <mark style="color:$success;">payerType: "Recipient"</mark> — defines the payer for the service; in this case, it's the recipient.
* <mark style="color:$success;">additionalParameters</mark> — additional parameters for configuring COD:
  * <mark style="color:$success;">bankAccount.amount</mark> — the amount that will be transferred to the sender’s account after payment.
  * <mark style="color:$success;">bankAccount.currencyCode</mark> — the currency for the transaction, defined by the sender’s contract.
  * <mark style="color:$success;">bankAccount.bankAccountId</mark> and <mark style="color:$success;">bankAccount.bankAccountName</mark> — unique identifiers of the account and its name where the transfer will be made.
  * <mark style="color:$success;">bankAccount.commissionPayer</mark> — specifies the recipient as the payer of the service commission.

#### **Parameter Logic**

* <mark style="color:$success;">Amount:</mark> Specifies the amount the recipient must pay upon receipt. Automatic currency conversion is possible depending on the sender's or recipient's country.
* <mark style="color:$success;">Currency:</mark> By default, the currency of the sender’s country is used, but it is possible to set the currency manually\*.

#### **Advantages and Limitations**

* **Currency is defined by the contract**

The typical setup is to use the sender’s country currency, but the recipient’s currency can be specified, provided it is included in the contract.

* **Manual correction**

If you want to avoid automatic conversion, the API allows you to specify the recipient’s currency manually.\*

* **Flexible payment parameters**

The API allows configuring payment parameters, including selecting the payment method and setting the amount.

* **Shipment blocking**

The shipment release is blocked until payment is made, but the recipient can inspect the goods before making the payment.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/payment-for-services-and-goods/payment-on-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
