> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/fulfillment-rest-api-change-summary.md).

# Fulfillment REST API Change Summary

### 1. Integration Update Recommendations (Mandatory Adaptation)

As the implemented changes update the API contract specifications, clients must update their integration solutions according to the changes described below to ensure stable operation.&#x20;

**Please note:** these changes are **not backward compatible**.

* **Order endpoint restructuring:** Single order creation via `/orders` has been removed. Batch order creation via `/orders/multiple` has been added.
* **Identifier standardization (id / ids):** A global identifier standardization has been implemented. The API no longer uses prefixed identifiers (`documentId`, `objectBarcodeId`, `documentIds`, `warehouseIds`). Instead, the unified `id` is used for individual objects and path parameters, while `ids` and `destWarehouses` are used for arrays/lists and warehouse identifiers.
* **Delivery type mapping changes (Delivery Type Enums):** In all order endpoints, `1` now represents **Nova Post Shipment**, and `2` represents **Pickup**. Code `2` has changed its business meaning (it now represents **Pickup** instead of **Nova Post Shipment**), and the previous code `5` is no longer supported.
* **Typographical error fix:** The parameter name has been corrected from `waybilNumber` to `waybillNumber` (with two **l** characters).
* **Migration to warehouse business codes:** `destWarehouses` has been introduced instead of `warehouseIds`. It accepts warehouse business codes as strings (for example, `"Boyarka"`).
* **Status field data type change in responses:** In the order status endpoint, the `status` field type has been changed from `string` to `integer` (returns the status ID).
* **Goods barcode creation:** Units of measurement are no longer required when generating or creating a goods barcode.

### 2. Functional Logic Changes (Stock Remains)

* **Barcode independence:** Product information is returned regardless of whether a product has a barcode.
* **Differentiated stock remains logic:** Without product-specific filters (`ids`, `objectArts`, `objectTitles`), the system returns **only** products with actual stock available (`> 0`). When product-specific filters are provided, the requested products are returned **regardless** of whether their stock quantities are zero.

### 3. Validation and Data Normalization Updates

* **Automatic normalization (Trimming):** All incoming string values are trimmed of leading and trailing whitespace, and empty strings are converted to `null`.
* **Strict JSON payload validation:** If a request body contains additional or undocumented properties, the system returns **422 Unprocessable Entity**.
* **Data consistency:** GUID uniqueness is validated within a single request. Conditional field requirements have been introduced (for example, `quantity` is required when `objectId` is provided).

### 4. Changes to JSON Payload and Query Parameter Formats

* **Root-level Array:** Arrays for batch operations must be passed directly as a root-level array (`[...]`) without an enclosing object.
* **Query parameters in GET requests:** Comma-separated array values are no longer supported in GET requests. Array parameters must be specified by repeating the parameter name, for example: `?ids[]=val1&ids[]=val2`.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/fulfillment-rest-api-change-summary.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
