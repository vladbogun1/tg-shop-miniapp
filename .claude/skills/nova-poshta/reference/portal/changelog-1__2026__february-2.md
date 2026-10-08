> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/february-2.md).

# February (2)

26 FEB 2026 **`UPDATED`** &#x20;

AllowedInspection Service (Inspection Allowed) (Moldova)

<details>

<summary>Details</summary>

For domestic shipments within Moldova (MD → MD), an additional client API service `AllowedInspection` is available, allowing the recipient to inspect the shipment before receiving it.

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng/" class="button secondary">More details</a>

</details>

***

19 FEB 2026 **`ADDED`**&#x20;

A new Fulfillment section has been added to the Postman collection.

[Download](https://documenter.getpostman.com/view/37226773/2sAYQWLZdh#9cb7ef5c-ebdf-4c94-9c73-ed0b49bf06af)


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/february-2.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
