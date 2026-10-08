> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/2026/september-2.md).

# September (2)

22 SEP 2026 **`ADDED`**

Create a shipment redirect

<details>

<summary>Details</summary>

A new method, [**Create a shipment redirect**](https://api-portal.novapost.com/methods/methods/shipments/shipment-redirect), has been added. It allows you to change the delivery location of an existing Nova Post shipment without creating a new shipment. Using this method, a shipment can be redirected to a branch, a parcel locker, or the recipient's address.

<a href="https://api-portal.novapost.com/changelog-1/documentation-eng" class="button secondary">More details</a>

</details>

29 SEP 2026 **`ADDED`**

Added ZPL Support for Marking Printing

<details>

<summary>Details</summary>

Support for the **ZPL** format has been added to the transportation document marking method.

The ZPL format is available for **EU-EU** and **EU-UA** shipments where the first and last mile are handled by Nova Post. ZPL supports print resolutions of **203 or 300 dpi**. If the resolution is not specified, **203 dpi** is used by default.

The `format` parameter has been added to select the output format:

* `pdf` - returns the marking in PDF format;
* `zpl` - returns the marking in ZPL format.

The existing PDF flow remains unchanged to ensure backward compatibility. If the `format` parameter is not provided, the marking is generated in **PDF** format.

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/2026/september-2.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
