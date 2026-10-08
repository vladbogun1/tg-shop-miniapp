> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/the-method-for-obtaining-a-link-to-the-online-payment-form.md).

# The method for obtaining a link to the online payment form

<table data-header-hidden><thead><tr><th width="219"></th><th></th></tr></thead><tbody><tr><td><strong>Method name</strong></td><td>The method for obtaining a link to the online payment form</td></tr><tr><td><strong>Direction</strong></td><td>UA-World</td></tr><tr><td><strong>HTTP Method</strong></td><td>POST - to receive a payment link</td></tr><tr><td><strong>Route(s)</strong></td><td>POST <code>…/mobileapp/v.1.1/payments/{number}</code></td></tr><tr><td><strong>Autorization</strong></td><td><code>Authorization: Bearer id-token…</code></td></tr></tbody></table>

### Description <a href="#description" id="description"></a>

The method allows the user to receive a link to an online payment form for services related to the parcel.

### Path parameters <a href="#path-parameters" id="path-parameters"></a>

| Name   | Type   | Description          |
| ------ | ------ | -------------------- |
| number | string | Unique parcel number |

### Request and response parameters <a href="#request-and-response-parameters" id="request-and-response-parameters"></a>

Request `.../mobileapp/v.1.1/payments/{number}` Response `.../mobileapp/v.1.1/payments/{number}`

### Sсhema <a href="#sshema" id="sshema"></a>

<table><thead><tr><th width="218">Field</th><th width="211">Type</th><th>Description</th></tr></thead><tbody><tr><td>paymentUrl</td><td>string</td><td>Unique link to payment</td></tr><tr><td>sessionId</td><td>string</td><td>Unique session number</td></tr></tbody></table>

### Acceptable HTTP status codes response <a href="#acceptable-http-status-codes-response" id="acceptable-http-status-codes-response"></a>

<table><thead><tr><th width="125">HTTP-code</th><th width="189">Status</th><th>Description</th></tr></thead><tbody><tr><td>200</td><td>OK</td><td>Request successful. The server has responded as required.</td></tr><tr><td>422</td><td>Unprocessable entity</td><td>ErrorMessage: "Action_not_available"</td></tr></tbody></table>

### &#x20;Schema of connection <a href="#schema-of-connection" id="schema-of-connection"></a>

&#x20;

### Логіка розрахунку для посилок де Sender.Country = UA <a href="#logika-rozrakhunku-dlya-posilok-de-sender.country-ua" id="logika-rozrakhunku-dlya-posilok-de-sender.country-ua"></a>

1. Після отримання масиву даних з трекінг сервісу (sub-request на TS) вибираються всі operation\_type зі статусом “NeedPay”

```
"services": [
				{
					"id": null,
					"shipment_parcel_row_number": 1,
					"service_id": "115772d3-2f2e-4a03-b207-99a95f93c531",
					"service_type": "",
					"service_name": "Доставка посилок по Україні",
					"service_code": "",
					"parcel_number": "59001504113479",
					"payer_type": "Recipient",
					"payment_status": "NeedPay",
					"amount": 2,
					"price": 110,
					"discount": 16.5,
					"cost": 93.5,
					"cost_before_check": null,
					"paid": 0,
					"currency_code": "UAH",
					"additional_parameters": {
						"operation_type": "PaymentForParcel"
					}
				},
				{
					"id": null,
					"shipment_parcel_row_number": 1,
					"service_id": "a50b6f22-57c5-40bb-a015-052c21f00292",
					"service_type": "",
					"service_name": "Пакування відправлення",
					"service_code": "",
					"parcel_number": "59001504113479",
					"payer_type": "Recipient",
					"payment_status": "NeedPay",
					"amount": 1,
					"price": 30,
					"discount": 0,
					"cost": 30,
					"cost_before_check": null,
					"paid": 0,
					"currency_code": "UAH",
					"additional_parameters": {
						"operation_type": "PaymentForAdditionalServices"
					}
				},
			/*цей блок враховуватися не буде*/	
               {
					"id": null,
					"shipment_parcel_row_number": 1,
					"service_id": "3ab6e3b4-dcd7-11e8-ad0d-005056b24375",
					"service_type": "",
					"service_name": "Коробка (5 кг) з наповнювачем",
					"service_code": "",
					"parcel_number": "59001504113479",
					"payer_type": "Recipient",
					"payment_status": "",
					"amount": 1,
					"price": 0,
					"discount": 0,
					"cost": 0,
					"cost_before_check": null,
					"paid": 0,
					"currency_code": "UAH",
					"additional_parameters": null
				}
			],

```

1. operation\_type групуються (сума по **cost** складається в рамках operation\_type)
2. Формується json наступного вигляду і передається на api Nova Pay (...novapay.ua/v1/init)

```
{
	"client_first_name": "Олександра",
	"client_last_name": "Олександренко",
	"client_patronymic": "Олександрівна",
	"client_phone": "+380501231212",
	"client_email": null,
	"metadata": {
		"payer_type": "Recipient",
		"source": "mobile",
		"client_verified": "1",
		"client_npuid": "302264134C4EFD85-7AEBC02383A3048B68C3F17779416A2F6C0C2BB6",
		"ref_settlement_recipient": "db5c88ea-391c-11dd-90d9-001a92567626",
		"ref_settlement_sender": "db5c88f0-391c-11dd-90d9-001a92567626"
	},
	"delivery_metadata": {
		"ref_id": "5af75fb4-c528-11f0-92ca-48df37b91f4a",
		"express_waybill": "51212173237380",
		"medium": "parsel_machine",
		"created_at": "2025-11-19"
	},
	"recipients": [
		{
			"type": "legal",
			"amount": 105, -- сума по cost складається в рамках operation_type
			"payment_type": "PaymentForParcel", -- operation_type
			"use_hold": true, -- ознака чи буде сума заморожена
			"identifier": "31316718" -- код ЄРДПОУ на чий рахунок впадуть кошти  
		},
		{
			"type": "legal",
			"amount": 10,
			"payment_type": "PaymentForAdditionalServices",
			"use_hold": true,
			"identifier": "31316718"
		}
	]
}
```

### Список всіх можливих операцій <a href="#spisok-vsikh-mozhlivikh-operacii" id="spisok-vsikh-mozhlivikh-operacii"></a>

<table data-search="false"><thead><tr><th width="324">operation_type(TS)/payment_type</th><th width="207">use_hold</th><th width="200">identifier</th></tr></thead><tbody><tr><td>PaymentForInternationalDelivery</td><td>false</td><td><code>38130410</code></td></tr><tr><td>PaymentForAdditionalServices</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForServices</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForParcel</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForAfterPayment</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForCommissionBroker</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForCustomsPayments</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForRedirecting</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForReturn</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForStorage</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForInternationalDeliveryNPU</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForLinehaul</td><td>true</td><td><code>31316718</code></td></tr><tr><td>MoneyTransfer</td><td>true</td><td><code>31316718</code></td></tr><tr><td>PaymentForAfterPayment</td><td>true</td><td><code>31316718</code></td></tr><tr><td>InternationalDeliveryNPUVAT0</td><td>true</td><td><code>31316718</code></td></tr><tr><td>InternationalAdditionalServices</td><td>true</td><td><code>31316718</code></td></tr></tbody></table>

&#x20;


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/the-method-for-obtaining-a-link-to-the-online-payment-form.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
