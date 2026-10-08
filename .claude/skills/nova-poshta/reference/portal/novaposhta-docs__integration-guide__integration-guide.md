> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/novaposhta-docs/integration-guide/integration-guide.md).

# Integration Guide

{% stepper %}
{% step %}

#### Sign a Contract with Nova Post

To start the integration process, your company must have a valid non-cash cooperation agreement with Nova Post.<br>
{% endstep %}

{% step %}

#### Select an individual who will act as the authorized company representative and provide their contact details: full name, phone number, and email address.

These details can be specified directly in the contract.\
If you need to provide or update the authorized representative’s contact details after signing the agreement, please contact your account manager.
{% endstep %}

{% step %}

#### Create a Profile in the Personal Account

Create a profile at **my.novapost.com** using the phone number and full name of the authorized representative specified in the contract.

If an account with these details has already been created, there is no need to create a new one.
{% endstep %}

{% step %}

#### Generate an API Key

In your personal account at **my.novapost.com**, navigate to: **Integrations → API Keys**

Generate an API key to allow your developer to configure and execute API requests.
{% endstep %}
{% endstepper %}

> Nova Post API keys are issued to an individual (natural person).
>
> Therefore, the authorized company representative should be the person responsible for generating the API key and providing it to the developer.
>
> This may be the company director, head of sales or marketing, or the developer directly.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/novaposhta-docs/integration-guide/integration-guide.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
