> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods.md).

# Мethods

The Methods section contains Nova Post API tools for integrating core logistics processes into external systems and automating interaction with delivery services.

Methods are grouped by key integration areas:

* **Authorization** — obtaining API keys and JWT tokens for authorized requests;
* **Dictionaries** — access to reference data required for building valid API requests;
* **Services** — additional methods for specific service scenarios;
* **Shipments** — creating, updating, calculating, and managing deliveries;
* **Courier delivery** — creating and managing courier pickup requests;
* **Webhooks** — receiving events and status updates automatically via subscriptions;
* **Fulfillment** — managing goods, stock balances, orders, and inbound operations.

Each section includes endpoint descriptions, request parameters, response examples, and usage rules required for integration.

### API Collections in Postman

This is a collection of predefined requests for testing API methods, designed to simplify integration and eliminate the need to create requests manually.

<p align="right"><a href="https://documenter.getpostman.com/view/37226773/2sAYQWLZdh" class="button primary">Download</a></p>

### SDK for PHP Applications

The NovaPost API SDK is an official PHP library that simplifies integration with the Nova Post API. It provides ready-to-use methods for working with shipments, tracking, calculations, and other Nova Post services while supporting modern PHP standards and flexible customization.

<p align="right"><a href="https://api-portal.novapost.com/changelog-1/documentation/sdk-for-php" class="button secondary">Start Using SDK</a></p>

### API Versioning <a href="#api-versioning" id="api-versioning"></a>

#### Overview <a href="#overview" id="overview"></a>

Nova Post uses API versioning to introduce significant changes while keeping existing client integrations stable.

Each major API version is published separately in the API documentation. When a new major version becomes available, the previous version continues to operate during a transition period, allowing clients to plan and complete their migration without interrupting their services.

#### Versioning Strategy <a href="#versioning-strategy" id="versioning-strategy"></a>

We use **URL-based versioning**. The version number is included in the API endpoint path:

* `https://api.novapost.com/v1.0/shipments` - current version
* `https://api.novapost.com/v2.0/shipments` - future version

When we release a new major version, the previous version enters a support period. Your existing integration continues to work unchanged until you are ready to migrate and to the .


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
