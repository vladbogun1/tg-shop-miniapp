> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/land-page.md).

# Nova Poshta Integration Platform

Welcome to your team’s developer platform

#### Integrate Nova Poshta into your business systems

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-cover data-type="image">Cover image</th></tr></thead><tbody><tr><td><strong>Getting API Keys</strong></td><td>Quick Start with the Nova Poshta API</td><td><a href="https://content.gitbook.com/content/igtrZlLMZZP6SZEMojXd/blobs/5G7zKyjmNri7KLOJE8W7/1a3c6d7c-5420-47c5-9d4c-9b5f45330781.jfif">1a3c6d7c-5420-47c5-9d4c-9b5f45330781.jfif</a></td></tr><tr><td> <strong>Methods</strong></td><td>Learn more about the methods and how to use them</td><td><a href="https://content.gitbook.com/content/igtrZlLMZZP6SZEMojXd/blobs/mnoL3EdsE9MMutS6IVNw/8b8e561f-0c3e-4d33-b068-2228a77c23b3.jfif">8b8e561f-0c3e-4d33-b068-2228a77c23b3.jfif</a></td></tr><tr><td><strong>Available integrations</strong></td><td>Shopify and BaseLinker to quickly launch shipping</td><td><a href="https://182724815-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FigtrZlLMZZP6SZEMojXd%2Fuploads%2FvT3NbgWaBGZMvR1fow4B%2F2085180f-1d66-4708-86b7-60b900081ab9.png?alt=media&amp;token=94d46ccd-03a5-41b8-8e49-dc936c739cb1">2085180f-1d66-4708-86b7-60b900081ab9.png</a></td></tr></tbody></table>

***

{% columns %}
{% column %}

#### From signup to your first request - in minutes

Your first API request should be the easiest part of getting started. With clear endpoints, copy-and-paste examples, and fast authentication, you'll be up and running in just a few minutes - no long setup, no technical barriers.

No confusion. No unnecessary complexity.\
Just a quick start and your first successful request.

<a href="https://api-portal.novapost.com/novaposhta-docs/" class="button primary" data-icon="rocket-launch">Quick Start</a> <a href="https://api-portal.novapost.com/methods/" class="button secondary" data-icon="gitbook">The methods</a>
{% endcolumn %}

{% column %}
{% code title="index.js" overflow="wrap" %}

```javascript
// Add a new key
const api = new DeliveryAPI({ apiKey: "YOUR_API_KEY" });

// Create a Nova Poshta shipment in a single request
const shipment = await api.novaPoshta.createShipment({
  recipient: "John Dow",
  city: "Wrocław",
  warehouse: "5",
  weight: 2
});

console.log("Shipment create:", shipment.trackingNumber);

```

{% endcode %}
{% endcolumn %}
{% endcolumns %}

***

{% columns %}
{% column %}

<figure><img src="https://182724815-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FigtrZlLMZZP6SZEMojXd%2Fuploads%2FfTxK4GPHio6niZ4XGmCp%2Fimage.png?alt=media&amp;token=4caa9e42-90a8-4e2e-88b9-54d893a81878" alt=""><figcaption></figcaption></figure>
{% endcolumn %}

{% column %}

#### Business capabilities offered by the Nova Poshta API

* Process and ship orders faster
* Provide direct access to Nova Poshta features and shipment info where it’s convenient for your customers
* Consolidate all customer shipment data within your own systems

<p align="right"><a href="https://api-portal.novapost.com/help-center/" class="button secondary" data-icon="envelope">Contact us</a></p>
{% endcolumn %}
{% endcolumns %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/land-page.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
