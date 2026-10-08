> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/print-documents/invoice.md).

# Invoice

## Print Shipment Documents

> This API method allows you to retrieve a transportation document in PDF format by providing the document number.\
> Depending on the selected document type, the generated PDF may contain a customs declaration, commercial invoice, or another transportation-related document.\
> By specifying the document number in the request, you can generate a PDF file containing the requested document for viewing, printing, or further processing.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/print":{"get":{"tags":["Shipments"],"description":"This API method allows you to retrieve a transportation document in PDF format by providing the document number.\nDepending on the selected document type, the generated PDF may contain a customs declaration, commercial invoice, or another transportation-related document.\nBy specifying the document number in the request, you can generate a PDF file containing the requested document for viewing, printing, or further processing.\n","parameters":[{"in":"query","name":"numbers[]","description":"Shipment numbers. Can accept either a single number or an array of numbers.","schema":{"type":"string"}},{"in":"query","name":"type","description":"Type of document to be printed.\n\n- `international`: for customs declaration/invoice\n- `invoice`: for commercial invoice\n","schema":{"type":"array","items":{"type":"string","enum":["international","invoice"]}}},{"in":"query","name":"printSizeType","required":false,"description":"Selection of document size.\n\nIf not provided: \n- `type=international` and `type=invoice` use `size_A4` by default. \n","schema":{"type":"array","items":{"type":"string","enum":["size_A4"]}}}],"responses":{"200":{"description":"A PDF file.","content":{"application/pdf":{"schema":{"type":"string","format":"binary"}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Print Shipment Documents"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/print-documents/invoice.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
