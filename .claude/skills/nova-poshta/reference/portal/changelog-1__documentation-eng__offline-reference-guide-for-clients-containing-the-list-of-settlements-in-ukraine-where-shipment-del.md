> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/offline-reference-guide-for-clients-containing-the-list-of-settlements-in-ukraine-where-shipment-del.md).

# Offline reference guide for clients containing the list of settlements in Ukraine where shipment del

<table data-header-hidden><thead><tr><th width="186"></th><th></th></tr></thead><tbody><tr><td><strong>Method name</strong></td><td>Settlement Prohibited Issuance Dictionary</td></tr><tr><td><strong>HTTP Method</strong></td><td>Returns a manifest with links to offline files containing settlements where shipment is prohibited to deliver in Ukraine.</td></tr><tr><td><strong>Route</strong></td><td>GET <code>/api.novapost.pl/v.1.0/dictionary/settlements/prohibited-issuance</code></td></tr><tr><td><strong>Autorization</strong></td><td><code>Authorization: JWT</code></td></tr></tbody></table>

#### Description <a href="#description" id="description"></a>

This API provides a daily-updated manifest of Ukrainian settlements where shipment delivery is prohibited. The manifest includes links to localized, gzipped JSON files with detailed settlement information and prohibition flags.

The files are available in both Ukrainian and English for localization support.

The files are updated each day at 5:00 UTC.

**Features:**

* Returns a JSON manifest with URLs to the updated settlement lists.
* Each list is a gzipped JSON file (`.json.gz`).
* Each file is localized (`locale="uk"` for Ukrainian, `locale="en"` for English).
* Settlement records include administrative region, coordinates, postal codes, alternative names, and prohibition flags.

#### Request headers <a href="#request-headers" id="request-headers"></a>

<table><thead><tr><th width="140">Header</th><th width="91">Type</th><th width="137">Required</th><th>Description</th></tr></thead><tbody><tr><td>Authorization</td><td>string</td><td>Yes</td><td><code>Bearer &#x3C;token></code>. Auth token of the client.</td></tr></tbody></table>

#### Response Example  <a href="#response-example" id="response-example"></a>

[https://api-portal.novapost.com/methods/methods/dictionaries](https://api-portal.novapost.com/methods/methods/dictionaries#get-dictionary-settlements-prohibited-issuance)

```
{
    "unix_time": 1766120417,
    "urls": [
        "https://api-cdn.novapost.com/dictionary/settlements/prohibited-issuance/en/settlements.json.gz",
        "https://api-cdn.novapost.com/dictionary/settlements/prohibited-issuance/uk/settlements.json.gz"
    ]
}
```

Use the URLs provided in the manifest to download the latest settlement lists for each supported locale.

#### Example of settlement structure in JSON (`en` locale) <a href="#example-of-settlement-structure-in-json-en-locale" id="example-of-settlement-structure-in-json-en-locale"></a>

```
[
  {
    "id": 108335,
    "name": "urban villagе Abrykosivka",
    "country": {
      "code": "UA",
      "name": "Ukraine"
    },
    "region": {
      "id": 964,
      "name": "Oleshkivskyi raion",
      "parent": {
        "id": 417,
        "name": "Khersonska oblast"
      }
    },
    "latitude": 46.488153,
    "longitude": 33.071226,
    "postCode1": "75134",
    "postCode2": "75134",
    "alternativeNames": [
      "abrykosivka",
      "селище абрикосівка",
      "selishche abrikosivka",
      "поселок абрикосовка",
      "poselok abrikosovka",
      "urban villagе abrykosivka",
      "urban village abrykosivka"
    ],
    "externalId": "0ddee0f8-4b3a-11e4-ab6d-005056801329",
    "prohibitedSending": false,
    "prohibitedIssuance": true
  }
  ]
```

#### Schema <a href="#schema" id="schema"></a>

Settlement Object Schema

#### Acceptable HTTP status codes response <a href="#acceptable-http-status-codes-response" id="acceptable-http-status-codes-response"></a>

<table><thead><tr><th width="131">HTTP-code</th><th width="114">Status</th><th>Description</th></tr></thead><tbody><tr><td>200</td><td>OK</td><td>Request successful. The server has responded as required.</td></tr><tr><td>404</td><td>Not Found</td><td>ErrorMessage: "Action_not_available"</td></tr></tbody></table>

#### cURL <a href="#curl" id="curl"></a>

```
curl --location 'https://api-stage.novapost.pl/v.1.0/dictionary/settlements/prohibited-issuance' \
--header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InByaXZhdGU6MmU1OWI1ZjEtYzIwYS00MWFlLTk3N2ItYzU5MWJiZmY2ODA5IiwidHlwIjoiSldUIn0.eyJhdF9oYXNoIjoiRG9SNVU5MmNaakRQT0dUbDJuWU94QSIsImF1ZCI6WyJmZWU5dVlpYUFoVzBvcG9vLmF1dGguYXBwcy5ub3ZhcG9zdC5jb20iXSwiYXV0aF90aW1lIjoxNzY2NDkxMTg3LCJjb3VudHJ5X2NvZGUiOiJVQSIsImVtYWlsIjoiIiwiZXhwIjoxNzY3MDk2MDI5LCJpYXQiOjE3NjY0OTEyMjksImlzcyI6Imh0dHBzOi8vYXV0aC1zdGFnZS5ub3ZhcG9zdC5jb20vIiwianRpIjoiZDVkOWZiNmItYmNlNy00YWYyLTgyMGYtYWQ5MGMxODQwMTI3IiwibmFtZSI6ItCQ0LzQsdGA0L7RgSDQnNCw0YDRltCw0L3QvdCwINCS0ZbQtNGB0YPRgtC90ZQiLCJwYXJ0bmVySW5mbyI6eyJjb3VudHJ5Q29kZSI6IiIsImRpdmlzaW9uSWQiOjAsInJvbGVzIjpudWxsfSwicGhvbmUiOiIzODA5MzkxNTM3OTkiLCJyYXQiOjE3NjY0OTExNjQsInJlZ2lvbl9jb2RlIjoiVUEiLCJzaWQiOiIxNGRjN2JmOC01YTUwLTRhM2MtYWE3My03ZjhkYjdkNjAwOTgiLCJzdWIiOiJlZjA0ZDZlZS0xNjE0LTQ5YzAtYmFiYS01NmY1NzQ2OThjNWEifQ.H5DNONyaiiA4kM7mkLK_AEFCCptJmjUg-8VcSm-eEsQ-ijt-PC3UXljlcyKpc1RF12ZtJhBPls1qiwh26PnFC8_cabE1N-XR-U6NpAlxC20hc0Ik5EFI9YMmfuJTQhVH1TwlFTo4TFmDO6Bf-UG5hrfwiw3dDRs-rs-Ql8SXKGvLx6_h8421rCaNKUoX--D4drMJjHljR82FyKnrSfdeu8E9MFHp5KeIEm6cwYasTPNEaHTK_njorlqvPFjvdIGHc9XpQv8naHQtDJJdb08LM2jbFApm86ceHRlmOUvEe2vZuWQgbcdhDUQYtLUlxboltlq6WGxq7IaooEXprt_ihRMkwHMvNyoqo4Wv7ZTUv2vi0zT7rtqlGHRsjPTMTtvH1lVMJEIsMy1nQL1aAr8gfKzU2Bt_B4zyBahu58TLtWhs1y27dZCmuXye8tdwnjAA5kwTxgNYXryZSwxepGyyH4m-mP_gUdY5rxgSbFQwIUyOsK9lr0avqob17860LqTHnUtLNykH6S9-95h1HWzJ8L4HE1ml_a2OtwGPo_dkkq4kt1AfSZF_sCCovHNoS4BlVVHuVK6WWD-SVc01WauNG4dwm5L3jxIyb79QuI52G93zqEy_h4LBBVf22jnTVjRzOCywcWAKVO0zDPkkK-KuNinqVvlVkWiffBNtDnK-fwY'
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/offline-reference-guide-for-clients-containing-the-list-of-settlements-in-ukraine-where-shipment-del.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
