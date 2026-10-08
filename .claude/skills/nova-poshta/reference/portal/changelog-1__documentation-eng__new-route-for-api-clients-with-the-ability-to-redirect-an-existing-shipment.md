> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/new-route-for-api-clients-with-the-ability-to-redirect-an-existing-shipment.md).

# New Route for API Clients with the Ability to Redirect an Existing Shipment

The method allows you to create a redirect for an existing Nova Post shipment and change its delivery location without creating a new shipment.

Using this method, a shipment can be redirected:

* to a branch;
* to a parcel locker;
* to the recipient’s address.

For the new delivery location, only one addressing method must be used:

* `recipient.divisionId` - for delivery to a branch or parcel locker;
* `recipient.addressParts` - for address delivery.

**Endpoint** `POST /v.1.0/shipments/modification/redirecting`

**Schema (Object)**

<table data-search="false"><thead><tr><th width="285">Field</th><th width="145">Type</th><th width="130">Required</th><th>Description</th></tr></thead><tbody><tr><td><strong>id</strong></td><td>integer | UUID</td><td>yes</td><td>Identifier of the existing shipment for which a redirect must be created. It can be passed as a positive integer or UUID. For a numeric value, the minimum value is 1.</td></tr><tr><td><strong>payerType</strong></td><td>enum</td><td>yes</td><td>Party responsible for paying for the redirect service. Available values: Sender, Recipient, ThirdPerson.</td></tr><tr><td><strong>payerContractNumber</strong></td><td>string | null</td><td>no</td><td>Payer’s contract number.</td></tr><tr><td><strong>customerType</strong></td><td>enum</td><td>no</td><td>Type of customer initiating the redirect. Available values: Recipient, Sender.</td></tr><tr><td><strong>customerPhone</strong></td><td>string | null</td><td>no</td><td>Customer’s contact phone number.</td></tr><tr><td><strong>source</strong></td><td>enum</td><td>no</td><td>Source from which the redirect is created. For API integration, use the value API.</td></tr><tr><td><strong>note</strong></td><td>string | null</td><td>no</td><td>Comment for the redirect.</td></tr><tr><td><strong>recipient</strong></td><td>object</td><td>yes</td><td>Recipient data and the new shipment delivery location.</td></tr><tr><td><strong>recipient.phone</strong></td><td>string</td><td>yes</td><td>Recipient’s contact phone number. The field must be present and contain a valid non-empty value.</td></tr><tr><td><strong>recipient.name</strong></td><td>string</td><td>yes</td><td>Recipient’s name. The field must be present and contain a non-empty value.</td></tr><tr><td><strong>recipient.email</strong></td><td>string | null</td><td>no</td><td>Recipient’s email address.</td></tr><tr><td><strong>recipient.countryCode</strong></td><td>string</td><td>no</td><td>Recipient’s country code. For example: UA, MD.</td></tr><tr><td><strong>recipient.companyTin</strong></td><td>string | null</td><td>no</td><td>Recipient company tax identification number, if applicable.</td></tr><tr><td><strong>recipient.eoriCode</strong></td><td>string | null</td><td>no</td><td>Recipient’s EORI code, if applicable.</td></tr><tr><td><strong>recipient.divisionId</strong></td><td>integer</td><td>conditionally required</td><td>Branch or parcel locker identifier. Required if recipient.addressParts.street is not provided or has an empty value. Minimum value: 1.</td></tr><tr><td><strong>recipient.divisionNumber</strong></td><td>string | null</td><td>no</td><td>Branch or parcel locker number.</td></tr><tr><td><strong>recipient.settlementId</strong></td><td>integer | null</td><td>no</td><td>Settlement identifier.</td></tr><tr><td><strong>recipient.addressParts</strong></td><td>object</td><td>yes</td><td>New delivery address data. The object must be present in the request regardless of the addressing method.</td></tr><tr><td><strong>recipient.addressParts.building</strong></td><td>string</td><td>conditionally required</td><td>Building number. Required for address delivery.</td></tr><tr><td><strong>recipient.addressParts.street</strong></td><td>string</td><td>conditionally required</td><td>Street name. If this field is populated, the address delivery scenario is used.</td></tr><tr><td><strong>recipient.addressParts.city</strong></td><td>string</td><td>conditionally required</td><td>City. For address delivery, the field must be present and contain a non-empty value.</td></tr><tr><td><strong>recipient.addressParts.region</strong></td><td>string</td><td>conditionally required</td><td>Region. For address delivery, the field must be present and contain a non-empty value.</td></tr><tr><td><strong>recipient.addressParts.postCode</strong></td><td>string</td><td>conditionally required</td><td>Postal code. For address delivery, the field must be present and contain a non-empty value.</td></tr></tbody></table>

**Addressing Rules**

Each request must use exactly one addressing method: `recipient.divisionId` or `recipient.addressParts.street` together with the other required address fields.

{% hint style="info" %}
**Important:** Do not provide `recipient.divisionId` and `recipient.addressParts.street` at the same time, and do not leave both values empty.
{% endhint %}

**Redirecting to a Branch or Parcel Locker**

Must be provided:`recipient.divisionId`

If `recipient.addressParts.street` is absent or has an empty value, `recipient.divisionId` is required.

In this scenario, the following address fields do not need to be populated:

* `recipient.addressParts.building`
* `recipient.addressParts.street`
* `recipient.addressParts.city`
* `recipient.addressParts.region`
* `recipient.addressParts.postCode`

However, the `recipient.addressParts` object must still be present in the request.

**Request example**

```
{
  "id": 19859866,
  "payerType": "ThirdPerson",
  "payerContractNumber": "GNPMD-00029299",
  "customerType": "Sender",
  "source": "API",
  "note": null,
  "recipient": {
    "phone": "37123456789",
    "name": "Test Tesov",
    "countryCode": "MD",
    "divisionId": 12345,
    "addressParts": {}
  }
}
```

**Redirecting a Shipment to an Address** `recipient.divisionId` does not need to be provided.

The following fields must be populated:

* `recipient.addressParts.building`
* `recipient.addressParts.street`
* `recipient.addressParts.city`
* `recipient.addressParts.region`
* `recipient.addressParts.postCode`

All of the fields listed above must be present and contain non-empty values.

**Request example**

```
{
  "id": 19859866,
  "payerType": "ThirdPerson",
  "payerContractNumber": "GNPMD-00029299",
  "customerType": "Sender",
  "source": "API",
  "note": null,
  "recipient": {
    "phone": "37123456789",
    "name": "Test Tesov",
    "countryCode": "MD",
    "addressParts": {
      "building": "752",
      "street": "Strada Alba Iulia",
      "city": "Chisinau",
      "region": "Chisinau",
      "postCode": "MD-2071"
    }
  }
}
```

{% hint style="info" %}

**For delivery to a branch or parcel locker:**

* `recipient.divisionId` - provided.
* `recipient.addressParts.street` - not provided.

**For address delivery:**

* `recipient.divisionId` - not provided.
* `recipient.addressParts.street` - provided.
* `recipient.addressParts.building` - provided.
* `recipient.addressParts.city` - provided.
* `recipient.addressParts.region` - provided.
* `recipient.addressParts.postCode` - provided.
  {% endhint %}

Only one addressing method may be used in a single request:

* either `recipient.divisionId` - for delivery to a branch or parcel locker,
* or `recipient.addressParts.street` - together with the other address fields for address delivery.

Do not provide `recipient.divisionId` and `recipient.addressParts.street` at the same time.

If neither of these fields is provided, the request will fail validation.

**Response**

After a redirect is successfully created, the API returns the data of the created Redirecting modification.

```
{
  "id": 9405417,
  "number": "SMUS0000205405",
  "shipmentId": 19859866,
  "shipmentnumber": "SHUS7810637809",
  "type": "Redirecting",
  "status": "NeedProcessing",
  "payerType": "ThirdPerson",
  "customerType": "Sender",
  "note": "",
  "scheduledDeliveryDate": "2026-09-27T07:55:00.000000Z",
  "cost": 3.36,
  "currency": "USD",
  "currencySymbol": "$"
}
```

**Response Fields**

<table data-search="false"><thead><tr><th width="215">Field</th><th width="100">Type</th><th>Description</th></tr></thead><tbody><tr><td><strong>id</strong></td><td>integer</td><td>Identifier of the created redirect.</td></tr><tr><td><strong>number</strong></td><td>string</td><td>Number of the created redirect.</td></tr><tr><td><strong>shipmentId</strong></td><td>integer</td><td>Identifier of the shipment for which the redirect was created.</td></tr><tr><td><strong>shipmentnumber</strong></td><td>string</td><td>Number of the existing Nova Post shipment.</td></tr><tr><td><strong>type</strong></td><td>enum</td><td>Type of the created modification. For this method, Redirecting is returned.</td></tr><tr><td><strong>status</strong></td><td>enum</td><td>Current redirect processing status.</td></tr><tr><td><strong>payerType</strong></td><td>enum</td><td>Party responsible for paying for the redirect service.</td></tr><tr><td><strong>customerType</strong></td><td>enum</td><td>Type of customer that initiated the redirect. Possible values: Recipient, Sender.</td></tr><tr><td><strong>note</strong></td><td>string</td><td>Comment for the redirect.</td></tr><tr><td><strong>scheduledDeliveryDate</strong></td><td>datetime</td><td>Scheduled delivery date and time after the redirect.</td></tr><tr><td><strong>cost</strong></td><td>number</td><td>Cost of the redirect service.</td></tr><tr><td><strong>currency</strong></td><td>string</td><td>Currency code of the service cost. For example: USD.</td></tr><tr><td><strong>currencySymbol</strong></td><td>string</td><td>Currency symbol. For example: $.</td></tr></tbody></table>

{% hint style="info" %}
**Important:** status = NeedProcessing means that the redirect has been created and submitted for further processing.
{% endhint %}

After Redirecting is successfully created, there is no need to create a new shipment. The redirect is applied to the existing shipment.

**Response Statuses**

<table><thead><tr><th width="275">HTTP status</th><th>Descriotion</th></tr></thead><tbody><tr><td><code>200 Successful response</code></td><td><p></p><pre><code>{
  "id": 9405417,
  "number": "SMUS0000205405",
  "shipmentId": 19859866,
  "shipmentnumber": "SHUS7810637809",
  "type": "Redirecting",
  "status": "NeedProcessing",
  "payerType": "ThirdPerson",
  "customerType": "Sender",
  "note": "",
  "scheduledDeliveryDate": "2026-09-27T07:55:00.000000Z",
  "cost": 3.36,
  "currency": "USD",
  "currencySymbol": "$"
}
</code></pre></td></tr><tr><td><code>404 Not Found</code></td><td>The shipment with the specified identifier was not found.</td></tr><tr><td><code>422 Unprocessable Content</code></td><td>The request failed validation, or redirecting cannot be performed for the current shipment.</td></tr></tbody></table>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/new-route-for-api-clients-with-the-ability-to-redirect-an-existing-shipment.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
