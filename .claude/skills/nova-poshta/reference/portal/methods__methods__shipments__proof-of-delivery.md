> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/proof-of-delivery.md).

# Proof of delivery

## List attachments

> Returns a list of available shipment-related attachment files (photos and/or signature) for the specified shipment \*\*only if the shipment belongs to the authenticated client\*\*.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/{shipmentNumber}/attachments":{"get":{"tags":["Shipments"],"description":"Returns a list of available shipment-related attachment files (photos and/or signature) for the specified shipment **only if the shipment belongs to the authenticated client**.\n","parameters":[{"in":"path","name":"shipmentNumber","required":true,"description":"Shipment`s numbers.","schema":{"type":"string"}}],"responses":{"200":{"description":"Metadata structure","content":{"application/json":{"schema":{"type":"array","items":{"type":"object","properties":{"shipmentId":{"type":"integer","description":"Internal ID of the shipment."},"storageInfo":{"type":"object","description":"Contains information about the file.","properties":{"id":{"type":"string","description":"Unique file identifier {fileId} of the stored file."},"name":{"type":"string","description":"File name."},"documentType":{"type":"string","description":"Type of the document:\n- Signature\n- ProofOfDelivery\n"}}},"createdAt":{"type":"string","description":"Date and time when the file was uploaded. Date in ISO 8601 format."}}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"description":"Possible Error Responses","content":{"application/json":{}}},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"List attachments"}}}}
```

## Download attachment

> Returns the \*\*stream of the file\*\* specified by fileId, if the shipment belongs to the authenticated client.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/{shipmentNumber}/attachments/{fileId}":{"get":{"tags":["Shipments"],"description":"Returns the **stream of the file** specified by fileId, if the shipment belongs to the authenticated client.\n","parameters":[{"in":"path","name":"shipmentNumber","required":true,"description":"Shipment`s numbers.","schema":{"type":"string"}},{"in":"path","name":"fileId","required":true,"description":"Unique file identifier.","schema":{"type":"string"}}],"responses":{"200":{"description":"A file.","content":{"application/pdf":{"schema":{"type":"string","format":"binary"}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"description":"Unprocessable Entity","content":{"application/json":{}}},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Download attachment"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/proof-of-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
