> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/july-2.md).

# July (2)

30 JUL 2026 **`ADDED`**

API Error Reference

<details>

<summary>Details</summary>

A new page describing [API errors](https://api-portal.novapost.com/metodi-1/methods/api-errors) has been added to the documentation. It contains explanations of error messages that help identify the cause of an issue and understand how to resolve it.

</details>

09 JUL 2026 **`UPDATED`**

Webhook Subscription Type recipientLegal

<details>

<summary>Details</summary>

The documentation for [creating](https://api-portal.novapost.com/metodi-1/methods/webhooks#post-tracking-push-subscribers), [updating](https://api-portal.novapost.com/metodi-1/methods/webhooks#put-tracking-push-subscribers-id), and [retrieving](https://api-portal.novapost.com/metodi-1/methods/webhooks#get-tracking-push-subscribers) webhook subscriptions has been updated. Support for the `recipientLegal` subscription type has been added, allowing webhook subscriptions to track all shipments addressed to a legal recipient. As with the `legal` subscription type, the `companyTins` field is required.

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/july-2.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
