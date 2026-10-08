> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/changes-to-the-delivery-cost-calculator-in-europe.md).

# Changes to the Delivery Cost Calculator in Europe

Due to customs legislation requirements, the calculation of customs duties is changing for certain European countries (countries where Nova Post operates) for shipments from Ukraine:

* Austria
* Belgium
* United Kingdom
* Estonia
* Spain
* Italy
* Latvia
* Lithuania
* Netherlands
* Germany
* Poland
* Romania
* Slovakia
* Hungary
* France
* Czech Republic

For the specified countries, customs duties are calculated taking into account unique UCGFEA (HS codes) in the invoice, the export reason, the VAT rate for the recipient's country, and whether the sender has an IOSS code (a special electronic identifier and system in the EU that allows VAT to be paid when selling and importing goods worth up to EUR 150 directly through a marketplace). The customs duty also depends on whether the recipient is an individual or a legal entity.

**How does it work?**

For the correct calculation of customs duties in cases where the client wants to pay the customs duties themselves (as the sender or as a third party), the client passes the invoice item data in the request body to the calculator, specifies the reason, and adds the IOSS code in the sender information block — in the same way as when creating an MEN.

**Request**

**POST** `v.1.0/shipments/calculations`

**Previous behavior**

```
{
  "payerType": "ThirdPerson",
  "payerContractNumber": "1111111",
  "deliveryTypes": [
    "standard"
  ],
  "invoice": {
    "incoterm": "DDP",
    "currency": "EUR",
    "payerFeesCustoms": "Sender",
    "cost": 100
  },
  "parcels": [
    {
      "cargoCategory": "parcel",
      "insuranceCost": 100,
      "rowNumber": 1,
      "width": 500,
      "length": 500,
      "height": 500,
      "actualWeight": 1000,
      "volumetricWeight": 25000
    }
  ],
  "sender": {
    "countryCode": "UA",
    "divisionId": 4438,
    "divisionNumber": "-"
  },
  "recipient": {
    "countryCode": "CZ",
    "divisionId": 1834946,
    "addressParts": {}
  }
}
```

**New behavior**

```
{
  "payerType": "ThirdPerson",
  "payerContractNumber": "1111111",
  "deliveryTypes": [
    "standard"
  ],
  "invoice": {
    "incoterm": "DDP",
    "currency": "EUR",
    "payerFeesCustoms": "ThirdPerson",
    "cost": 125,
     // new fields that affect the calculation//
    "exportReason": "Selling", 
    "items": [
            {
                "hsCode": "4411149200",
                "amount": 5,
                "cost": 25
            }
      ]
    // ---- //
  },
  "parcels": [
    {
      "cargoCategory": "parcel",
      "insuranceCost": 125,
      "rowNumber": 1,
      "width": 500,
      "length": 500,
      "height": 500,
      "actualWeight": 1000,
      "volumetricWeight": 25000
    }
  ],
  "sender": {
    "companyTin": "11111",
    "countryCode": "UA",
    "divisionId": 4438,
    "divisionNumber": "-",
    "ioss": null // new field that affects the calculation
  },
  "recipient": {
    "companyTin": "111111", // new field that affects the calculation
    "countryCode": "CZ",
    "divisionId": 1834946,
    "addressParts": {}
  }
}
```

**Fields added to the request or affecting the calculation**

<table data-search="false"><thead><tr><th width="232">Field</th><th width="176">Type</th><th>Required</th><th>Possible values / Description</th></tr></thead><tbody><tr><td>exportReason</td><td><code>string · enum</code></td><td>Optional</td><td><p><code>ForPersonalPurposes</code></p><p><code>Selling</code></p><p><code>Repair</code></p><p><code>Return</code></p><p><code>Other</code></p></td></tr><tr><td>payerFeesCustoms</td><td><code>string · enum</code></td><td>Optional</td><td><p><code>Sender</code></p><p><code>Recipient</code></p><p><code>ThirdPerson</code></p></td></tr><tr><td>invoice.items</td><td><code>array[object]</code></td><td>Optional</td><td>List of invoice items to be declared</td></tr><tr><td>invoice.items[].hsCode</td><td><code>string</code></td><td>Yes*</td><td>UCGFEA code or HS code for Europe</td></tr><tr><td>invoice.items[].amount</td><td><code>number</code></td><td>Yes*</td><td>Number of units of the invoice item</td></tr><tr><td>invoice.items[].cost</td><td><code>number</code></td><td>Yes*</td><td>Cost per item in the invoice currency</td></tr><tr><td>sender.ioss</td><td><code>string · max: 12</code></td><td>Optional</td><td>Sender's IOSS code</td></tr><tr><td>recipient.companyTin</td><td><code>string · max: 20</code></td><td>Optional</td><td>National company registration number</td></tr></tbody></table>

General contract description: [Розрахунок вартості доставки | API Docs | NovaPost](https://api-portal.novapost.com/methods/ua/overview/shipments/delivery-cost)

Please note that failure to provide data on the codes or a value for the `exportReason` field may result in an incorrect calculation that differs from the actual calculation after the MEN is created.

Customs duties in the response are separated into the following fields:

* `recipientPayerFeesCustomsCost` - The value of this field shows the amount of customs duties that the recipient will have to pay if they are selected as the payer of customs duties.
* `senderPayerFeesCustomsCost` - The value of this field shows the amount of customs duties that the sender (third party) will pay if they are selected as the payer of customs duties.

These fields allow the sender or third party to compare the amounts of customs duties depending on who is selected as the payer of customs duties. The service cost is returned in the currency of the country from which the parcel is sent.

The total delivery cost excluding customs duties and including personal discounts is displayed in the `cost` field.

The total delivery cost including customs duties and excluding discounts is displayed in the `price` field.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/changes-to-the-delivery-cost-calculator-in-europe.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
