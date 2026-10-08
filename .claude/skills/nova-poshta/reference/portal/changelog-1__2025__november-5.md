> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2025/november-5.md).

# November (5)

24 NOV 2025 **`ADDED`**

Offline reference guide for clients containing the list of settlements in Ukraine where shipment delivery is restricted.

<details>

<summary>Details</summary>

This API provides a daily-updated manifest of Ukrainian settlements where shipment delivery is prohibited. The manifest includes links to localized, gzipped JSON files with detailed settlement information and prohibition flags.

The files are available in both Ukrainian and English for localization support.

The files are updated each day at 5:00 UTC.

**Features:**

* Returns a JSON manifest with URLs to the updated settlement lists.
* Each list is a gzipped JSON file (`.json.gz`).
* Each file is localized (`locale="uk"` for Ukrainian, `locale="en"` for English).
* Settlement records include administrative region, coordinates, postal codes, alternative names, and prohibition flags.

<a href="/changelog-1/documentation-eng/the-method-for-obtaining-a-link-to-the-online-payment-form.md" class="button secondary">More details</a>

</details>

17 NOV 2025 **`ADDED`**

A method description has been added for retrieving country settings to determine whether customs duties can be paid by the sender.

<details>

<summary>Details</summary>

The method for obtaining settings for the possibility of paying customs duties by the sender and the maximum value of the parcel by country

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng/" class="button secondary">More details</a>

</details>

12 NOV 2025 **`ADDED`**

GET /registry/print

<details>

<summary>Details</summary>

The method allows users to receive a generated PDF file of a registry for further printing.

**European registers** use only general registry type printing.\
**Ukrainian registers** (UA-World) can print\
\- general registry and\
\- international express waybills (IEW),\
\- markings of international express waybills,\
\- invoices of international express waybills.

<a href="/changelog-1/documentation-eng/get-registry-print.md" class="button secondary">More details</a>

</details>

12 NOV 2025 **`ADDED`**

The method of calculating the cost of delivery.

<details>

<summary>Details</summary>

The method allows users to receive information about the cost of delivery, the cost of paying for customs services, and the cost of other related services.

<a href="/changelog-1/documentation-eng/the-method-of-calculating-the-cost-of-delivery.md" class="button secondary">More details</a>

</details>

6 ЛИС 2025 **`ADDED`**

A new method, `Create Light Return Shipment`, has been added to the Shipments section.

<a href="https://api-portal.novapost.com/metodi-1/methods/shipments/return" class="button secondary">More details</a>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2025/november-5.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
