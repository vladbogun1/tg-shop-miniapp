> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2025/december-3.md).

# December (3)

8 DEC 2025 **`UPDATED`**&#x20;

For the methods in the Webhooks section (Retrieve all subscriptions, Create a new subscription, Update an existing subscription), response parameters in camelCase have been added for all fields that are also returned in snake\_case.

<a href="https://api-portal.novapost.com/metodi-1/methods/webhooks" class="button secondary">More details</a>

8 DEC 2025 **`UPDATED`**&#x20;

В метод додавання номерів доставок до існуючої підписки додано параметри відповіді "addedNumbers" та "missedNumbers".

<a href="https://api-portal.novapost.com/metodi-1/methods/webhooks" class="button secondary">More details</a>

8 DEC 2025 **`ADDED`**

A method description has been added for retrieving country-specific settings that determine whether a sender from Ukraine can pay customs duties and what the maximum allowed parcel value is for international shipments.

<a href="https://api-portal.novapost.com/metodi-1/methods/dictionaries" class="button secondary">More details</a>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2025/december-3.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
