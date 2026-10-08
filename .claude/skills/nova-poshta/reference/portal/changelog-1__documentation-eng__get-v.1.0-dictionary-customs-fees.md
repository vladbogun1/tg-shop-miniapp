> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/get-v.1.0-dictionary-customs-fees.md).

# GET v.1.0/dictionary/customs-fees/

### General Information <a href="#general-information" id="general-information"></a>

<table data-header-hidden><thead><tr><th width="172"></th><th></th></tr></thead><tbody><tr><td><strong>Method name</strong></td><td>The method for obtaining settings for the possibility of paying customs duties by the sender and the maximum value of the parcel by country</td></tr><tr><td><strong>Direction</strong></td><td>UA-EU</td></tr><tr><td><strong>HTTP Method</strong></td><td>GET</td></tr><tr><td><strong>Route(s)</strong></td><td><code>.../v.1.0/dictionary/customs-fees/{code}</code></td></tr><tr><td><strong>Autorization</strong></td><td><code>Authorization: Bearer jwt-token…</code></td></tr></tbody></table>

### Description <a href="#description" id="description"></a>

The method allows users to obtain country-specific settings to determine whether a sender from Ukraine will be able to pay customs duties and the maximum allowable value of the parcel in case of sending a parcel abroad.

### Path parameters <a href="#path-parameters" id="path-parameters"></a>

<table><thead><tr><th width="164">Name</th><th width="205">Type</th><th width="360">Description</th></tr></thead><tbody><tr><td>code</td><td>string</td><td><p>Alpha-code of country</p><p><strong>Example:</strong> PL - alpha-code of Poland</p></td></tr></tbody></table>

### Request and response parameters <a href="#request-and-response-parameters" id="request-and-response-parameters"></a>

Request `.../v.1.0/dictionary/customs-fees/{code}` Response `.../v.1.0/dictionary/customs-fees/{code}`

### Shema <a href="#shema" id="shema"></a>

<table><thead><tr><th width="169">Field</th><th width="129">Type</th><th>Description</th></tr></thead><tbody><tr><td>customFeeActive</td><td>boolean</td><td><p>Indication of the possibility of payment of customs duties by the sender.</p><p>Possible values</p><p><strong>true</strong> - payment is possible</p><p><strong>false</strong> - payment is not possible</p></td></tr><tr><td>declaredCost</td><td>number</td><td>The maximum amount of the parcel value in the currency of the recipient's country for which the sender can pay customs duties.</td></tr></tbody></table>

### Acceptable HTTP status codes response <a href="#acceptable-http-status-codes-response" id="acceptable-http-status-codes-response"></a>

<table><thead><tr><th width="131">HTTP-code</th><th width="193">Status</th><th>Description</th></tr></thead><tbody><tr><td>200</td><td>OK</td><td>Request successful. The server has responded as required.</td></tr><tr><td>422</td><td>Unprocessable entity</td><td>ErrorMessage: "The selected country is invalid."</td></tr></tbody></table>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/get-v.1.0-dictionary-customs-fees.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
