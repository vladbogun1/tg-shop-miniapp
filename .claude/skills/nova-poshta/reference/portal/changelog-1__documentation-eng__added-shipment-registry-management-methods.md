> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/added-shipment-registry-management-methods.md).

# Added shipment registry management methods

## Registers in Europe <a href="#id-2.-registers-in-europe" id="id-2.-registers-in-europe"></a>

**Restrictions:**

* are created only for shipments that are in ReadyToShip status;
* there is only one shipping point for all shipments in the registry;
* the user performing operations with the registry is associated with the sender organization (for legal entities) or is the sender in the shipments;
* the maximum number of shipments in the registry is 100.

### Creating a new registry with shipment <a href="#id-2.1-creating-a-new-registry-with-shipment" id="id-2.1-creating-a-new-registry-with-shipment"></a>

This method is used to create a client registry for shipments from Europe.

#### Request <a href="#request" id="request"></a>

The Method `POST v.1.0/registry`

```
{
  "description": "My_new_registry",
  "shipments": [
     "SHPL0462195188"
  ]
}
```

#### Response <a href="#response" id="response"></a>

The state `200 OK Request successful. The server responded as required.`

```
{
    "id": "948086",
    "number": "CRPL0000041723",
    "versionTracking": null,
    "status": "Open",
    "createdAt": "2026-05-19T14:46:28.232180Z",
    "updatedAt": "2026-05-19T14:46:28.232180Z",
    "deletedAt": null,
    "posted": null,
    "printed": null,
    "scannedBarcodesAmount": 1,
    "forScanBarcodesAmount": 0,
    "description": "My_new_registry",
    "senderCompanyId": null,
    "senderCompanyTin": "",
    "senderPhone": "48512345678",
    "senderCountryCode": "PL",
    "senderSettlementId": "22326",
    "senderSettlementExternalId": null,
    "senderSettlementName": "Warsaw",
    "senderDivisionId": "1888318",
    "senderDivisionExternalId": null,
    "senderDivisionName": "Post branch 11",
    "senderAddress": "02-495, Polska, Województwo mazowieckie, Warszawa County, Warszawa, Stanisława Wojciechowskiego, 39 lok.1, , , ",
    "senderAddressParts": {
        "city": "Warszawa",
        "region": "Warszawa County",
        "street": "Stanisława Wojciechowskiego",
        "streetId": null,
        "postCode": "02-495",
        "building": "39 lok.1",
        "flat": "",
        "block": "",
        "latitude": 52.1947201268,
        "longitude": 20.8706685393,
        "note": "",
        "addressId": null
    },
    "shipments": [
        {
            "shipmentId": "1401932",
            "shipmentNumber": "SHPL0462195188",
            "destinationDivision": {
                "name": "WARSZAWA 11",
                "id": 1888318,
                "number": "02/11"
            }
        }
    ]
}
```

#### Errors <a href="#errors" id="errors"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Adding a shipment to an existing registry <a href="#id-2.2-adding-a-shipment-to-an-existing-registry" id="id-2.2-adding-a-shipment-to-an-existing-registry"></a>

#### Description <a href="#description.1" id="description.1"></a>

This method is used to add a shipment to an existing client registry.

#### Query Parameter <a href="#query-parameter" id="query-parameter"></a>

{id} - unique identifier of the registry

#### Request  <a href="#request.1" id="request.1"></a>

The method `POST v.1.0/registry/{id}/shipments`

```
{
  "shipments": [
     "SHPL8187197311"
  ]
}
```

#### Response <a href="#response.1" id="response.1"></a>

The state `200 OK Request successful. The server has responded as required.`

```
{
    "id": "948086",
    "number": "CRPL0000041723",
    "versionTracking": null,
    "status": "Open",
    "createdAt": "2026-05-19T14:46:28.232000Z",
    "updatedAt": "2026-05-19T14:46:28.574000Z",
    "deletedAt": null,
    "posted": false,
    "printed": false,
    "scannedBarcodesAmount": 2,
    "description": "My_new_registry",
    "senderCompanyId": null,
    "senderCompanyTin": "",
    "senderPhone": "48512345678",
    "senderCountryCode": "PL",
    "senderSettlementId": "22326",
    "senderSettlementExternalId": null,
    "senderSettlementName": "Warsaw",
    "senderDivisionId": "1888318",
    "senderDivisionExternalId": null,
    "senderDivisionName": "Post branch 11",
    "senderAddress": "02-495, Polska, Województwo mazowieckie, Warszawa County, Warszawa, Stanisława Wojciechowskiego, 39 lok.1, , , ",
    "senderAddressParts": {
        "city": "Warszawa",
        "region": "Warszawa County",
        "street": "Stanisława Wojciechowskiego",
        "streetId": null,
        "postCode": "02-495",
        "building": "39 lok.1",
        "flat": "",
        "block": "",
        "latitude": 52.1947201268,
        "longitude": 20.8706685393,
        "note": null,
        "addressId": null
    },
    "shipments": [
        {
            "shipmentId": "3168550",
            "shipmentNumber": "SHPL0462195188"
        },
        {
            "shipmentId": "3168827",
            "shipmentNumber": "SHPL8187197311"
        }
    ]
}
```

#### Errors <a href="#errors.1" id="errors.1"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Removing a shipment from the registry <a href="#id-2.3-removing-a-shipment-from-the-registry" id="id-2.3-removing-a-shipment-from-the-registry"></a>

#### Description <a href="#description.2" id="description.2"></a>

This method removes a shipment from an existing client registry.

#### Query Parameter <a href="#query-parameter.1" id="query-parameter.1"></a>

{id} - unique identifier of the registry

#### Request  <a href="#request.2" id="request.2"></a>

The method `DELETE v.1.0/registry/{id}/shipments`

```
{
  "shipments": [
     "SHPL8187197311"
  ]
}
```

#### Response <a href="#response.2" id="response.2"></a>

The state `200 OK Request successful. The server has responded as required.`

```
{
    "id": "948086",
    "number": "CRPL0000041723",
    "versionTracking": null,
    "status": "Open",
    "createdAt": "2026-05-19T14:46:28.232000Z",
    "updatedAt": "2026-05-19T14:46:28.574000Z",
    "deletedAt": null,
    "posted": false,
    "printed": false,
    "scannedBarcodesAmount": 2,
    "description": "My_new_registry",
    "senderCompanyId": null,
    "senderCompanyTin": "",
    "senderPhone": "48512345678",
    "senderCountryCode": "PL",
    "senderSettlementId": "22326",
    "senderSettlementExternalId": null,
    "senderSettlementName": "Warsaw",
    "senderDivisionId": "1888318",
    "senderDivisionExternalId": null,
    "senderDivisionName": "Post branch 11",
    "senderAddress": "02-495, Polska, Województwo mazowieckie, Warszawa County, Warszawa, Stanisława Wojciechowskiego, 39 lok.1, , , ",
    "senderAddressParts": {
        "city": "Warszawa",
        "region": "Warszawa County",
        "street": "Stanisława Wojciechowskiego",
        "streetId": null,
        "postCode": "02-495",
        "building": "39 lok.1",
        "flat": "",
        "block": "",
        "latitude": 52.1947201268,
        "longitude": 20.8706685393,
        "note": null,
        "addressId": null
    },
    "shipments": [
        {
            "shipmentId": "3168550",
            "shipmentNumber": "SHPL0462195188"
        }
    ]
}
```

#### Errors <a href="#errors.2" id="errors.2"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Deleting the registry <a href="#id-2.4-deleting-the-registry" id="id-2.4-deleting-the-registry"></a>

#### Description <a href="#description.3" id="description.3"></a>

This method completely deletes the client registry, but first you need to delete all shipments.

#### Query Parameter <a href="#query-parameter.2" id="query-parameter.2"></a>

{id} - unique identifier of the registry

#### Request  <a href="#request.3" id="request.3"></a>

The method `DELETE v.1.0/registry/{id}`

#### Response <a href="#response.3" id="response.3"></a>

```
{
    "success": true
}
```

#### Errors <a href="#errors.3" id="errors.3"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Renaming the registry <a href="#id-2.5-renaming-the-registry" id="id-2.5-renaming-the-registry"></a>

#### Description <a href="#description.4" id="description.4"></a>

This method renames an existing client registry.

#### Query Parameter <a href="#query-parameter.3" id="query-parameter.3"></a>

{id} - unique identifier of the registry

#### Request  <a href="#request.4" id="request.4"></a>

The method `PUT v.1.0/registry/{id}/rename`

```
{
   "description": "new name"
}
```

#### Response <a href="#response.4" id="response.4"></a>

The state `200 OK Request successful. The server has responded as required.`

```
{
    "id": "948086",
    "number": "CRPL0000041723",
    "versionTracking": null,
    "status": "Open",
    "createdAt": "2026-05-19T14:46:28.232000Z",
    "updatedAt": "2026-05-19T14:46:28.574000Z",
    "deletedAt": null,
    "posted": false,
    "printed": false,
    "scannedBarcodesAmount": 1,
    "description": "new name",
    "senderCompanyId": null,
    "senderCompanyTin": "",
    "senderPhone": "48512345678",
    "senderCountryCode": "PL",
    "senderSettlementId": "22326",
    "senderSettlementExternalId": null,
    "senderSettlementName": "Warsaw",
    "senderDivisionId": "1888318",
    "senderDivisionExternalId": null,
    "senderDivisionName": "Post branch 11",
    "senderAddress": "02-495, Polska, Województwo mazowieckie, Warszawa County, Warszawa, Stanisława Wojciechowskiego, 39 lok.1, , , ",
    "senderAddressParts": {
        "city": "Warszawa",
        "region": "Warszawa County",
        "street": "Stanisława Wojciechowskiego",
        "streetId": null,
        "postCode": "02-495",
        "building": "39 lok.1",
        "flat": "",
        "block": "",
        "latitude": 52.1947201268,
        "longitude": 20.8706685393,
        "note": null,
        "addressId": null
    },
    "shipments": [
        {
            "shipmentId": "3168550",
            "shipmentNumber": "SHPL0462195188"
        }
    ]
}
```

#### Errors <a href="#errors.4" id="errors.4"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Printing the registry <a href="#id-2.6-printing-the-registry" id="id-2.6-printing-the-registry"></a>

#### Description <a href="#description.5" id="description.5"></a>

This method returns a file for printing the client registry

#### Query Parameter <a href="#query-parameter.4" id="query-parameter.4"></a>

{id} - unique identifier of the registry

#### Request  <a href="#request.5" id="request.5"></a>

The method `GET v.1.0/registry/print?id=948086`

#### Response <a href="#response.5" id="response.5"></a>

The state `200 OK Request successful. The server has responded as required.`

```
file
```

#### Errors <a href="#errors.5" id="errors.5"></a>

| Error | Meaning             |
| ----- | ------------------- |
| 401   | Unauthorized        |
| 422   | Validation error    |
| 503   | Connection time-out |

### Requesting a list of registries <a href="#id-2.7-requesting-a-list-of-registries" id="id-2.7-requesting-a-list-of-registries"></a>

#### Description <a href="#description.6" id="description.6"></a>

Цей метод повертає список реєстрів по заданим користувачем фільтрам.

#### Query Parameter <a href="#query-parameter.5" id="query-parameter.5"></a>

<table data-search="false"><thead><tr><th width="168">Field</th><th width="97">Type</th><th width="172">Possible Value</th><th>Description</th></tr></thead><tbody><tr><td>isEURegistry</td><td>boolean</td><td>true</td><td>Mandatory parameter for European registers.</td></tr><tr><td>ids[]</td><td>string</td><td><strong>Example:</strong> 948086</td><td>Unique registry identifiers for which information should be obtained.</td></tr><tr><td>numbers[]</td><td>string</td><td><strong>Example:</strong> CRPL0000041723</td><td>Unique registry number for which information should be obtained.</td></tr><tr><td>settlementIds[]</td><td>string</td><td><strong>Example:</strong> 22326</td><td>Unique identifier of the settlement.</td></tr><tr><td>withShipmentsInfo</td><td>boolean</td><td><strong>Example:</strong> true</td><td>When this parameter is specified, the shipment information array will include the shipment ID, shipment number, total weight, total value, invoice currency (if available), and invoice availability. If the parameter is not specified or is set to false, the shipments block will contain only the shipment ID and shipment number.</td></tr><tr><td>createdAtFrom</td><td>date</td><td><strong>Example:</strong> 01.05.2026</td><td>Start date of the registry filtering period. Used to retrieve records created from this date inclusive. The field <code>createdAtFrom</code> must be a date earlier than <code>createdAtTo</code></td></tr><tr><td>createdAtTo</td><td>date</td><td><strong>Example:</strong> 20.05.2026</td><td>End date of the registry filtering period. Used to retrieve records created before this date (exclusive).</td></tr><tr><td>page</td><td>integer</td><td><strong>Example:</strong> 1</td><td>Page number to return.</td></tr><tr><td>limit</td><td>integer</td><td><strong>Example:</strong> 5</td><td>Maximum number of items to return per page.</td></tr></tbody></table>

#### Request <a href="#request.6" id="request.6"></a>

The method `GET v.1.0/registry`

```
{
    "current_page": 1,
    "last_page": 1,
    "per_page": 15,
    "total": 1,
    "items": [
        {
            "id": "948086",
            "number": "CRPL0000041723",
            "createdAt": "2026-05-19T14:46:28.232000Z",
            "updatedAt": "2026-05-20T07:01:01.787000Z",
            "deletedAt": null,
            "posted": false,
            "printed": false,
            "description": "new name",
            "status": "Open",
            "type": "Client",
            "createdByUser": "255ea89d-8c1f-47ec-8f2e-64486bd24f5f",
            "scannedBarcodesAmount": 0,
            "source": "clientapi",
            "companyId": null,
            "companyTin": "",
            "companyName": "Private person",
            "fullName": "Oksana Hrechaniuk",
            "phone": "48512345678",
            "countryCode": "PL",
            "country": "Poland",
            "settlementId": "22326",
            "settlementName": "Warsaw",
            "divisionId": "1888318",
            "divisionName": "Post branch 11",
            "address": "02-495, Polska, Województwo mazowieckie, Warszawa County, Warszawa, Stanisława Wojciechowskiego, 39 lok.1, , , ",
            "addressParts": {
                "city": "Warszawa",
                "region": "Warszawa County",
                "street": "Stanisława Wojciechowskiego",
                "streetId": null,
                "postCode": "02-495",
                "building": "39 lok.1",
                "flat": "",
                "block": "",
                "latitude": 52.1947201268,
                "longitude": 20.8706685393,
                "note": null,
                "addressId": null
            },
            "currencyCode": "PLN",
            "shipmentsInfo": [
                {
                    "id": "3168550",
                    "number": "SHPL0462195188",
                    "totalWeight": 2000,
                    "totalCost": 65,
                    "currencyCode": "PLN",
                    "invoice": true
                }
            ]
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
GET https://api-portal.novapost.com/changelog-1/documentation-eng/added-shipment-registry-management-methods.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
