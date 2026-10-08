> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/shopify.md).

# Shopify

The app is available regardless of whether you have Shopify Checkout Plus in your subscription. The app supports all rate types: manual, flat, carrier-calculated.

### Key features of the Nova Post app for Shopify

The integration allows customers to select a branch before checkout and automates the creation of waybills, including for international delivery across the entire EU and to Ukraine.

* Selecting a Nova Post branch or addressed delivery by the buyer when placing an order.
* Arranging your orders to be delivered to customers in your country, across Europe, and to Ukraine directly from your Shopify account.
* Automatically creating shipping and export documents.
* Accessing delivery tracking and notifying buyers about changes in delivery status.

### Steps to integrate Nova Post with Shopify

1. Sign logistics agreements with Nova Post. If you sell abroad, you will need two agreements: one for domestic shipping within your country and another for international shipping to other countries. To sign an agreement, contact the sales department of your country. [Sales Department Contacts](https://api-portal.novapost.com/help-center/)
2. Sign an additional agreement [for the Payment upon Receipt\* service](https://api-portal-stage.novapost.com/en/integrations/other-platforms/shopify)

{% hint style="info" %}
\*Available for sellers based in Poland, Czechia, and Germany
{% endhint %}

3. After signing the agreements, complete your registration with My Nova Post in your country using the contact details of the authorized representative specified therein
4. Get your Nova Post API key. [The guide on how to create a key for a European customer](https://api-portal-stage.novapost.com/en/api-nova-post/start/api-keys)

#### How to install and configure the Nova Post app on Shopify

[Video guide](https://www.youtube.com/watch?v=jBClvR-F6pU\&t=3s)

1. API key
2. The numbers of your local and international agreements.\
   \
   After signing the contracts, our manager will send these numbers to your email. You can also find them [in My Nova Post account](https://my.novapost.com/#).

What you need before setup:

#### Basic settings

1. Install the app. Log in to your Shopify store >> Go to Shopify App Store >> Search for Nova Post >> Click Install >> Click Install or use [a direct link](https://apps.shopify.com/nova-post-1?search_id=7bc00069-e4d9-4fb6-8e9e-6b17223ad373\&surface_detail=Nova+post\&surface_inter_position=1\&surface_intra_position=5\&surface_type=search).
2. Configure your Nova Post account:
   * Enter your API key
   * Specify your local and international agreement numbers
   * Change the app language if necessary. Available in English and Ukrainian
   * Specify the countries you will deliver to
   * Set the sender's address:
     * Delivery by courier: Your store or warehouse address
     * Delivery from branch: Address of the Nova Post branch<br>
3. Set up Carrier-Calculated Shipping (CCS): Optional\
   \
   This feature allows customers to see calculated shipping costs at order checkout. The app can function without it.\
   \
   CCS (Carrier-Calculated Shipping) is included with Shopify Plus, Shopify Advanced, and annual Shopify Grow plans. It can be activated for monthly Shopify Grow plans for an additional $20/month.\
   \
   If CCS is available, you can configure the following options:
   1. A.Delivery types that will be available for CCS. Here you can also set a minimum order amount for free delivery.
   2. B.Phone number requirement\
      \
      A phone number is mandatory for Nova Post shipments. Enabling this option forces the user to enter his/her phone number before proceeding with the order, even if he/she has already entered it in previous steps
   3. C.Additional packaging fee
4. Select available delivery types for buyers:
   * To the branch
   * To the address
   * To the parcel locker
   * To the pickup point
5. Specify package parameters:
   * If all orders are packed in standard boxes, define the box dimensions
   * If package size depends on the product, select calculation based on product parameters
   * Shipment parameters to be applied to the order if the dimensions are not specified in the product card
6. Specify details to activate Cash on Delivery: Optional\
   \
   To offer payment upon receipt to your customers, provide the following details in this section:
   * Agreement number
   * Account details for crediting funds

<details>

<summary><strong>How to enable Cash on Delivery?</strong></summary>

![](https://site-assets.novapost.com/2ce00c3a-6442-4f1a-ab0d-b44e4721a5ed.svg) For Poland, Czechia, and Germany only

In your Shopify admin, go to Settings > Payments > Create custom payment method. Name this method "Cash on Delivery (COD)" and indicate the number of the Cash on Delivery Service Agreement with Nova Post. You must enter this exact name in the Nova Post app for the feature to work correctly.

</details>

7. Specify a default HS code: Optional\
   \
   Specify a code that will be used automatically for all products lacking this parameter in the product card.\
   \
   It is worth setting this parameter if you are sending goods abroad.<br>
8. Configure label printing rules\
   \
   You can set up automatic label printing. The label will be printed immediately after a waybill is created.

### Enable the widget to be displayed to buyers

{% hint style="info" %}
On Basic and Grow plans, you must use the widget. For Advance and Plus plans, the branch selection will be automatically integrated into the checkout.
{% endhint %}

<details>

<summary><strong>How to enable the Nova Post widget on the cart page</strong></summary>

To enable the Nova Post widget on the cart page, you need to add it to your layout. To add it, go to Shopify admin > Online Store > Themes > Customize > Cart.

</details>

<details>

<summary><strong>How to enable the Nova Post widget on the checkout page *For Shopify Plus only</strong></summary>

You can add the Nova Post widget to the checkout page using the checkout editor. Go to Shopify admin > Settings > Checkout > Customize.

</details>

The widget will automatically pull a branch from the Nova Post API (GET /divisions). If a buyer selects a delivery country you do not ship to, the widget will still appear, but the buyer will not be able to select a branch.

### How to arrange and ship an order

<details>

<summary><strong>Test shipment</strong></summary>

To test the integration, you can create a test shipment.

1. Add a test product to the cart.
2. Check the following:
   1. The country selection works correctly.
   2. The list of branches loads properly.
   3. The selected point is recorded in the order note or cart attributes<br>
3. Go to Shopify Admin → Orders → and verify that the selected branch is displayed correctly.
4. Generate a test waybill. Check if the following is loaded correctly:
   * Recipient's full name
   * Contacts
   * Branch
   * Product information (HS code, weight, value, dimension

</details>

1. **Create a waybill**
   1. Go to the specific order.
   2. In the Nova Post section, you will see an active Create Shipment button. Click it.
   3. Review details and click Create.
   4. Once the shipment is created, you can print the waybill and other necessary documents.
2. **Print documents:** label and invoice (for international shipments)\
   \
   Go to the specific order in Shopify admin > click Print > select Nova Post > choose the required document.
3. **Pack the order according to the Nova Post's packaging standards and send the shipment.**

{% hint style="info" %}
![](https://site-assets.novapost.com/2ce00c3a-6442-4f1a-ab0d-b44e4721a5ed.svg) When the order is sent, the customer will receive a waybill number via email, specified during the order process.
{% endhint %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/shopify.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
