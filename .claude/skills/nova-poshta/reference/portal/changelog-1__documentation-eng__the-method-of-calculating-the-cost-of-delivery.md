> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/the-method-of-calculating-the-cost-of-delivery.md).

# The method of calculating the cost of delivery

### General Information <a href="#general-information" id="general-information"></a>

<table data-header-hidden><thead><tr><th width="194"></th><th></th></tr></thead><tbody><tr><td><strong>Method name</strong></td><td>The method of calculating the cost of delivery</td></tr><tr><td><strong>Direction</strong></td><td>UA-EU (US)</td></tr><tr><td><strong>HTTP Method</strong></td><td>POST</td></tr><tr><td><strong>Route(s)</strong></td><td><p><code>.../ui/v.1.0/shipments/calculations</code></p><p><code>.../v.1.0/shipments/calculations</code></p><p><code>.../ui/site/v.1.0/shipments/delivery-calculations</code></p><p><code>.../ui/v.1.0/shipments/delivery-calculations</code></p><p><code>.../mobileapp/v.1.1/shipments/calculations</code></p></td></tr><tr><td><strong>Autorization</strong></td><td><code>Authorization: Bearer jwt-token…</code></td></tr><tr><td><strong>Related Task</strong></td><td><a href="https://novaposhta.atlassian.net/browse/APIGW-1256">APIGW-1256: [API GW] Розрахунок вартості оплати митних платежів відправником (DDP) // -->PayerFeesCustoms Done</a></td></tr></tbody></table>

### Description <a href="#description" id="description"></a>

The method allows users to receive information about the cost of delivery, the cost of paying for customs services, and the cost of other related services.

### Request and response parameters <a href="#request-and-response-parameters" id="request-and-response-parameters"></a>

Request `.../v.1.0/shipments/calculations` Response `.../v.1.0/shipments/calculations`

### Changes in the method <a href="#changes-in-the-method" id="changes-in-the-method"></a>

**Previous version**

`{     "payerType": "Sender",     "currency": "USD",     "incoterm": "DDP",     "cost": 90,     "invoice": {} -- not used ///`

**Current version**

`{payerType": "Sender",     "invoice": { "incoterm": "DDP", "currency": "USD", "payerFeesCustoms": "Sender", "cost": 101 /// } ///`

&#x20;

If you want to use parameter “incoterm” = “DDP”, you need to specify parameters "currency", "cost". Otherwise, “incoterm” = “DDP” will be ignored.

### Chema  <a href="#chema" id="chema"></a>

<table data-search="false"><thead><tr><th width="205">Field</th><th width="122">Type</th><th>Description</th></tr></thead><tbody><tr><td><strong>status</strong></td><td>enum</td><td><p>Status of shipment</p><p><strong>Allowed</strong>: ReadyToShip</p></td></tr><tr><td><strong>payerType</strong></td><td>enum</td><td><p>Identifies who is responsible for the payment of delivery services. Determines which party bears the cost: Sender, Recipient, or ThirdPerson. Required payerContractNumber for shipments within Europe or from Europe to Ukraine.</p><p><strong>Allowed</strong>: Sender┃Recipient┃ThirdPerson</p><p><em>* for route</em> <code>/shipments/delivery-calculations</code> <em>- the request response will always return</em> <code>payerType</code> = <code>Sender</code></p></td></tr><tr><td><strong>payerContractNumber</strong></td><td>string</td><td>Required when payerType is ThirdPerson for shipments within Europe or from Europe to Ukraine. Specifies the contract number of the third-party payer (e.g., CNPP-00001797).</td></tr><tr><td><strong>invoice</strong></td><td>object</td><td>Informatoin for calculating shipping costs and customs payments</td></tr><tr><td><strong>incoterm</strong></td><td>enum</td><td><p>Type of tax calculation.</p><p><strong>Example</strong>: DAP | DDP.</p><ul><li><em>DAP - Delivered At Place</em></li><li><em>DDP - Delivered Duty Paid</em></li></ul></td></tr><tr><td><strong>currency</strong></td><td>enum</td><td>Сurrency code</td></tr><tr><td><strong>cost</strong></td><td>number</td><td><p>Declared value of shipment for customs duty deduction. Also indicates maximum compensation in case of loss/damage.</p><p>Requiered if <strong>incoterm</strong> = “DDP”</p><p><strong>Limit</strong>: Min. 1</p></td></tr><tr><td><strong>payerFeesCustoms</strong></td><td>enum</td><td><p>Identifies who is responsible for the customs payments. Determines which party bears the cost: Sender, Recipient, or ThirdPerson.</p><p><strong>Allowed</strong>: Sender┃Recipient┃ThirdPerson</p></td></tr><tr><td><strong>parcels</strong></td><td>array of object</td><td>An array of parcel objects representing distinct packages within the shipment, including dimensions, weight, and details for delivery cost calculation.</td></tr><tr><td><strong>cargoCategory</strong></td><td>enum</td><td><p>Specifies the type of shipment. Categories: parcel, documents, cargo. Affects shipping method, cost, and documentation.</p><p><strong>Allowed</strong>: parcel┃documents┃cargo</p></td></tr><tr><td><strong>insuranceCost</strong></td><td>number</td><td><p>Declared value of shipment for insurance coverage. Indicates maximum compensation in case of loss/damage.</p><p><strong>Constraints</strong>: Min 1</p></td></tr><tr><td><strong>rowNumber</strong></td><td>integer</td><td><p>Sequential identifier for each parcel in the shipment.</p><p>If only one parcel, value = 1.</p><p><strong>Constraints</strong>: Min 1</p></td></tr><tr><td><strong>width</strong></td><td>integer</td><td><p>Parcel width in millimeters. Used to calculate volume.</p><p><strong>Constraints</strong>: Min 1</p></td></tr><tr><td><strong>length</strong></td><td>integer</td><td><p>Parcel length in millimeters. Used to calculate volume.</p><p><strong>Constraints</strong>: Min 1</p></td></tr><tr><td><strong>height</strong></td><td>integer</td><td><p>Parcel height in millimeters. Used to calculate volume.</p><p><strong>Constraints</strong>: Min 1</p></td></tr><tr><td><strong>actualWeight</strong></td><td>integer</td><td><p>Real parcel weight in grams. Round to nearest 10 g before sending.</p><p><strong>Constraints</strong>: Min 1┃Max 2147483647</p></td></tr><tr><td><strong>sender</strong></td><td>object</td><td>Information about the sender. Includes origin details, affects logistics and cost calculations.</td></tr><tr><td><strong>divisionNumber</strong></td><td>string┃null</td><td>Optional sender post office division number. Interchangeable with divisionId/ postCode</td></tr><tr><td><strong>divisionId</strong></td><td>integer┃null</td><td>Optional sender division code. Interchangeable with divisionNumber / postCode</td></tr><tr><td><strong>addressParts</strong></td><td>object</td><td>Required when shipping from an address. Contains detailed address components.</td></tr><tr><td><strong>postCode</strong></td><td>string</td><td><p>Postal/ZIP code of sender.</p><p><strong>Constraints</strong>: Max 10 chars</p></td></tr><tr><td><strong>recipient</strong></td><td>object</td><td>Information about the party receiving the shipment.</td></tr><tr><td><strong>countryCode</strong></td><td>string</td><td><p>ISO 3166-1 Alpha-2 code for recipient’s country.</p><p><strong>Pattern</strong>: ^[A-Z]{2}$</p></td></tr><tr><td><strong>divisionNumber</strong></td><td>string┃null</td><td>Optional recipient post office division number. Interchangeable with divisionId / postCode</td></tr><tr><td><strong>divisionId</strong></td><td>integer┃null</td><td>Optional recipient division code. Interchangeable with divisionNumber / postCode</td></tr><tr><td><strong>addressParts</strong></td><td>object</td><td>Required when delivering to a specific address. Contains detailed address fields.</td></tr><tr><td><strong>postCode</strong></td><td>string</td><td><p>Postal/ZIP code for recipient.</p><p><strong>Constraints</strong>: Max 10 chars</p></td></tr></tbody></table>

### Acceptable HTTP status codes response <a href="#acceptable-http-status-codes-response" id="acceptable-http-status-codes-response"></a>

<table><thead><tr><th width="123">HTTP-code</th><th width="189">Status</th><th>Description</th></tr></thead><tbody><tr><td>200</td><td>OK</td><td>Request successful. The server has responded as required.</td></tr><tr><td>422</td><td>Unprocessable entity</td><td>The request was well-formed but had semantic errors + the reason for the error</td></tr></tbody></table>

{% @nova-post-newsletter/subscribe %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/the-method-of-calculating-the-cost-of-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
