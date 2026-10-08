> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/shipments/repeat-delivery.md).

# Repeat Delivery

## Create Repeat Delivery

> This method creates a Repeat Delivery request for a shipment that is currently stored at a long-term storage warehouse (LTS).\
> \
> Key rules:\
> \- Available only for shipments currently at long-term storage (LTS).\
> \- A maximum of 4 completed Repeat Delivery services is allowed per shipment.\
> \- A Repeat Delivery service cannot be ordered if the shipment already has a Redirecting, Return, or Repeat Delivery request in the \`NeedProcessing\` or \`InProgress\` status.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/shipments/modification/repeat-delivery":{"post":{"tags":["Shipments"],"summary":"Create Repeat Delivery","description":"This method creates a Repeat Delivery request for a shipment that is currently stored at a long-term storage warehouse (LTS).\n\nKey rules:\n- Available only for shipments currently at long-term storage (LTS).\n- A maximum of 4 completed Repeat Delivery services is allowed per shipment.\n- A Repeat Delivery service cannot be ordered if the shipment already has a Redirecting, Return, or Repeat Delivery request in the `NeedProcessing` or `InProgress` status.\n","requestBody":{"required":true,"content":{"application/json":{"schema":{"type":"object","required":["shipmentId","recipient"],"properties":{"shipmentId":{"type":"integer","description":"ID of the shipment at long-term storage.\n\n**🔻This field is required.**\n"},"payerType":{"type":"string","nullable":true,"description":"Identifies who is responsible for payment of the repeat delivery service.\n\nAllowed values:\n- Sender\n- Recipient\n- ThirdPerson\n\nIf the field is not provided, the order creator pays for the service.\n","enum":["Sender","Recipient","ThirdPerson"]},"payerContractNumber":{"type":"string","nullable":true,"description":"Required for B2B clients (legal entities with contract payment).\n"},"note":{"type":"string","description":"Any comment to the order.\n"},"recipient":{"type":"object","description":"Recipient details for re-delivery.\n\n**🔻This field is required.**\n","required":["name","phone","email","countryCode"],"properties":{"name":{"type":"string","description":"Recipient full name.\n\n**🔻This field is required.**\n"},"phone":{"type":"string","description":"Recipient phone number.\n\n**🔻This field is required.**\n"},"email":{"type":"string","description":"Recipient email.\n\n**🔻This field is required.**\n"},"companyTin":{"type":"string","nullable":true,"description":"Company tax identification number if the recipient is a Company.\n"},"companyName":{"type":"string","nullable":true,"description":"Company name.\n"},"countryCode":{"type":"string","description":"Delivery country code according to ISO 3166-1 alpha-2.\n\n**🔻This field is required.**\n","pattern":"^[A-Z]{2}$"},"eoriCode":{"type":"string","nullable":true,"description":"EORI code.\n"},"divisionId":{"type":"integer","nullable":true,"description":"Branch/postomat ID.\n\n**🔹This field is required if delivery is performed to a branch.**\n"},"settlementId":{"type":"integer","nullable":true,"description":"Settlement ID.\n"},"address":{"type":"object","nullable":true,"description":"Address object.\n"},"latitude":{"type":"number","nullable":true,"description":"Latitude coordinate.\n"},"longitude":{"type":"number","nullable":true,"description":"Longitude coordinate.\n"},"addressParts":{"type":"object","nullable":true,"description":"Address details for delivery.\n\nRequired if `divisionId` is null.\n\nIf `divisionId` is null, the delivery is performed to an address and the fields `city`, `street`, and `building` become required.\n","properties":{"city":{"type":"string","nullable":true,"description":"City name.\n\n**🔹This field is required if delivery is performed to an address.**\n"},"street":{"type":"string","nullable":true,"description":"Street name.\n\n**🔹This field is required if delivery is performed to an address.**\n"},"building":{"type":"string","nullable":true,"description":"Building number.\n\n**🔹This field is required if delivery is performed to an address.**\n"},"postCode":{"type":"string","nullable":true,"description":"Postal code.\n"},"region":{"type":"string","nullable":true,"description":"Region.\n"},"flat":{"type":"string","nullable":true,"description":"Flat/apartment number.\n"},"block":{"type":"string","nullable":true,"description":"Block.\n"},"note":{"type":"string","nullable":true,"description":"Additional delivery notes.\n"}}}}}}}}}},"responses":{"200":{"description":"Repeat Delivery order successfully created.","content":{"application/json":{"schema":{"type":"object","properties":{"cost":{"type":"number","description":"Delivery cost for the repeat delivery service."},"currency":{"type":"string","description":"Currency code according to ISO 4217."},"currencySymbol":{"type":"string","description":"Currency symbol."},"scheduledDeliveryDate":{"type":"string","format":"date-time","description":"Estimated delivery date in ISO 8601 format."}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"422":{"description":"Validation error.","content":{"application/json":{}}},"503":{"$ref":"#/components/responses/Time-out"}}}}}}
```

## Cancel Repeat Delivery

> The method cancels the current active Repeat Delivery request associated with the specified shipment.\
> \
> Use this method when you need to cancel a repeat delivery request that has not yet been processed. Cancellation is available only while the repeat delivery order is still being processed.\
> \
> \*\*Key rules:\*\*\
> \- Cancellation is available only while the repeat delivery order is still being processed.\
> \- Once a repeat delivery has been completed, it cannot be cancelled.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Shipments"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}}},"paths":{"/shipments/modification/repeat-delivery/delete/{shipmentID}":{"delete":{"tags":["Shipments"],"summary":"Cancel Repeat Delivery","description":"The method cancels the current active Repeat Delivery request associated with the specified shipment.\n\nUse this method when you need to cancel a repeat delivery request that has not yet been processed. Cancellation is available only while the repeat delivery order is still being processed.\n\n**Key rules:**\n- Cancellation is available only while the repeat delivery order is still being processed.\n- Once a repeat delivery has been completed, it cannot be cancelled.\n","operationId":"cancelRepeatDelivery","parameters":[{"name":"shipmentID","in":"path","required":true,"description":"The ID of the shipment for which the Repeat Delivery order should be cancelled.","schema":{"type":"integer"}}],"responses":{"200":{"description":"Repeat Delivery order successfully cancelled. Returns the cancellation timestamp.","content":{"application/json":{"schema":{"type":"object","properties":{"deletedAt":{"type":"string","description":"Timestamp when the Repeat Delivery order was cancelled.","pattern":"^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{6}Z$"}},"required":["deletedAt"]}}}},"422":{"description":"Unprocessable Entity. The cancellation cannot be processed.","content":{"application/json":{}}}}}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/shipments/repeat-delivery.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
