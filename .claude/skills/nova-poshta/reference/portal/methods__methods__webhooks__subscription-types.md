> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/subscription-types.md).

# Subscription types

The subscription type defines the rule by which the system selects shipments for sending webhook notifications. It is set in the `type` field when the subscription is created and **cannot be changed afterwards**.

<table><thead><tr><th width="150">type</th><th width="243">Who it suits</th><th>Shipment selection condition</th></tr></thead><tbody><tr><td><code>creator</code></td><td>Clients who create shipments via the Nova Post API</td><td>The shipment was created by you, regardless of whether you are specified as the sender. All new shipments are subscribed automatically — there is no need to add them manually.</td></tr><tr><td><code>numbers</code></td><td>Those who need control over a specific list of shipments</td><td>Each shipment number that has to be tracked is added to the subscription separately. See the <a href="/methods/methods/webhooks/adding-numbers-to-a-subscription.md"><strong>Add numbers to an existing subscription</strong></a> method.</td></tr><tr><td><code>individual</code></td><td>An individual</td><td>The phone number in the subscription matches the phone number of the sender.</td></tr><tr><td><code>legal</code></td><td>A legal entity as the sender</td><td><code>companyTins</code> in the subscription matches <code>companyTins</code> of the sender.</td></tr><tr><td><code>recipientLegal</code></td><td>A legal entity as the recipient</td><td><code>companyTins</code> in the subscription matches <code>companyTins</code> of the recipient.</td></tr></tbody></table>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/subscription-types.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
