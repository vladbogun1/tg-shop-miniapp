> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration.md).

# Popular integration

Ready-made Nova Post integrations allow you to quickly connect delivery services to popular e-commerce platforms without the need to develop a full API integration from scratch.

Use ready solutions for automatic shipment creation, order data transfer, and delivery status tracking.

#### Available Integrations

#### [BaseLinker](https://login.baselinker.com/)

Integration for centralized order management from marketplaces, CRM systems, and e-commerce platforms. Allows creating Nova Post shipments directly from the BaseLinker interface.

#### [Shopify](https://apps.shopify.com/nova-post-1?search_id=7bc00069-e4d9-4fb6-8e9e-6b17223ad373\&surface_detail=Nova+post\&surface_inter_position=1\&surface_intra_position=5\&surface_type=search)

Integration for online stores built on Shopify. It enables automatic shipment creation, order data transfer, and delivery status tracking within store business processes.

#### [Woocomerce](https://uk.wordpress.org/plugins/nova-post-for-woocommerce/)

The official Nova Post plugin for WooCommerce to handle your online store deliveries to 16+ countries. Create orders for address or branch delivery, automatically generate and print waybills, manage statuses, and send tracking numbers to buyers directly from the WooCommerce dashboard.

<br>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
