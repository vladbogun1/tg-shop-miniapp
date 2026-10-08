> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/novaposhta-docs/integration-guide.md).

# Integration guide

The Nova Post API provides access to international delivery services and enables you to integrate shipment creation, management, and tracking into your systems.

The API is designed to automate logistics processes and ensure secure data exchange between client systems and the Nova Post platform.

### Getting Started

1. Generate an API key and obtain a JWT token to access the API.
2. Go to the section to review the available methods, operations, and parameters.
3. Use the Dictionaries to provide valid system values in your API requests.
4. Check the Changelog regularly to ensure you don’t miss any API changes.
5. For assistance, visit the Help Center (FAQ, guidance, and support).


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/novaposhta-docs/integration-guide.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
