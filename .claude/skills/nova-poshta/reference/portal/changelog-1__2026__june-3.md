> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/june-3.md).

# June (3)

25 JUN 2026 **`UPDATED`**

Device Serial Numbers

<details>

<summary>Details</summary>

Shipment invoice items for [international shipments to Ukraine](https://api-portal.novapost.com/metodi-1/methods/shipments/create-shipments/cross-border-shipments-to-ukraine) now support the optional `serialNumber` field. The serial number can be used to identify devices and equipment during the Light Return process.

</details>

16 JUN 2026 **`UPDATED`**

Customs Fees Settings Response Updated

<details>

<summary>Details</summary>

The response structure of the customs fees settings method has been updated. Instead of a single declared parcel value threshold, the method now returns minimum and maximum thresholds.

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng/customs-fees-settings-response-update" class="button secondary">More details</a>

</details>

11 JUN 2026 **`ADDED`**

Settlement and Street Dictionaries

<details>

<summary>Details</summary>

New methods have been added to the documentation for searching and obtaining information about [settlements](https://api-portal.novapost.com/metodi-1/methods/dictionaries#get-dictionary-settlements) and [streets](https://api-portal.novapost.com/metodi-1/methods/dictionaries#get-dictionary-streets). The methods provide access to reference data that can be used during shipment creation, including settlement and street identifiers, names, and other related attributes.

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/june-3.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
