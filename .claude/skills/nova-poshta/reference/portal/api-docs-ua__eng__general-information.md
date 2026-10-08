> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/api-docs-ua/eng/general-information.md).

# General information

This section contains API documentation (available in the local language only) for integrating with Nova Post services **within Ukraine**. The API is designed for domestic shipments within Ukraine and provides methods for creating and managing express waybills, working with counterparties and addresses, retrieving reference data, print forms, registers, tracking, and other services. The technical version of this interface is [**API 2.0**](http://api.novaposhta.ua/v2.0).

For international shipments and integration with Nova Post services in other countries, please use the **international Nova Post API**, documented in the [**API Docs**](https://api-portal.novapost.com/methods/) section. **The international API is under active development and is gradually expanding to support domestic shipments within Ukraine**. In the future, it will become the single unified API for integrating with Nova Post services regardless of the country or shipment direction. Therefore, for new integrations, we recommend exploring the capabilities of the international [**API Docs**](https://api-portal.novapost.com/methods/) as well.

### Аuthorization

To start working with the functionality, you need to generate an API key and include it in your requests.

For more details, visit the [**Api Key Generation**](/novaposhta-docs/integration-guide/api-key-generation.md) page.

### Endpoints

**JSON:** <https://api.novaposhta.ua/v2.0/json/\\>
**XML:** <https://api.novaposhta.ua/v2.0/xml/>

### Request format

Data exchange is performed via HTTPS using the POST or GET method, sent to the appropriate endpoint depending on the request type (XML or JSON).

The format in the URL path must be specified in lowercase (e.g, <https://api.novaposhta.ua/v2.0/json/>).

### Response format

The API always returns an HTTP 200 OK response status code, even when logical or validation errors occur within the payload.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/api-docs-ua/eng/general-information.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
