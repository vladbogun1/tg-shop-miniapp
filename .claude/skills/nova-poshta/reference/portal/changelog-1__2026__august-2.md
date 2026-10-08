> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/august-2.md).

# August (2)

31 AUG 2026 **`UPDATED`**

Calculate Delivery Cost for US Shipments

<details>

<summary>Details</summary>

The [Calculate delivery cost](https://api-portal.novapost.com/methods/methods/shipments/delivery-cost) method has been updated for shipments from Ukraine to the United States. Customs duties are now calculated based on the UCGFEA (HS codes), quantity, and value of individual invoice items instead of the total invoice value when the customs duties payer is the sender or a third party.

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng" class="button secondary">More details</a>

</details>

11 AUG 2026 **`UPDATED`**

Fulfillment v2.0

<details>

<summary>Details</summary>

The [Fulfillment](https://api-portal.novapost.com/metodi-1/methods/fullfillment) methods have been updated with changes to order management, stock remains, validation rules, and request/response formats. Existing integrations must be updated, as these changes are not backward compatible.

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng/fulfillment-rest-api-change-summary" class="button secondary">More details</a>

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/august-2.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
