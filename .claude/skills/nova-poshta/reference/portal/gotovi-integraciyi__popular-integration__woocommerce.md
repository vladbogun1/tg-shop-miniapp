> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/woocommerce.md).

# WooCommerce

Use the official Nova Post plugin to ensure all services work correctly.

<a href="https://uk.wordpress.org/plugins/nova-post-for-woocommerce/" class="button primary">Install</a>

### How to set up the plugin to get started

{% hint style="warning" %}
To ensure the plugin works correctly, you need a business client agreement with Nova Post. If you need to find your agreement number or sign an agreement, [email the sales department in your country.](https://api-portal.novapost.com/uk/help-center)
{% endhint %}

<details>

<summary><strong>Nova Post Settings tab</strong></summary>

1. Get an API key. Generate a key [for the production](https://api-portal.novapost.com/uk/api-nova-post/start/api-keys) or [test environment](https://api-portal.novapost.com/uk/test-api-keys).&#x20;
2. Install the Nova Post plugin
3. From the sidebar menu, go to the plugin settings: WooCommerce → Nova Post Settings and complete the following sections.

</details>

<details>

<summary><strong>API Configuration section</strong></summary>

Enter the received API key.

{% hint style="warning" %}
If you need to set up the plugin for testing, check the Testing API checkbox and enter the test key. You can test creating shipments without generating actual shipping labels.
{% endhint %}

</details>

<details>

<summary><strong>Contract Numbers section</strong></summary>

* In the Domestic Contract Number field, enter the agreement number for domestic shipments within the country of origin\*.
* In the International Contract Number field, specify the contract number for international delivery (for delivery to EU or non-EU countries).

\*Country of shipment – the country of business registration and concluding the agreement with Nova Post.

</details>

<details>

<summary><strong>Sender Data section</strong></summary>

{% hint style="warning" %}
This data will be used for the generation of shipping labels; specify the information exactly as it is stated in your Nova Post agreement.
{% endhint %}

Fill in the following fields:

* Last name
* First name
* Email
* Phone number
* Tax ID\*
* EORI\*\*

\*Optional, however, it is required to be completed to use the Cash on Delivery service

\*\*Optional; however, it is required to be completed for international delivery

#### Provide the information in the Shipment Departure Method subsection

This section allows you to configure the methods for shipment departure.

This section contains two tabs: Address and Branch. Provide the information in these tabs according to your preferred method of sending parcels: from a branch or from an address.

{% hint style="warning" %}
The “Settlement” field must contain only the name of the city or locality, without including the names of the district or region, and without any commas. Note that "Riga" and "Rīga" are treated as two distinct entries within the system.
{% endhint %}

</details>

<details>

<summary><strong>Product Information section</strong></summary>

The information specified in this section will be utilized for the generation of shipping labels by default if the corresponding details have not been provided within the product card.

* Default weight, kg
* Length, width, height, cm
* HS Code – an identifier utilized for the classification of goods in international trade

</details>

<details>

<summary><strong>Packaging Settings section</strong></summary>

Specify the packaging type that will be added to the generated shipping labels:

* Use Nova Post boxes – Nova Post packaging sizes will be used during the generation of shipping labels. Packaging sizes will be determined automatically based on the size of the items in the parcel.
* One box per order – if a single packaging type is used, its size will be automatically applied to each order.
* Use custom boxes – if multiple box options are used for packaging. The packaging size will be automatically selected based on the size of the products in the order.

When selecting either One box per order or Use custom boxes, specify the packaging sizes.

</details>

<details>

<summary><strong>Carrier shipping calculation section</strong></summary>

This section allows you to specify the shipping cost for the buyer:

* according to Nova Post rates
* other cost from the seller
* free shipping (for all orders or for orders above a certain amount

</details>

<details>

<summary><strong>Cash on Delivery section</strong></summary>

If you want to enable Cash on Delivery, you must sign an additional agreement with Nova Post.

In the section, specify information as stated in the agreement:

* Payer of the fee for the Cash on Delivery service
* Bank Account ID
* Account for crediting funds

For correct service operation, specify the data stated in the agreement with Nova Post.

</details>

<details>

<summary><strong>Order Workflow section</strong></summary>

In the section, you can configure automatic notification for the buyer about the order shipment. If you check the box next to Auto-complete orders, after creating the shipping label, we will automatically send the buyer an email with parcel tracking information, and the order will change to Completed status.

</details>

<details>

<summary><strong>Divisions Filters section</strong></summary>

Leave the checkboxes checked for the shipping methods you want to keep available for the buyer during checkout.

</details>

<details>

<summary><strong>Settings tab</strong></summary>

**General options section**

Go to Settings – General options

1. Selling location(s) settings:

* Select Sell to specific countries
* Specify the countries where you plan to sell.

Specify only the countries where Nova Post branches are located.

Countries with Nova Post presence:

* &#x20;Ukraine&#x20;
* Moldova&#x20;
* Poland&#x20;
* Lithuania&#x20;
* Czech Republic&#x20;
* Romania&#x20;
* Germany&#x20;
* Slovakia&#x20;
* Estonia&#x20;
* Latvia&#x20;
* Hungary&#x20;
* Italy&#x20;
* United Kingdom&#x20;
* Spain&#x20;
* France&#x20;
* Austria&#x20;
* Netherlands&#x20;
* USA&#x20;

2. Currency settings

For example: if shipments are made from Romania — select the Romanian leu (RON).

Change the currency if necessary and save the changes.

{% hint style="warning" %}
If the store currency matches the agreement currency, you will avoid exchange rate differences and payment discrepancies. If there are currency differences, Nova Post will perform the necessary conversion.
{% endhint %}

***Shipping zones section***

Go to: Settings — Shipping

This section allows you to set the available shipping methods depending on the country.

1. Click Add zone
2. Enter the zone name
3. Add countries that will be included in this zone.
4. Click Add shipping method
5. Select which shipping method will be available for this zone: delivery to an address (Nova Post Address) or delivery to a branch (Nova Post Division).

To make both shipping options available, create the same zone with the second shipping method. Save the data.

***Specifics of filling out product data for delivery outside the EU or to the EU zone from other countries***

To correctly complete customs documents, enter the following data into the corresponding fields in the product cards:

* Product name – the name of the product in English
* HS code – the product classification code

The HS code must consist of 8-10 numeric characters:

* If your HS code is shorter than 8 characters, add zeros to it.
* If your HS code is longer than 10 characters, remove the last ones.

### How to create a shipment and print documents

{% hint style="warning" %}
If an error occurs during shipping label creation that you cannot resolve, write a request to <servicedesk@novapost.com>.&#x20;
{% endhint %}

1. Open the Orders section
2. Click the Create waybill button (1)
3. A preview window of the generated shipping label will open; at the very bottom, click the Create waybill button
4. After the shipping label is created, the label number will be displayed in the orders section, and the option to print documents will appear (2). For shipping within the country or within the EU, only a label with a barcode and parcel data will be generated, while for international shipping, both a label and an invoice will be generated.

{% hint style="warning" %}
If you want to create several shipping labels at once:

* select the required parcels using checkboxes (3)
* in Bulk Actions select the Nova Post: Create Shipments option
* click the Apply button
  {% endhint %}

5. To print a document, click its icon (2) and confirm printing in the preview window.

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FuX2XINt408deGYNDe6av%2Funknown.png?alt=media&amp;token=dbfb998c-4c4b-4970-8e48-2a4b2488b1eb" alt="" height="272" width="602">

</details>

#### How to send parcels by courier

Create a courier pickup and send up to 15 parcels at a time from your own address without visiting a branch.

{% hint style="warning" %}
To ensure that pickups are created correctly, please make sure you have filled in the shipping addres Shipment Departure Method section.
{% endhint %}

1. Open the Orders section
2. Select the parcels you want to send from an address.

{% hint style="warning" %}
You can only add parcels to a pickup for which a Waybill or International Waybill has already been created, and which are in the "Ready for shipment" status, for which a Waybill has been created.
{% endhint %}

3. In the Bulk Actions dropdown menu, select the Create Pickup Request option and click Apply.
4. A modal window will appear. Select the date and available time slot for the courier pickup.
5. Click Confirm to confirm the request and view the result.

{% hint style="info" %}
**Important details!**

* Do not change the sender's address for a courier pickup if you already have created parcels. The sender's address must remain unchanged throughout the entire pickup request creation process. If you need to change the address, delete all waybills that have been created but not yet sent, then create them again.&#x20;
* You can add 15 parcels to a request. If your selection contains more, the rest of the orders will be automatically skipped and displayed in the Warnings block of the report.
  {% endhint %}

#### Results of the courier pickup request report

| Success | The request has been created. All or some of the selected parcels have been successfully added to the request.                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Warning | Some parcels were automatically skipped. The report displays a list indicating the reason for each.                                |
| Error   | One or more parcels failed validation. The report displays a list of problematic orders with a detailed description of the errors. |

All status types can be displayed simultaneously in a single report, depending on the selected parcels and the results of their validation.

### **How to track the courier pickup status**

The created request number and its current status are displayed:

* in the Nova Post block on the individual order details page.
* on the order list page in the "Shipping Status" column within the corresponding Pickup icon.

The request status is updated automatically every time you open or reload the pages.

How to edit or cancel a courier pickup

Editing the time slot, adding or removing shipments, and deleting the request is available exclusively in your Nova Post business account.

### **How to track a parcel for the seller and the buyer**

**Tracking by the seller**

* In the Orders section, the Shipping Status column (1) will display data on the current parcel delivery status.
* In the Nova Post Shipment column, the waybill number is displayed (2). This is an active link; click it to go to the parcel tracking with route details.

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fx67cCEvYOkxGFqC8BvSn%2Funknown.png?alt=media&amp;token=356bc83a-78ec-4b70-a386-04a57ab73b96" alt="" height="236" width="602">

\
**Tracking by the buyer**

The buyer can track the parcel's movement through the NovaPost app or directly on the NovaPost website. The buyer needs the parcel number for tracking.

Send the parcel tracking data to the buyer after the waybill has been created:

1. Check the box next to the required orders.
2. In Bulk actions select Change status to Completed
3. Click Apply

After this, an email containing the parcel number and a link to the tracking page will be automatically sent to the email address provided by the buyer during checkout.

### How the buyer journey looks: from order to receipt

After the buyer has added products to the cart and proceeded to checkout, they need to:<br>

1. Enter an email address
2. Fill in the delivery address data:

* Country
* First Name
* Last Name
* Street and house number
* Apartment number\*
* City
* Region\*
* Postal code
* Phone number

3. Fill in the billing address data: can be entered manually or use the delivery address data
4. Select a shipping method from the list available for the delivery country:

* By courier to the address
* To a pickup point

In case of delivery to a service point, you must select the type: branch or parcel locker, and then specify the required one from the list.

5. Select a payment method:
6. On the website
7. Upon receipt (if the corresponding service is enabled by the seller)
8. Add a comment to the order (optional)
9. Click the order creation button.
10. After the waybill for order delivery is created, the seller can send a notification email with the parcel number for tracking.
11. When the parcel arrives at the destination, a notification regarding the parcel's arrival or the courier's visit time will be sent to the email address provided during the order.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/woocommerce.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
