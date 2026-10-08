> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/new-insurancecurrencycode-parameter-for-shipments.md).

# New insuranceCurrencyCode parameter for shipments

**Endpoint:** `POST / PUT v.1.0/shipments`

We've made it easier to declare the insurance value (insuranceCost) for international shipments.

**What's new?**

Previously, `insuranceCost` had to be provided strictly in the currency of the sender's country. This meant that clients shipping from Europe or other regions had to manually convert the declared value before submitting the request.

Now, a new optional parameter `insuranceCurrencyCode` is available in the parcels array. It allows you to specify the currency of the declared value directly — and our system will handle the conversion automatically.

**How it works:**

* If `insuranceCurrencyCode` is **not provided** — everything works as before. The system expects insuranceCost in the sender's country currency.
* If `insuranceCurrencyCode` **is provided** — the system automatically converts the declared value to the sender's country currency using the current exchange rate. No extra steps required on your side.

**Benefits:**

* No need to implement currency conversion logic on your side.
* Declare values in the currency that is natural for your business (EUR, USD, CZK, etc.).
* Fewer integration errors caused by currency mismatches.

**Example:**

Shipment from Moldova (MD) with insurance value declared in US Dollars:

```
{
  "parcels": [
    {
      "cargoCategory": "parcel",
      "parcelDescription": "Electronics accessories",
      "insuranceCost": 25.50,
      "insuranceCurrencyCode": "USD",
      "rowNumber": 1,
      "width": 300,
      "length": 400,
      "height": 150,
      "actualWeight": 1500
    }
  ],
  "invoice": {
    "incoterm": "DAP",
    "currency": "USD",
    "exportReason": "Selling",
    "cost": 25.50,
    "items": [
      {
        "id": "1",
        "hsCode": "85177900",
        "name": "Phone case",
        "nameEng": "Phone case",
        "material": "plastic",
        "materialEng": "plastic",
        "measurementCode": "pieces",
        "amount": 1,
        "cost": 25.50,
        "actualWeight": 1500
      }
    ]
  }
}
```

In this example, the system will automatically convert 25.50 USD to Moldovan Leu (MDL) before processing. The client does not need to know or calculate the exchange rate.

> **Note:** If `insuranceCurrencyCode` is used, all parcels in the request must specify the same currency code.

***


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/new-insurancecurrencycode-parameter-for-shipments.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
