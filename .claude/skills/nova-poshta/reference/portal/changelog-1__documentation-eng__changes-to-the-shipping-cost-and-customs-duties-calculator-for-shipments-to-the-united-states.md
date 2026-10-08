> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/changes-to-the-shipping-cost-and-customs-duties-calculator-for-shipments-to-the-united-states.md).

# Changes to the shipping cost and customs duties calculator for shipments to the United States

Changes to the customs duties calculation for shipments from Ukraine to the United States have been introduced at the request of customs authorities. Customs duties are now calculated not based on the total invoice value, but taking into account the UCGFEA (HS codes) of the invoice items, their quantity, and their value.

These changes apply to international shipments where the customs duties payer is the sender or a third party.

**How does it work?**

The client provides invoice item details in the request if they want to receive a calculation not only for the shipping cost but also for customs duties. Customs duties are calculated separately for each code.

**Request**

**POST** `v.1.0/shipments/calculations`

**Applicable route**

Shipments from Ukraine to the United States

**Previous behavior**

```
{
  "payerType": "Sender",
  "deliveryTypes": [
    "standard",
    "express"
  ],
  "invoice": {
    "incoterm": "DDP",
    "currency": "USD",
    "payerFeesCustoms": "Sender",
    "cost": 125
  },
  "parcels": [
    {
      "cargoCategory": "parcel",
      "insuranceCost": 125,
      "rowNumber": 1,
      "width": 500,
      "length": 500,
      "height": 500,
      "actualWeight": 15000,
      "volumetricWeight": 25000
    }
  ],
  "sender": {
    "countryCode": "UA",
    "divisionId": 4438
  },
   "recipient": {
        "countryCode": "US",
        "addressParts": {
            "city": "Tucson",
            "region": "AZ",
            "postCode": "85730-4544",
            "street": "4675 S Harrison Rd Unit 191",
            "building": "1"
        }
    }
}
```

The "economy" tariff is not available for shipments to the United States.

**New behavior**

```
{
  "payerType": "Sender",
  "deliveryTypes": [
    "standard",
    "express"
  ],
  "invoice": {
    "incoterm": "DDP",
    "currency": "USD",
    "payerFeesCustoms": "Sender",
    "cost": 125,
    // new fields //
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
      "actualWeight": 15000,
      "volumetricWeight": 25000
    }
  ],
  "sender": {
    "countryCode": "UA",
    "divisionId": 4438
  },
   "recipient": {
        "countryCode": "US",
        "addressParts": {
            "city": "Tucson",
            "region": "AZ",
            "postCode": "85730-4544",
            "street": "4675 S Harrison Rd Unit 191",
            "building": "1"
        }
    }
}
```

**New request fields**

<table><thead><tr><th width="199">Field</th><th width="128">Type</th><th width="118">Required</th><th width="284">Description</th></tr></thead><tbody><tr><td>invoice.items</td><td>array[object]</td><td>Conditional</td><td>List of invoice items to be declared</td></tr><tr><td>invoice.items[].hsCode</td><td>string</td><td>Yes*</td><td>UCGFEA or HTSUS code for the United States</td></tr><tr><td>invoice.items[].amount</td><td>number</td><td>Yes*</td><td>Quantity of units for the invoice item</td></tr><tr><td>invoice.items[].cost</td><td>number</td><td>Yes*</td><td>Unit value of the invoice item in the invoice currency</td></tr></tbody></table>

General contract description <https://api-portal.novapost.com/methods/methods/shipments/delivery-cost>.

**Response changes**

The following new fields have been added to the response:

* `recipientPayerFeesCustomsCost` - The value of this field indicates the amount of customs duties that the recipient will be required to pay if they are selected as the customs duties payer.
* `senderPayerFeesCustomsCost` - The value of this field indicates the amount of customs duties that the sender (third party) will be required to pay if they are selected as the customs duties payer.

These fields allow the sender or a third party to compare the customs duties amounts depending on who is selected as the customs duties payer. The service cost is returned in the currency of the shipment's origin country.

The total shipping cost excluding customs duties, including personal discounts, is returned in the `cost` field.

The total shipping cost including customs duties, excluding discounts, is returned in the `price` field.

Successful response

```
{
    "scheduledDeliveryDate": null,
    "sender": {
        "countryCode": "UA",
        "settlementId": 115801,
        "divisionId": 4438
    },
    "recipient": {
        "countryCode": "US",
        "settlementId": null,
        "divisionId": null
    },
    "services": [
        {
            "shipmentId": null,
            "shipmentParcelRowNumber": null,
            "serviceId": null,
            "serviceType": null,
            "serviceName": null,
            "serviceCode": null,
            "amount": 1,
            "contractNumber": null,
            "payerType": "Sender",
            "paymentStatus": "NeedPay",
            "divisionId": null,
            "price": 11259,
            "discount": 0,
            "cost": 11220,
            "user": "",
            "shipmentLockVersion": null,
            "additionalParameters": null,
            "currencyCode": "UAH",
            "createdAt": "2026-08-25T13:07:32.551228Z",
            "updatedAt": "0001-01-01T00:00:00.000000Z",
            "deliveryType": "fe0a07b5-a212-11eb-94e4-b8830365bd14",
            "deliveryTypeName": "standard",
            "recipientPayerFeesCustomsCost": 710,
            "senderPayerFeesCustomsCost": 39
        },
        {
            "shipmentId": null,
            "shipmentParcelRowNumber": null,
            "serviceId": null,
            "serviceType": null,
            "serviceName": null,
            "serviceCode": null,
            "amount": 1,
            "contractNumber": null,
            "payerType": "Sender",
            "paymentStatus": "NeedPay",
            "divisionId": null,
            "price": 11259,
            "discount": 0,
            "cost": 11220,
            "user": "",
            "shipmentLockVersion": null,
            "additionalParameters": null,
            "currencyCode": "UAH",
            "createdAt": "2026-08-25T13:07:32.551252Z",
            "updatedAt": "0001-01-01T00:00:00.000000Z",
            "deliveryType": "aebf0991-ec73-11f0-9dff-8c8474c74d21",
            "deliveryTypeName": "express",
            "recipientPayerFeesCustomsCost": 710,
            "senderPayerFeesCustomsCost": 39
        }
    ],
    "messageForFeesCustomsCost": ""
}
```

Error response (invalid HS code).&#x20;

{% hint style="warning" %}
If you provide an invalid code or we are unable to determine the applicable duty rate, you will receive a warning in the `messageForFeesCustomsCost.warning` field. The calculation will be returned without that code. However, before or during shipment creation, the correct UCGFEA (or HTSUS) code must be specified, and the customs duties amount will be recalculated. We recommend verifying the code in advance or contacting support or your account manager to verify or add the code.
{% endhint %}

```
{
    "scheduledDeliveryDate": null,
    "sender": {
        "countryCode": "UA",
        "settlementId": 115801,
        "divisionId": 4438
    },
    "recipient": {
        "countryCode": "US",
        "settlementId": null,
        "divisionId": null
    },
    "services": [
        {
            "shipmentId": null,
            "shipmentParcelRowNumber": null,
            "serviceId": null,
            "serviceType": null,
            "serviceName": null,
            "serviceCode": null,
            "amount": 1,
            "contractNumber": null,
            "payerType": "Sender",
            "paymentStatus": "NeedPay",
            "divisionId": null,
            "price": 11220,
            "discount": 0,
            "cost": 11220,
            "user": "",
            "shipmentLockVersion": null,
            "additionalParameters": null,
            "currencyCode": "UAH",
            "createdAt": "2026-08-25T13:08:13.391287Z",
            "updatedAt": "0001-01-01T00:00:00.000000Z",
            "deliveryType": "fe0a07b5-a212-11eb-94e4-b8830365bd14",
            "deliveryTypeName": "standard",
            "recipientPayerFeesCustomsCost": 671,
            "senderPayerFeesCustomsCost": 0
        },
        {
            "shipmentId": null,
            "shipmentParcelRowNumber": null,
            "serviceId": null,
            "serviceType": null,
            "serviceName": null,
            "serviceCode": null,
            "amount": 1,
            "contractNumber": null,
            "payerType": "Sender",
            "paymentStatus": "NeedPay",
            "divisionId": null,
            "price": 11220,
            "discount": 0,
            "cost": 11220,
            "user": "",
            "shipmentLockVersion": null,
            "additionalParameters": null,
            "currencyCode": "UAH",
            "createdAt": "2026-08-25T13:08:13.391321Z",
            "updatedAt": "0001-01-01T00:00:00.000000Z",
            "deliveryType": "aebf0991-ec73-11f0-9dff-8c8474c74d21",
            "deliveryTypeName": "express",
            "recipientPayerFeesCustomsCost": 671,
            "senderPayerFeesCustomsCost": 0
        }
    ],
    "messageForFeesCustomsCost": [
        {
            "hsCode": "4411100000",
            "warning": "no_ddc_converted"
        }
    ]
}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/changes-to-the-shipping-cost-and-customs-duties-calculator-for-shipments-to-the-united-states.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
