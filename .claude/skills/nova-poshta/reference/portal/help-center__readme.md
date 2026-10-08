> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/help-center/readme.md).

# Help Center

## Support & Resources

{% columns %}
{% column valign="bottom" %}
**👨‍💻 Technical Support**

For API integration questions, request errors, or technical issues, please use our ticketing system.\
<servicedesk@novapost.com>
{% endcolumn %}

{% column valign="middle" %}
🧩 **Business Support**

Assistance with integrating Nova Post services into your business processes and консультації щодо API connectivity.\
<api.consult@novapost.com>
{% endcolumn %}
{% endcolumns %}

#### &#x20;Sales Contacts

Select your country or region to get in touch with the local Nova Post sales team.

{% hint style="info" %}
Can’t find your country? Please contact our general sales support at <sales@novapost.com>
{% endhint %}

### Sales department contacts

<details>

<summary>🌍 Europe</summary>

<table><thead><tr><th width="164">Region</th><th>Number</th><th>Email</th></tr></thead><tbody><tr><td>Poland</td><td>+48 532 697 974</td><td><a href="mailto:wspolpraca@novapost.pl">wspolpraca@novapost.pl</a></td></tr><tr><td>Czech Republic</td><td>+420 776 060 379</td><td><a href="mailto:sale_cz@novapost.com">sale_cz@novapost.com</a></td></tr><tr><td>Germany</td><td>+49 170 731 6517</td><td><a href="mailto:sale_de@novapost.com">sale_de@novapost.com</a></td></tr><tr><td>Hungary</td><td>+36 96 800 609</td><td><a href="mailto:support_hu@novapost.com">support_hu@novapost.com</a></td></tr><tr><td>Italy</td><td>+39 029 994 0609</td><td><a href="mailto:support_it@novapost.com">support_it@novapost.com</a></td></tr><tr><td>Spain</td><td>+34 930 474 609</td><td><a href="mailto:support_es@novapost.com">support_es@novapost.com</a></td></tr><tr><td>Romania</td><td>+40 373 785 207</td><td><a href="mailto:support_ro@novapost.com">support_ro@novapost.com</a></td></tr><tr><td>Slovakia</td><td>+421 552 302 609</td><td><a href="mailto:support_sk@novapost.com">support_sk@novapost.com</a></td></tr><tr><td>France</td><td>+33 159 420 609</td><td><a href="mailto:support_fr@novapost.com">support_fr@novapost.com</a></td></tr><tr><td>Netherlands</td><td>+31 203 695 606</td><td><a href="mailto:support_nl@novapost.com">support_nl@novapost.com</a></td></tr><tr><td>Great Britain</td><td>+44 180 330 0609</td><td><a href="http://%D1%96khmelevskyi.b@novapost.com/">іkhmelevskyi.b@novapost.com</a></td></tr><tr><td>Austria</td><td>-</td><td><a href="mailto:support_at@novapost.com">support_at@novapost.com</a></td></tr></tbody></table>

</details>

<details>

<summary>🌐 Baltic region</summary>

<table><thead><tr><th width="168">Region</th><th>Number</th><th>Email</th></tr></thead><tbody><tr><td>Baltic region</td><td>+37 123 557 979</td><td><a href="mailto:balticsales@novapost.com">balticsales@novapost.com</a></td></tr></tbody></table>

</details>

<details>

<summary>🤝 Partnership Requests</summary>

<table><thead><tr><th width="186.20001220703125">Request Type</th><th>Number</th></tr></thead><tbody><tr><td>Partnership Requests</td><td> <a href="mailto:partner_np_europa@novaposhta.ua">partner_np_europa@novaposhta.ua</a></td></tr></tbody></table>

</details>

#### ❓FAQ

<details>

<summary><strong>How can I get access to the Nova Post API?</strong></summary>

To access the Nova Post API, you must sign a contract with Nova Post.\
After the agreement is completed, the designated responsible person will be able to generate an API key in the personal account.

</details>

<details>

<summary><strong>How can I obtain an API key?</strong></summary>

The API key can be generated in your personal account once API access has been activated.\
The key is used to generate a JWT token for request authorization.

</details>

<details>

<summary><strong>How does authorization work?</strong></summary>

Authorization is performed using a JWT token.\
The JWT token is generated using your API key and must be included in the request header:

```
Authorization: Bearer {JWT_TOKEN}
```

Authorization: Bearer {JWT\_TOKEN}

</details>

<details>

<summary><strong>Is a test environment (sandbox) available?</strong></summary>

Yes, a sandbox environment is available for testing and validating your integration before moving to production.

</details>

<details>

<summary><strong>What request format is used?</strong></summary>

The API uses JSON format for both requests and responses.

```
Content-Type: application/json
```

</details>

<details>

<summary><strong>Where can I find the list of available methods?</strong></summary>

The full list of available methods is provided in the **API Methods** section, where you can find request parameters, examples, and possible responses.

</details>

<details>

<summary><strong>Where can I obtain system values (branches, currencies, etc.)?</strong></summary>

System values are available in the **Dictionaries** section.\
It is recommended to use them to ensure correct and valid API requests.

</details>

<details>

<summary><strong>What should I do if a request returns an error?</strong></summary>

Please verify the following:

* The validity of the JWT token
* The format of the submitted data
* The required parameters

If the issue persists, please contact the **Help Center** or technical support.

</details>

<details>

<summary><strong>How to generate a JWT token</strong></summary>

How to generate a JWT token

```
GET /clients/authorization
```

Pass the API key in the request. A temporary JWT token will be returned in the response.

The token must be included in the header of every subsequent request:

```
Authorization: Bearer {JWT_TOKEN}
```

</details>

<details>

<summary><strong>How long is a JWT token valid?</strong></summary>

The JWT token has a limited validity period.\
It is recommended to implement an automatic token refresh mechanism before the token expires.

</details>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/help-center/readme.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
