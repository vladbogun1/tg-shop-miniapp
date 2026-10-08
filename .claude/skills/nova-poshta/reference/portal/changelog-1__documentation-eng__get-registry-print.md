> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/get-registry-print.md).

# GET /registry/print

### General Information <a href="#general-information" id="general-information"></a>

<table data-header-hidden><thead><tr><th width="275"></th><th></th></tr></thead><tbody><tr><td><strong>Method name</strong></td><td>The method of printing parcel registers</td></tr><tr><td><strong>Direction</strong></td><td>EU, UA</td></tr><tr><td><strong>HTTP Method</strong></td><td>GET</td></tr><tr><td><strong>Route(s)</strong></td><td><code>/v.1.0/registry/print/?id={id}</code></td></tr><tr><td><strong>Autorization</strong></td><td><code>Authorization: Bearer jwt-token…</code></td></tr></tbody></table>

### Description <a href="#description" id="description"></a>

The method allows users to receive a generated PDF file of a registry for further printing.

**European registers** use only general registry type printing.\
**Ukrainian registers** (UA-World) can print\
\- general registry and\
\- international express waybills (IEW),\
\- markings of international express waybills,\
\- invoices of international express waybills.

### Path parameters <a href="#path-parameters" id="path-parameters"></a>

<table><thead><tr><th width="139">Name</th><th width="97">Type</th><th width="171">Value</th><th>Description</th></tr></thead><tbody><tr><td>id</td><td>number</td><td> </td><td>Registry identifier in the OM system (mandatory)</td></tr><tr><td>type*</td><td>string</td><td><ul><li><code>international</code></li><li><code>invoice</code></li><li><code>marking</code></li></ul></td><td>type of printed format (optional)</td></tr><tr><td>printSizeType*</td><td>string</td><td><ul><li><code>size_100_100</code></li></ul></td><td>size of printed marking, mandatory for<br><code>type</code>= <code>marking</code><br><br></td></tr><tr><td>copies**</td><td>number</td><td> </td><td>Number of copies of printed document (optional)<br>Default value: 1</td></tr></tbody></table>

\* - applicable only for registers in direction Ukraine - World\
\*\* - applicable only for registers **excluding** direction Ukraine-World and Ukraine-Ukraine

### Request and response parameters <a href="#request-and-response-parameters" id="request-and-response-parameters"></a>

Request `.../v.1.0/registry/print/?id={id}` Response `.../v.1.0/registry/print/?id={id}`

### Acceptable HTTP status code  <a href="#acceptable-http-status-codes-response" id="acceptable-http-status-codes-response"></a>

<table><thead><tr><th width="125">HTTP-code</th><th width="187">Status</th><th>Description</th></tr></thead><tbody><tr><td>200</td><td>OK</td><td>Request successful. The server has responded as required.</td></tr><tr><td>422</td><td>Unprocessable entity</td><td>ErrorMessage: "The id field must be a number".</td></tr><tr><td>500</td><td>Internal Server Error</td><td>The specified registry was not found. ErrorMessage:"validation.invalid"</td></tr></tbody></table>

&#x20;


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/get-registry-print.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
