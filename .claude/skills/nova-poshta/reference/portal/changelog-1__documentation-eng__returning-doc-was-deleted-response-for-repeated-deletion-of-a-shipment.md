> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/returning-doc-was-deleted-response-for-repeated-deletion-of-a-shipment.md).

# Returning doc was deleted response for repeated deletion of a shipment

### General Information

<table data-header-hidden data-search="false"><thead><tr><th width="257"></th><th></th></tr></thead><tbody><tr><td><strong>Method Name</strong></td><td>Delete document</td></tr><tr><td><strong>HTTP Method</strong></td><td>DELETE</td></tr><tr><td><strong>Route</strong></td><td><p><code>DELETE /ui/v.1.0/shipments/{id}</code></p><p><code>DELETE /v.1.0/shipments/{id}</code></p><p><code>DELETE /mobileapp/v.1.1/shipments/{id}</code></p><p><code>DELETE /cbc/v.1.0/shipments/{id}</code></p><p><code>DELETE /internal/awis/shipments/{id}</code></p></td></tr><tr><td><strong>Change Type</strong></td><td>existing endpoint update</td></tr><tr><td><strong>Authorization</strong></td><td> <code>Authorization: Bearer jwt-token…</code></td></tr><tr><td><strong>Related Task</strong></td><td><a href="https://novaposhta.atlassian.net/browse/APIGW-149">https://novaposhta.atlassian.net/browse/APIGW-149</a></td></tr><tr><td><strong>Product</strong></td><td>API Gateway</td></tr></tbody></table>

### Description

To correctly handle repeated shipment deletion requests, an additional shipment status check is performed through Tracking Service.\
The purpose is to return a unified response shipment\_was\_deleted if the shipment has already been deleted.

### Processing logic

When executing a **Delete Shipment** request, API additionally sends a GET request to Tracking Service using the following parameter:

```
withDeleted=1
```

This parameter allows retrieving data for previously deleted shipments.

The response is then analyzed based on the field:

```
deleted_at
```

* if `deleted_at ≠ null` → the shipment was previously deleted;\
  API returns:

```
{
  "errors": {
    "errorMessage": "shipment_was_deleted"
  }
}
```

**HTTP status:** `422 Unprocessable Entity`

* if deleted\_at = null or the field is missing → shipment is not found;\
  current behavior remains unchanged and API returns:

```
{
  "errors": {
    "errorMessage": "shipment_not_found"
  }
}
```

**HTTP status:** `404 Not Found`

### Request example

```
DELETE /shipments/{id}
```

### Successful response

```
{
  "success": true
}
```

**HTTP status:** `200 OK`


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/returning-doc-was-deleted-response-for-repeated-deletion-of-a-shipment.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
