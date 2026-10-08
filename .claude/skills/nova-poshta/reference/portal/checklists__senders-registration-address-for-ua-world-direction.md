> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/checklists/senders-registration-address-for-ua-world-direction.md).

# Sender's Registration Address for UA–World Direction

The checklist helps you independently verify whether the sender's registration address is correctly configured to be passed via the API when creating a shipment from Ukraine to the World.

**Sender's registration address** – the address at which the sender, a legal entity, is officially registered. It is used to generate and transmit invoices for customs clearance and may differ from the actual shipment origin address.

To reduce the time required for MEN processing and verification, the client can provide this address when creating a shipment.

Field Schema for the `registrationAddressParts` Block

| **Name** | **Тype**                  | **Requiredness** | **Value**                                                                 |
| -------- | ------------------------- | ---------------- | ------------------------------------------------------------------------- |
| city     | string, max 100           | Optional         | City name                                                                 |
| region   | string, max 100           | Optional         | State, region, or other administrative division to which the city belongs |
| street   | string, max 100           | Optional         | Street                                                                    |
| postCode | string, max 10            | Optional         | Postal code (ZIP code)                                                    |
| building | string, max 100           | Optional         | Building number or name                                                   |
| flat     | string, max 10            | Optional         | Apartment, office, or premises number, if applicable                      |
| block    | string, max 100, nullable | Optional         | Building or residential complex block or section, if applicable           |
| note     | string, max 100           | Optional         | Additional address information                                            |

Example сontract with сompleted fields

```
{
    "status": "ReadyToShip",
    "clientOrder": "123-11",
    "note": "",
    "payerType": "ThirdPerson",
    "payerContractNumber": "1111111",
    "invoice": {
        "incoterm": "DAP",
        "payerFeesCustoms": "Recipient",
        "exportReason": "Selling",
        "currency": "EUR",
        "cost": "349.00",
        "items": [
            {
                "id": "02ce0834-0928-3f44-906f-aae93fd84897",
                "name": "Книга 1",
                "nameEng": "",
                "measurementCode": "pieces",
                "amount": 1,
                "cost": 349,
                "hsCode": "4901990000",
                "material": "Друкована продукція (книги)",
                "actualWeight": 220
            }
        ]
    },
    "services": [],
    "parcels": [
        {
            "cargoCategory": "parcel",
            "parcelDescription": "Books",
            "insuranceCost": "349.00",
            "rowNumber": 1,
            "width": 200,
            "length": 350,
            "height": 100,
            "actualWeight": 220
        }
    ],
    "sender": {
        "companyTin": "11111111",
        "companyName": "NEW BOOKS",
        "phone": "380501112233",
        "email": "books@mail.com",
        "name": "Name Surname",
        "countryCode": "UA",
        "settlementId": 126956,
        "divisionId": 11217,
        "address": null,
        "addressParts": {},
        "registrationAddressParts": {
            "city": "Petropavlivska Borschagivka",
            "region": "Kyiv region",
            "street": "Soborna",
            "postCode": "08129",
            "building": " 10B",
            "flat": "",
            "block": "",
            "note": ""
        },
        "ioss": null
    },
    "recipient": {
        "companyTin": "11111111",
        "companyName": "Recipient Companyname",
        "phone": "4871234567",
        "email": "test@gmail.com",
        "name": "Name Surname",
        "countryCode": "PL",
        "settlementId": 22326,
        "address": null,
        "divisionId": 1888318,
        "addressParts": {},
        "ioss": null
    }
}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/checklists/senders-registration-address-for-ua-world-direction.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
