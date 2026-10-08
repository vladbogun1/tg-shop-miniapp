> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/added-custom-invoice-attachments-for-business-shipments.md).

# Added custom invoice attachments for business shipments

**Endpoint:**

`POST v.1.0/shipments`

`PUT v.1.0/shipments/{id}`

In accordance with customs requirements, starting from April 15, corporate clients will be able to additionally upload their own invoice form with a physical signature or a completed, signed, and scanned invoice template to the international express waybill in order to ensure proper cargo documentation support.

What’s new?

Previously, clients could attach their own invoice forms, but customs officers identified them only after the physical inspection of the cargo.

There was also a risk of incorrect invoice type identification (commercial invoice or invoice issued free of charge), which could cause delays in customs clearance processing.

Now, within the `invoice` array, you can:

* specify whether the invoice is client-provided;
* define the invoice type and its attributes;
* attach a scanned invoice file.

This allows the system to automatically determine the correct customs codes and synchronize data between the client, Nova Post systems, and customs authorities.

Additionally, in this scenario, the client must provide a flag confirming that the invoice has been physically signed.

How it works:

New fields for attaching a client invoice have been added to the request for creating or updating an international express waybill.

The system identifies the presence of a client invoice and transfers this information to the customs broker.

Please note that this functionality is available both for:

* creating an international express waybill;
* updating an international express waybill.

<table data-search="false"><thead><tr><th width="186">Field name</th><th width="149">Type</th><th width="394">Description</th></tr></thead><tbody><tr><td>clientInvoice</td><td>int</td><td><p>Indicates whose invoice is used.</p><p><code>1</code> — client invoice</p><p><code>0</code> — Nova Post template</p><p>Default value: <code>0</code></p></td></tr><tr><td>invoiceType</td><td>enum</td><td><p>Invoice type:</p><p><code>Invoice</code> — commercial invoice</p><p><code>ProformaInvoice</code> — free-of-charge invoice</p><p>Default value: <code>Invoice</code></p></td></tr><tr><td>customerNumber</td><td>string</td><td><p>Client invoice number (for client invoice).</p><p>Required if <code>clientInvoice = 1</code></p></td></tr><tr><td>customerCreatedAt</td><td>datetime</td><td><p>Client invoice date (for client invoice).</p><p>Default value: current date</p></td></tr><tr><td>invoiceSign</td><td>int</td><td><p>Indicates that the client signed the invoice file.</p><p>Required if <code>clientInvoice = 1</code></p></td></tr><tr><td>invoiceFile</td><td>object</td><td>Object for transferring client invoice file data</td></tr><tr><td>base64Content</td><td>string</td><td><p>File content in Base64 format.</p><p>Required if <code>clientInvoice = 1</code></p></td></tr><tr><td>filename</td><td>string</td><td><p>Client-defined file name.</p><p>Required if <code>clientInvoice = 1</code></p></td></tr></tbody></table>

Example of filling in:

```
"invoice": {
        "incoterm": "DAP",
        "payerFeesCustoms": "Recipient",
        "cost": 1478,
        "currency": "UAH",
        "exportReasonNote": "",
        "exportReasonNoteEng": "",
        "exportReason": "Selling",
        // --- нові поля --- //
        "clientInvoice": 1,
        "invoiceType": "Invoice", 
        "invoiceSign": 1,
        "customerNumber": "1234",
        "customerCreatedAt": null,
        "invoiceFile": {
            "base64Content": "base64....",
            "filename": "інвойс.pdf"
        }
        // --- *** --- //
```

After creating the international express waybill, you will be able to add additional accompanying documents, retrieve the list of already uploaded documents, or download a file for verification.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/added-custom-invoice-attachments-for-business-shipments.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
