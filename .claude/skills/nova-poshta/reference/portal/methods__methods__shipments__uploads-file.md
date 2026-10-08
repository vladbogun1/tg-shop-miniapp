> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/uploads-file.md).

# Uploads file

## Shipments uploads file

> Uploads supporting documents to a specific shipment by its ID.\
> This method is used for attaching invoices, product specifications, customs declarations, or other shipment-related documents required for processing and clearance.\
> Files are stored and linked to the shipment, ensuring better traceability and compliance.\
> \
> ⚠️ Region restriction:\</br>\
> This method is available only for European shipments (EU/EU and EU/UA directions).\</br>\
> It is not available for shipments originating from Ukraine.\
> \
> File naming:\
> • If the "fileName" parameter is provided, the uploaded file will be stored with that name.\
> • If "fileName" is not provided, the default file name will be set to "invoice".\
> \
> Use cases:\
> 1\) "I want to upload a client invoice in PDF to shipment 980911" - send the base64-encoded content in "file", set \`"fileName": "invoice.pdf"\`.\
> 2\) "I want to attach a product photo in JPEG" - encode the photo in base64, set \`"fileName": "product-photo.jpeg"\`.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/uploads/{id}":{"post":{"tags":["Shipments"],"description":"Uploads supporting documents to a specific shipment by its ID.\nThis method is used for attaching invoices, product specifications, customs declarations, or other shipment-related documents required for processing and clearance.\nFiles are stored and linked to the shipment, ensuring better traceability and compliance.\n\n⚠️ Region restriction:</br>\nThis method is available only for European shipments (EU/EU and EU/UA directions).</br>\nIt is not available for shipments originating from Ukraine.\n\nFile naming:\n• If the \"fileName\" parameter is provided, the uploaded file will be stored with that name.\n• If \"fileName\" is not provided, the default file name will be set to \"invoice\".\n\nUse cases:\n1) \"I want to upload a client invoice in PDF to shipment 980911\" - send the base64-encoded content in \"file\", set `\"fileName\": \"invoice.pdf\"`.\n2) \"I want to attach a product photo in JPEG\" - encode the photo in base64, set `\"fileName\": \"product-photo.jpeg\"`.\n","parameters":[{"name":"id","in":"path","description":"Unique identifier of the shipment to which the files are attached.</br>\nThis value represents the `shipmentId` of the European system.</br>\nUsing a Ukrainian shipment number will result in a validation error.\n","required":true,"schema":{"type":"integer","format":"int32"}}],"requestBody":{"description":"JSON body containing the base64-encoded file and optional file name.","required":true,"content":{"application/json":{"schema":{"type":"object","properties":{"file":{"type":"string","description":"Base64-encoded document file (PDF, JPEG, or other supported formats)."},"fileName":{"type":"string","description":"Optional file name. Defaults to \"invoice\" if not provided."}}}}}},"responses":{"201":{"description":"File upload result","content":{"application/json":{"schema":{"type":"object","properties":{"success":{"type":"boolean","description":"Indicates whether the file upload was successful."}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Shipments uploads file"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/uploads-file.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
