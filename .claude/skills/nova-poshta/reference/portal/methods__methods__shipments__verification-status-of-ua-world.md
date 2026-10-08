> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/verification-status-of-ua-world.md).

# Verification status of UA→World

## Get Verification status of UA→World shipments

> Returns verification statuses for international shipments for the UA→World direction (“international shipment from Ukraine to World”).\
> Responses and errors from the core system are proxied unchanged.\</br><br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/international/status":{"get":{"tags":["Shipments"],"summary":"Get Verification status of UA→World shipments","description":"Returns verification statuses for international shipments for the UA→World direction (“international shipment from Ukraine to World”).\nResponses and errors from the core system are proxied unchanged.</br>\n","parameters":[{"in":"query","name":"refs[]","required":true,"description":"Array of shipment references. Must not be empty. Pass as repeated query parameters. \nRaw query example: </br>\nrefs[]=`38e4fe97-9484-11f0-903f-005056bd9e02`'\n","schema":{"type":"array","items":{"type":"string"}},"style":"form","explode":true},{"in":"query","name":"state","required":true,"description":"Verification state filter. Allowed values are Order Closed allOrders.","schema":{"type":"string","enum":["Order","Closed","allOrders"]}}],"responses":{"200":{"description":"Verification status list","content":{"application/json":{"schema":{"type":"object","properties":{"jsonrpc":{"type":"string"},"result":{"type":"array","items":{"type":"object","properties":{"Ref":{"type":"string"},"State":{"type":"string","description":"e.g. NotVerified Verified Rejected"},"Date":{"type":"string","format":"date-time"},"StatusOfInternationalExpressWaybill":{"type":"string","description":"Human-readable verification status"},"Note":{"type":"string"},"ClosedDate":{"type":"string","format":"date-time"}}}},"id":{"oneOf":[{"type":"string"},{"type":"integer"}]}}}}}},"400":{"description":"Invalid request parameters","content":{"application/json":{"schema":{"type":"object","properties":{"message":{"type":"string"}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"503":{"$ref":"#/components/responses/Time-out"}}}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/verification-status-of-ua-world.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
