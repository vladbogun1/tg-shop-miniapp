> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/may-3.md).

# May (3)

21 MAY 2026 **`UPDATED`**

Default application/json Content-Type for tracking push webhooks

<details>

<summary>Details</summary>

We've updated our tracking push subscription methods to set the default content type to `application/json` for new webhooks and responses, replacing the previous `text/plain` default. All previously created subscriptions will remain unchanged and continue to use `text/plain`.

</details>

20 MAY 2026 **`ADDED`**

Added shipment registry management methods

<details>

<summary>Details</summary>

Implemented unified registry handling functionality for Client API covering both shipment directions: Ukraine and Europe. The update introduces a single integration approach for registry creation and management across supported regions.

<a href="/changelog-1/documentation-eng/added-shipment-registry-management-methods.md" class="button secondary">More details</a>

</details>

13 MAY 2026 **`UPDATED`**&#x20;

Added custom invoice attachments for business shipments

<details>

<summary>Details</summary>

Now, within the `invoice` array, you can:

* specify whether the invoice is client-provided;
* define the invoice type and its attributes;
* attach a scanned invoice file.

This allows the system to automatically determine the correct customs codes and synchronize data between the client, Nova Post systems, and customs authorities.

<a href="/changelog-1/documentation-eng/added-custom-invoice-attachments-for-business-shipments.md" class="button secondary">More details</a>

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/may-3.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
