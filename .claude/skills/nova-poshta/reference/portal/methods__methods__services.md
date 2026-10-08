> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/services.md).

# Services

## Exchange rates

> This API method allows you to retrieve the exchange rates for different currencies based on a specific amount and your own currency. By providing the amount and the currency code, you can access the current exchange rates against various other currencies. The response will include the exchange rates for the specified amount in comparison to each currency, allowing you to see currency conversions.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Services"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/exchange-rates/conversion":{"post":{"tags":["Services"],"description":"This API method allows you to retrieve the exchange rates for different currencies based on a specific amount and your own currency. By providing the amount and the currency code, you can access the current exchange rates against various other currencies. The response will include the exchange rates for the specified amount in comparison to each currency, allowing you to see currency conversions.\n","requestBody":{"description":"Optional description in *Markdown*","required":true,"content":{"application/json":{"schema":{"type":"object","required":["date"],"properties":{"amount":{"type":"number","format":"float","description":"Amount of money to get sum in exchange rate for specified currency. Must include 2 decimal places."},"countryCode":{"type":"string","description":"Sender`s country code, according to the ISO 3166-1 Alpha-2 standard.","pattern":"^[A-Z]{2}$"},"currencyCode":{"type":"string","description":"Currency code to get exchange rate, according to the iso-4217 standard.","pattern":"^[A-Z]{3}$"},"date":{"type":"string","format":"date-time","description":"Operation date for exchange rate in ISO 8601 format."}}}}}},"responses":{"200":{"description":"shipments","content":{"application/json":{"schema":{"type":"object","properties":{"requestCurrency":{"type":"object","description":"Initial amount of money and currency for exchange.","properties":{"currencyCode":{"type":"string","description":"Currency code being exchanged, compliant with the ISO-4217 standard.","pattern":"^[A-Z]{3}$"},"amount":{"type":"number","format":"float","description":"Amount of money being exchanged. Must include 2 decimal places."}}},"mainCurrency":{"type":"object","description":"Calculation of the exchange amount in the currency of the country which countryCode was specified.","properties":{"currencyCode":{"type":"string","description":"Currency of the country which countryCode was specified, according to the iso-4217 standard.","pattern":"^[A-Z]{3}$"},"amount":{"type":"number","format":"float","description":"Amount of money in exchange rate of currency for specified country. Must include 2 decimal places."}}},"convertedCurrencies":{"type":"array","description":"List of the calculations for available current exchange rates against various other currencies based on a specified amount of money in request.","items":{"type":"object","properties":{"currencyCode":{"type":"string","description":"Currency code, according to the iso-4217 standard.","pattern":"^[A-Z]{3}$"},"amount":{"type":"number","format":"float","description":"Amount of money counted in currency`s exchange rate. Must include 2 decimal places."}}}}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Exchange rates"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/services.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
