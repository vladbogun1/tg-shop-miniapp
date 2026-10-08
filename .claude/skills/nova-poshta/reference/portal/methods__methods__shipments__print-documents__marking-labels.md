> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/print-documents/marking-labels.md).

# Marking labels

## Print Shipment Documents

> This API method allows you to retrieve a shipment marking label in PDF format by providing the document number.\
> The shipment marking label is a printable document that clients can attach or affix to their cargo when sending it.\
> By specifying the document number in the request, you can generate a PDF file containing the shipment marking label for easy printing.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/print":{"get":{"tags":["Shipments"],"description":"This API method allows you to retrieve a shipment marking label in PDF format by providing the document number.\nThe shipment marking label is a printable document that clients can attach or affix to their cargo when sending it.\nBy specifying the document number in the request, you can generate a PDF file containing the shipment marking label for easy printing.\n","parameters":[{"in":"query","name":"numbers[]","description":"Shipment numbers. Can accept either a single number or an array of numbers. When `type=marking` is used, only one number is allowed per request.","schema":{"type":"string"}},{"in":"query","name":"type","description":"Type of document to be printed.\n\n- `marking`: for shipment marking labels (`100x100`, `100x150`, or other formats depending on the shipment)\n","schema":{"type":"array","items":{"type":"string","enum":["marking"]}}},{"in":"query","name":"printSizeType","required":false,"description":"Selection of document size.\n\nFor `type=marking`, this parameter defines the marking print request type, but does not guarantee the final physical PDF format returned by the service. \n\nThe final label format is determined automatically according to the created shipment. \n\nIf not provided: \n- `type=marking` uses the internal marking print logic. \n\nBackward compatibility for `100_100` and `size_100_100` values is preserved.\n","schema":{"type":"array","items":{"type":"string","enum":["size_100_100"]}}},{"in":"query","name":"deliveryType","description":"Type of delivery flow for marking document printing. Applicable only for `type=marking`.\n\n- `Pickup`: first mile\n- `Shipment`: last mile\n","required":false,"schema":{"type":"string","enum":["Pickup","Shipment"]}}],"responses":{"200":{"description":"A PDF file.","content":{"application/pdf":{"schema":{"type":"string","format":"binary"}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Print Shipment Documents"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/print-documents/marking-labels.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
