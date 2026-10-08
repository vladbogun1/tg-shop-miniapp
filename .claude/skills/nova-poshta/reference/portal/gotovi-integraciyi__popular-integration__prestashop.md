> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/prestashop.md).

# PrestaShop

[**\[Download\]**](https://gitlab.com/novadigitalhub/novapost-shipping-prestashop)

The Nova Post module for PrestaShop allows you to automate the goods delivery process, integrate the choice of delivery methods directly into the checkout, and manage shipments directly from the store control panel.

[**Key module features and available delivery geography**](https://novapost.com/uk-pl/for-business/integrations-prestashop)

### What is required for the module to work correctly

* **Service agreement with Nova Post**. For the plugin to work correctly, a business client agreement with Nova Post is required. To sign an agreement, write [an email to the sales department in your country](https://api-portal.novapost.com/help-center).
* **API key**. Register in the My Nova Post business dashboard and generate a key. [Detailed instructions](https://api-portal.novapost.com/uk/api-nova-post/start/api-keys).

{% hint style="warning" %}
While setting up the module, you will need to specify:

* Logistics services contract number
* Cash on delivery contract number
* API key
  {% endhint %}

Contract numbers are not displayed in the business dashboard. If you need to find out the contract number, write [an email to the sales department in your country](https://api-portal.novapost.com/help-center).

### Installing the Nova Post module in PrestaShop

[**\[Download the module\]**](https://gitlab.com/novadigitalhub/novapost-shipping-prestashop)

**Method 1: Via the admin panel**

1. Log in to the PrestaShop control panel
2. Go to **Modules** → **Module Manager** → click **Upload a module**.
3. Select the Nova Post module ZIP file on your computer and upload it.
4. When the module appears in the list, click **Install**.

**Method 2: Via FTP/SFTP**

1. Extract the module archive on your computer.
2. Check the folder structure: the module folder must be named `novapost/` and must contain the files `novapost.php, config.xml`, folders `controllers/`, `views/`, etc.
   1. ✅ **Correct path**: `/modules/novapost/`
   2. ❌ **Incorrect (double nesting)**: `/modules/novapost/novapost/`
3. Connect to the server via FTP/SFTP (or the hosting file manager).
4. Upload the module folder to the path: `YOUR_PRESTASHOP_ROOT/modules/`
5. Return to **Back Office** → **Modules** → **Module Manager**, find the Nova Post module and click **Install**.

### Initial module setup

{% hint style="warning" %}
**Important**: After installing the module, be sure to clear the store cache before proceeding to the settings.
{% endhint %}

#### Identification data

Open the Nova Post module in the PrestaShop panel:

{% stepper %}
{% step %}

#### Specify the API Key

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FG8LwF4qcphsKJIoaMUq3%2Funknown.png?alt=media\&token=7712eaa5-55d0-4f79-98b3-4bd10a26cb97)
{% endstep %}

{% step %}

#### Specify the contract numbers

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FNZanvwJujiEU1VC7cSLa%2Funknown.png?alt=media\&token=79303958-3b7d-420e-8e2c-4233c05841f8)
{% endstep %}

{% step %}

#### Enable recording of API requests and responses in the `var/logs/nova-post.log` file, which helps in diagnosing and resolving errors

This option does not affect site speed but requires free disk space on the server.

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fw6kKRmZlQVHDkKolbZXY%2Funknown.png?alt=media\&token=44bae325-a4d2-4eb9-9824-abf9dc4ccde3)
{% endstep %}
{% endstepper %}

#### Allowed shipping countries

The module displays the countries enabled in your store, but you can separately specify the countries for which Nova Post shipping will be available.

To do this, go to: **Improve** → **International** → **Location** → **Countries** and select from the list only those countries where you plan to ship via Nova Post (use `Ctrl/Cmd` to select multiple).

If no country is selected, shipping will be available for the countries allowed at the store settings level.

#### Sender Information

1. Fill in the required fields:

* Domestic contract number
* International contract number
* Full Name
* Mobile phone
* Email
* Company Name
* Company TIN

{% hint style="info" %}
Important: The specified data must match the data in the logistics services contract.
{% endhint %}

2. Additional fields for shipping orders with customs clearance:

* **EORI**: Must be filled out if you make international shipments that require customs clearance: from a non-EU country to an EU country, or from an EU country to outside the EU.
* **IOSS**: Identification number of a legal entity registered as a VAT payer in the Import One-Stop Shop system. Required for simplified customs clearance in the country of delivery. Allows collecting VAT from the buyer for goods up to €150 during order payment.

<details>

<summary><strong>Example of filling in the Sender Information section</strong></summary>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FuCTTZXlo2eV337ZUozNC%2Funknown.png?alt=media&amp;token=c19b5470-924b-45d9-a3f0-6a243a2f5480" alt="" height="348" width="624">

</details>

#### Shipment Origin

Select the drop-off type and provide the required data accordingly:

* **Adress**: For sending orders by courier from the store's office or warehouse.
* **Branch**: You bring the order to the selected Nova Post branch or a partner branch yourself.

|                                                                                              **Example of filling in for shipment by courier from an address**                                                                                              |                                                                                                     **Example of filling in for shipment from a branch**                                                                                                    |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FPlGA7jRZkit5XgtGmR0p%2Funknown.png?alt=media&amp;token=a75d7f8d-ec16-4862-8cd8-f15943ce13bc" alt="" data-size="original"> | <img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FLIAn7gMLO27XrXjZJtu2%2Funknown.png?alt=media&amp;token=80604b91-f860-4a29-86b8-e9272f0d5c93" alt="" data-size="original"> |

### Default product and packaging information

If the weight and dimensions are missing in the product card, the module will use the default values from this section. The data in this section affects the shipping cost calculation and available delivery locations.

#### Default Product Information

The shipping cost calculation is based on weight, dimensions, price, destination, and delivery type. If the weight and dimensions are missing in the product card, the module will use the default values from this section.

<details>

<summary><strong>Example of filling in the default product information</strong></summary>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FWUlr6WaAjMxS0yNdAp8C%2Funknown.png?alt=media&amp;token=c8daefe3-7327-4aad-b9fe-01ddb017a977" alt="" height="349" width="624">

</details>

{% hint style="info" %}
To set a default HS Code, install [the free HS Code module](https://forum.prestashop.com/topic/1046735-free-modulehs-codes/).
{% endhint %}

#### Packaging Settings

Select the box formation method:

* **Automatic**: Automatically calculates and selects the optimal box dimensions.
* **One box**: Fixed packaging dimensions are used for the entire order.

<details>

<summary><strong>Example of filling in the packaging information</strong></summary>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FTC2fZ7CSnQjohGM5Yw1P%2Funknown.png?alt=media&amp;token=641dc8eb-a593-4e8a-a2b1-7e74f1ec2eb2" alt="" height="339" width="602">

</details>

### Cash on Delivery (COD)

To enable the service in your store:

* sign an additional contract with Nova Post
* [install the free PrestaShop COD module](https://addons.prestashop.com/en/omnichannel-payment-methods-pos/24637-cash-on-delivery-cod.html)

To configure the service, go to **Modules** → **Nova Post Shipping** → **Cash on Delivery (COD) Settings**:

1. **COD Currency**: For correct operation, it must match the currency of the shipment origin country. If not specified, the currency specified in the invoice will be used.
2. **Bank Account ID**: the client's bank identifier, must match the one specified in the contract with Nova Post.
3. **IBAN**: Bank account number for crediting funds.
4. **Fee payer**: Determines who pays the Nova Post fee for providing the service:
   1. **Disabled** — recipient
   2. **Enabled** — sender

<details>

<summary><strong>Example of filling in the Cash on Delivery setup section</strong></summary>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fn7Abwdd30XBUVWOTZ99D%2Funknown.png?alt=media&amp;token=f14f119a-9914-485f-8a29-f2925375d6b9" alt="" height="349" width="624">

</details>

#### Advanced Settings

* **Auto-create of Nova Post Shipments**:&#x20;
  * **Enable** – the shipment will be automatically created after checkout.
  * **Disabled** – the shipment must be created manually from the order card.
* **Auto-create User Context**: Select Admin PrestaShop so that after the shipment is created, the order status automatically changes to Shipped.\
  This is a PrestaShop technical requirement; without selecting a user, the status will not change automatically.
* **Allowed Delivery Types**: Select at least one delivery type that will be available to buyers:
  * **Address** – courier delivery to the recipient's address
  * **Branch** – delivery to a Nova Post branch, partner branches, and pick-up points
  * **Parcel Locker** – delivery to parcel lockers

<details>

<summary><strong>Example of filling in the Advanced Settings section</strong></summary>

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FfmKooLdD2v1Bs66CTrtf%2Funknown.png?alt=media&amp;token=ad8f3de1-17bd-4813-b284-ec4584df973a" alt="Приклад заповнення розділу Advanced Settings" height="372" width="707"><figcaption></figcaption></figure>

</details>

**Product settings for international shipping**

If you ship goods abroad, you must specify the following values for each product:

1. **HS code**: `Catalog → Product → Basic settings → HS Code`.\
   If the HS code is not set for a specific product, the general HS code you specified earlier in the module settings will be used.
2. **Country of origin**: `Catalog → Product → Basic settings → Country of origin`.
3. **English product name**: `Catalog → Product → Basic settings → Nova Post English Product Name`.

Required for generating accompanying documents.

<details>

<summary><strong>Example of filling in product information for international shipping</strong></summary>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2F6CJUZ4iddkoLF4fXcCYe%2Funknown.png?alt=media&amp;token=947bfd54-ee56-44a8-b42f-eeb340ddfa66" alt="" height="373" width="707">

</details>

**Shipping parameters**

Nova Post carrier parameters are configured similarly to standard PrestaShop shipping methods.

* **Carrier name**: `Improve → Shipping → Carriers → Nova Post Shipping → General settings → Carrier Name`.\
  *If not specified, defaults to Nova Post.*
* **Carrier description**: `Improve → Shipping → Carriers → Nova Post Shipping → General settings → Transit time`.\
  *Default: "Easy delivery for life and business!". You can set up separate texts for Ukrainian and English.*
* **Tracking URL**: `Improve → Shipping → Carriers → Nova Post Shipping → General settings → Tracking URL`.\
  *Filled in automatically.*
* **Free shipping**: `Improve → Shipping → Carriers → Nova Post Shipping → Shipping locations and costs → Free shipping`.
* **Handling costs**: to enable for Nova Post, `Improve → Shipping → Carriers → Nova Post Shipping → Shipping locations and costs → Add handling costs`.
* **Handling charges amount**: `Improve → Shipping → Preferences → Handling charges`.\
  *This setting applies to all shipping carriers.*
* **Free shipping threshold by amount or weight**: `Improve → Shipping → Preferences → Free shipping starts at…`

You can configure a minimum order amount and/or minimum order weight for free shipping.

### Shipment management

**Create a shipment for a single order**: `Orders → Order → Nova Post Delivery → Create Shipment`.

**Bulk creation of shipments**: `Orders → select multiple orders → Bulk actions → Create Nova Post Shipments`.

**Changing the delivery location after checkout**: The buyer cannot independently change the branch after the order is created, to change the delivery location: `Orders → Order → Nova Post Delivery`.

**Deleting or editing a shipment**: Go to `Orders → Order → Nova Post Delivery → Delete Tracking or Orders → Order → Nova Post Documents → Delete Tracking`.&#x20;

{% hint style="info" %}
After deleting the tracking number, you can make changes and generate a new waybill.
{% endhint %}

**Shipment documents**: Downloading and printing documents are available in the `Orders → Order → Nova Post Documentation section`:

* Marking (Nova Post Marking)
* Invoice (Nova Post Invoice)
* International waybill (Nova Post International)

### Buyer's journey at Checkout

During checkout, the buyer will have access to the Nova Post delivery methods you selected in the settings.

* **Nova Post address delivery**: Entering the exact delivery address.
* **Delivery to a Nova Post branch**: Selecting a convenient branch from the list.
* **Delivery to a Nova Post parcel locker**: Selecting a parcel locker for pickup.

#### Module language

The module supports English and Ukrainian on the client side and switches automatically depending on the selected store language.

<br>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/prestashop.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
