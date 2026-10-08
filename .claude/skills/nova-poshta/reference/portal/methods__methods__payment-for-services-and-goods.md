> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/payment-for-services-and-goods.md).

# Payment for services and goods

Payment for Delivery Services via Nova Post API

### Payment for Delivery Services via Nova Post API

The Nova Post API allows you to configure both cash and non-cash payments for delivery services. The payment process can be customized for various scenarios, as payment methods support payments made by the sender, the recipient, or a third party.

{% hint style="info" %}
The API supports three main types of payers for delivery services:&#x20;

* sender,&#x20;
* recipient,&#x20;
* third party.
  {% endhint %}

| Payment by the Sender                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <p>The available payment methods depend on the customer's status. If the sender is:</p><ul><li>An individual: Payment can be made online through the app, or in cash or by card when handing over the shipment to Nova Post.</li><li>A business client with a contract with Nova Post: Payment can be made via non-cash payment under the terms of the contract with Nova Post, or in cash/card when handing over the shipment.</li></ul><p>This option is available for all delivery destinations.</p> |

| Payment by the Recipient: The availability of the service depends on the direction of delivery                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <ul><li>From Ukraine → to the country of presence. The recipient pays the cost of delivery online through the application before receiving the parcel or upon receipt of the shipment in cash or by card at the branch.</li><li>From the country of presence → to Ukraine / between countries of presence. Under development.</li></ul> |

| Payment by a Third Party                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <p>The payer is a legal entity that has a contract with Nova Post and the appropriate permissions to pay for services as a third party. This payer is neither the sender nor the recipient.</p><p>The third party can be designated as the payer either by the company creating the shipment on behalf of its clients, or by clients who have an agreement with the legal entity to cover delivery costs. This service is convenient for corporate clients, partners, or marketplaces that want to cover delivery costs for their clients or partners.</p><p>To enable this option, clients must contact their Nova Post manager.</p> |

### Field Descriptions for Configuring the Payment Method

<mark style="color:$success;">**`payerType`**</mark> defines who is responsible for paying for delivery services. Possible values:

* <mark style="color:$success;">`Sender:`</mark> The sender pays for the delivery
* <mark style="color:$success;">`Recipient:`</mark> The recipient pays for the delivery
* <mark style="color:$success;">`ThirdPerson:`</mark> A third party pays for the delivery\
  \
  If this option is selected, the payerContractNumber field must be filled in.

payerContractNumber is mandatory:

* When <mark style="color:$success;">`ThirdPerson`</mark> is selected as the payer type. It must contain the payer's contract number. For clients from Ukraine, it is also acceptable to provide the tax identification number (EDRPOU) instead of the contract number.
* When <mark style="color:$success;">`Sender`</mark> or <mark style="color:$success;">`Recipient`</mark> is selected as the payer type, and a non-cash payment method is used. If this information is not provided, the payment method will automatically default to cash.<br>

Ensure that the entered information is accurate, as it is essential for processing the payment correctly. This will allow you to successfully integrate third-party payments into your API requests and provide flexibility in managing delivery payments.

{% hint style="info" %}
Detailed descriptions of these fields are available on the following page: [API Docs](/methods/methods/shipments.md) → Shipments → Body:&#x20;
{% endhint %}

<figure><img src="https://331292232-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F4kHbNqhgtrlGjZyxZiDa%2Fuploads%2FHFl8DT2lYX3kZE7ieNTp%2Fimage.png?alt=media&amp;token=83473bc0-15e2-4d91-ba57-5e20601706ed" alt=""><figcaption></figcaption></figure>

Steps to access[ the API documentation ](https://api-portal.novapost.com/changelog-1/documentation-eng/)on the documentation portal: Shipment Creation → Shipment → Create documents.

### Examples of Requests

<details>

<summary>Example request for payment by the sender</summary>

```
{
  "status": "ReadyToShip",
  "clientOrder": "1234567890",
  "note": "Documents shipment",
  "payerType": "Sender",               // The payer is the sender
  "payerContractNumber": "123456789",  // The sender’s contract number for non-cash payment
  "invoice": {
    "incoterm": "DAP",
    "currencyCode": "EUR",
    "totalCost": 500.00
  }
}
```

Field descriptions:

* <mark style="color:$success;">payerType: "Sender"</mark> — defines that the payer is the sender.
* <mark style="color:$success;">payerContractNumber</mark> — the sender’s contract number for non-cash payment.
* <mark style="color:$success;">invoice</mark> —  An object that contains invoice details, including incoterm and currency.

</details>

<details>

<summary>Example request for payment by the recipient</summary>

```
{
  "status": "ReadyToShip",
  "clientOrder": "0987654321",
  "note": "Books delivery",
  "payerType": "Recipient",            // The payer is the recipient
  "invoice": {
    "incoterm": "DAP",
    "currencyCode": "USD",
    "totalCost": 300.00
  }
}
```

Field descriptions:

* <mark style="color:$success;">payerType: "Recipient"</mark> — defines that the payer is the recipient.
* <mark style="color:$success;">invoice</mark> — an object that contains invoice details for customs clearance.

</details>

<details>

<summary>Example request for payment by a third party</summary>

```
{
  "status": "ReadyToShip",
  "clientOrder": "1122334455",
  "note": "Electronics shipment",
  "payerType": "ThirdPerson",          // The payer is a third party
  "payerContractNumber": "987654321",  // The contract number of the third party for non-cash payment
  "invoice": {
    "incoterm": "DAP",
    "currencyCode": "EUR",
    "totalCost": 1000.00
  }
}
```

Field descriptions:

* <mark style="color:$success;">payerType: "ThirdPerson"</mark> — defines that the payer is a third party.
* <mark style="color:$success;">payerContractNumber</mark> —  The contract number of the third party who will make the payment.\
  \
  This field is mandatory when "ThirdPerson" is selected as the payer type. It must contain the payer’s contract number. For clients from Ukraine, it is also acceptable to provide the tax identification number (EDRPOU) instead of the contract number.

</details>

{% hint style="info" %}
Details about each parameter and additional capabilities can be found [in the API documentation](https://api.novapost.com/developers/index.html#post-/shipments).&#x20;

Integrate the payment features into your systems and provide a convenient service to your customers.
{% endhint %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/payment-for-services-and-goods.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
