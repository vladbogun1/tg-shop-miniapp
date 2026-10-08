> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/post-shipments-calculations.md).

# POST /shipments/calculations

### General Information <a href="#general-information" id="general-information"></a>

<table data-header-hidden data-search="false"><thead><tr><th width="226"></th><th></th></tr></thead><tbody><tr><td><strong>Method Name</strong></td><td>Shipment calculation</td></tr><tr><td><strong>HTTP Method</strong></td><td>POST</td></tr><tr><td><strong>Route</strong></td><td><code>/v.1.0/shipments/calculations</code><br><code>/mobileapp/v.1.1/shipments/calculations</code><br><code>/ui/v.1.0/shipments/calculations</code> <br><br><code>ui/v.1.0/shipments/delivery-calculations</code><br><code>ui/site/v.1.0/shipments/delivery-calculations</code></td></tr><tr><td><strong>Change Type</strong></td><td>Changes to existing endpoint</td></tr><tr><td><strong>Authorization</strong></td><td><code>Authorization: Bearer jwt-token…</code></td></tr><tr><td><strong>Related Task</strong></td><td><a href="https://novaposhta.atlassian.net/browse/APIGW-1769">APIGW-1769: [APIGW] Розрахунок об'ємної ваги [дільник на 5000], зміна формули для POST /shipments/calculationsDone</a></td></tr><tr><td><strong>Product</strong></td><td>API Gateway</td></tr><tr><td><strong>Data Source</strong></td><td> </td></tr><tr><td><strong>System/module</strong></td><td>client-api, Мobile App, UI <em>(</em><code>/ui/</code> <code>/mobileapp/</code> <code>/v.1.0/</code>)</td></tr></tbody></table>

### Description <a href="#description" id="description"></a>

For endpoint shipments/calculations (`POST`, `/shipments/calculations`), the logic of volumetric weight (`volumetricWeight`) calculation is changed for shipments related to **Moldova**.

#### Essence of the change <a href="#essence-of-the-change" id="essence-of-the-change"></a>

* **BEFORE:**\
  For all countries volumetric weight was calculated as:\
  `volumetricWeight = length * width * height / 4000`
* **AFTER:**
  * For **shipments related to Moldova**, volumetric weight must be calculated as:\
    `volumetricWeight = length * width * height / 5000`. See rules below.
  * For **all other shipments** the formula with divisor **4000** remains unchanged.

`volumetricWeight` is calculated on API Gateway side even if `parcels[].volumetricWeight` is not sent in the request or is sent as `null`.

&#x20;

#### Rules when divisor 5000 must be applied (Moldova) <a href="#rules-when-divisor-5000-must-be-applied-moldova" id="rules-when-divisor-5000-must-be-applied-moldova"></a>

The formula with divisor **5000** is used if at least one of the following cases is true:

1. Domestic shipments within Moldova
   * Sender and recipient are in Moldova
   * `sender.countryCode = "MD"`
   * `recipient.countryCode = "MD"`
2. Shipments from Moldova and payer = sender or third person with a Moldovan contract
   * `sender.countryCode = "MD"`
   * Payer of the shipment:
     * `payerType = "Sender"` **OR**
     * `payerType = "ThirdPerson"` and the payer’s contract is **Moldovan**
3. Shipments to Moldova and payer = recipient or third person with a Moldovan contract
   * `recipient.countryCode = "MD"`
   * Payer of the shipment:
     * `payerType = "Recipient"` **OR**
     * `payerType = "ThirdPerson"` and the payer’s contract is **Moldovan**

&#x20;

#### Determining a “Moldovan” contract for ThirdPerson <a href="#determining-a-moldovan-contract-for-thirdperson" id="determining-a-moldovan-contract-for-thirdperson"></a>

If `payerType = "ThirdPerson"`, to determine that the payer is a third party under a **Moldovan** contract:

1. Take contract number from `payerContractNumber` in `/shipments` request.
2. Call `/api/contracts/` with:
   * `numbers[] = {payerContractNumber}`
   * `countryCodes[] = MD`
3. If the response for filter `countryCodes[] = MD` contains a contract with this number – the contract is considered Moldovan.\
   If not – the contract is **not** Moldovan and the formula with divisor 5000 **must not** be applied.

Example:

`GET /api/contracts/?numbers[]=GNPMD-00020861&countryCodes[]=MD`


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/post-shipments-calculations.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
