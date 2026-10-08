> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/checklists/non-cash-payment.md).

# Non-cash payment

The checklist helps you independently verify whether the parameters for non-cash payment of delivery services are configured correctly in the API.

**Non-cash payment** is a method of paying delivery charges under the client’s logistics agreement with Nova Post. To use this payment method, the client must have a signed logistics agreement that includes cashless payment terms.

#### **Through the API, cashless payment is configured during shipment creation using two fields:**

| Field name          | Description                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| payerType           | <p>Defines the payer of delivery services. Available values:</p><ul><li>Sender</li><li>Recipient</li><li>ThirdPerson</li></ul> |
| payerContractNumber | Contract number of the payer for non-cash payment.                                                                             |

#### Example:

```

{
 "status": "ReadyToShip",
  "clientOrder": "",
  "note": "",
  "payerType": "Sender",
  "payerContractNumber": "CNPMD-12345678"
  "invoice": null,
  "services": [],
  "parcels": [],
  "sender": {},
  "recipient": {}
}

```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/checklists/non-cash-payment.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
