> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/novaposhta-docs/integration-guide/how-to-choose-the-appropriate-endpoint.md).

# How to choose the appropriate endpoint

Nova Post provides several API endpoints for processing requests related to shipment creation, tracking, and other operations.

Endpoint for all destinations – <mark style="color:$success;"><https://api.novapost.com/v.1.0></mark> is used for processing shipments across all delivery destinations without restrictions, including both international shipments and domestic deliveries within Ukraine.

Endpoint for shipments within Ukraine – [https://api.novaposhta.ua/v.1.0](https://developers.novaposhta.ua/) is used only for domestic shipments within Ukraine or international shipments from Ukraine to other countries worldwide.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/novaposhta-docs/integration-guide/how-to-choose-the-appropriate-endpoint.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
