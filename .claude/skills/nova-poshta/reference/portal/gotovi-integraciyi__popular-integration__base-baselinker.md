> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/base-baselinker.md).

# Base (Baselinker)

Arrange delivery to your store's customers directly through the order management section in Base (Baselinker).

**Create shipments for your store customers directly through the order management section in BaseLinker.**

* Allow customers to select a Nova Post branch or address delivery during checkout.
* Automatically generate shipping and export documents.
* Process orders with cash on delivery.
* Arrange delivery of your orders to customers within your country, across Europe, and to Ukraine directly from the Shopify admin panel.
* Access shipment tracking and notify customers about delivery status updates.

#### Integration steps

1. Sign service agreements with Nova Post for logistics services.\
   If you sell internationally, two agreements are required:

* one for domestic delivery within your country
* one for international delivery to other countries

To sign an agreement, contact the sales department in your country.

2. Sign an additional agreement for the **Cash on Delivery** service.\*

{% hint style="info" %}
\*Тільки для продавців з Польщі, Чехії, Німеччини
{% endhint %}

3. Register in **My Nova Post** in your country using the contact details specified in the service agreement for the authorized representative.
4. Obtain a API key from Nova Post. **How to create an API key for a European client**

   To configure the module, you need:

   * an active service contract with Nova Post
   * an API key issued to an authorized representative specified in the contract

{% hint style="warning" %}
To configure the module, you need an active service contract with Nova Post and an API key issued to an authorized representative specified in the contract.
{% endhint %}

### How to Configure the Nova Post Module on Base (Baselinker) <a href="#settings" id="settings"></a>

1. Locate the Nova Post module on Base (Baselinker). Go to the Integrations menu → Select Add Integration.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FxI8VhCF5jI2hqB7h3Tz9%2Fimage.png?alt=media&amp;token=32ced490-83ee-4cc8-ab0f-de7154aec474" alt=""><figcaption></figcaption></figure>

2. Navigate to the "Courier Services" Section: In the search bar, type Nova Post → Click on the Nova Post module icon.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Flph26yCgLRzzd9QChlaZ%2Fimage.png?alt=media&amp;token=1845d22d-9be9-4dc7-ba6f-478d223aeebf" alt=""><figcaption></figcaption></figure>

3. Complete the Settings: Fill in all the required fields in the settings section and click Save.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FmfZcaIgXP2ZmC3H9Q7Ss%2Fimage.png?alt=media&amp;token=0d3f7884-d355-4017-a591-f662363913d8" alt=""><figcaption></figcaption></figure>

#### Field descriptions for configuring the Nova Post module in Base (Baselinker) <a href="#description" id="description"></a>

<details>

<summary><strong>Basic fields:</strong> this information is used later when placing an order, so you don't need to enter it every time.</summary>

| Field Name                | Description                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account name              | Display name for the account in the Base (Baselinker) panel.                                                                                                                                                                                                                                                                |
| API key                   | <p>Nova Post API key<br><br><a href="https://api-portal-stage.novapost.com/en/api-nova-post/start/api-keys">How to get the API key</a><a href="https://api-portal-stage.novapost.com/en/api-nova-post/start/api-keys"> </a><img src="https://site-assets.novapost.com/66d56a6f-0ada-4130-96ea-2d79f1054e04.svg" alt=""></p> |
| Shipper VAT Number        | <p>Tax identification number of the sender's company<br><br>API Nova Post parameter: companyTin</p>                                                                                                                                                                                                                         |
| Sender - company name     | Name of the sender’s company                                                                                                                                                                                                                                                                                                |
| Sender - phone number     | Sender's phone number                                                                                                                                                                                                                                                                                                       |
| Sender - e-mail           | Sender's email address                                                                                                                                                                                                                                                                                                      |
| Sender - country          | Country from where parcels are shipped (select from a list)                                                                                                                                                                                                                                                                 |
| Sender - street           | Sender's street address                                                                                                                                                                                                                                                                                                     |
| Sender - house number     | Sender's house number                                                                                                                                                                                                                                                                                                       |
| Sender - apartment number | Sender's apartment number                                                                                                                                                                                                                                                                                                   |
| Sender - postal code      | Sender's postal code                                                                                                                                                                                                                                                                                                        |
| Sender - city             | Sender's city                                                                                                                                                                                                                                                                                                               |
| Sender - name             | First name of the sender                                                                                                                                                                                                                                                                                                    |
| Sender - surname          | Last name of the sender                                                                                                                                                                                                                                                                                                     |
| Client number             | <p>Contract ID with Nova Post<br><br>API Nova Post parameter: payerContractNumber</p>                                                                                                                                                                                                                                       |

</details>

<details>

<summary><strong>Cash-on-Delivery (COD) Fields</strong></summary>

| Account number for COD (IBAN) | IBAN listed in the contract for COD payments          |
| ----------------------------- | ----------------------------------------------------- |
| Bank account owner            | Tax identification number of the sender's companyника |

</details>

<details>

<summary><strong>Weight Settings</strong></summary>

| Default Package Weight Settings                                                  |                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How to calculate the fixed weight of a cardboard                                 | <ul><li>Percentage value adds a percentage of the parcel weight for packaging.</li><li>Fixed value adds a defined fixed weight for packaging to all parcels.</li></ul> |
| If shipping small parcels, set this to 0 to avoid inflating the parcel's weight. |                                                                                                                                                                        |
| How to calculate the fixed weight of a cardboard                                 | fixed value                                                                                                                                                            |
| Value of the fixed weight of the cardboard                                       | 0                                                                                                                                                                      |

</details>

### How to arrange parcel delivery using the Nova Post module in Base (Baselinker) <a href="#delivery" id="delivery"></a>

#### Delivery to an Address

1. Complete all fields in the Delivery Address section as shown in the example

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FPIYjksgQXacXT1LNKEjN%2Fimage.png?alt=media&amp;token=3cb7a4e1-17cb-4fb9-b8c1-da5fd17c579b" alt=""><figcaption></figcaption></figure>

2. Enter shipment details in the Shipments Section and click Send package Nova Post

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2F7s9aJ3MNEPIWmGCJcbBQ%2Fimage.png?alt=media&amp;token=da3c8114-7563-4e09-9075-38037e676144" alt=""><figcaption></figcaption></figure>

How to correctly fill in the Address field

* Do NOT duplicate the following fields in the Address field: Postal code, City, State, Country.
* Order of writing:
  * Street name → House number → Apartment number (if applicable)
  * House number → Street name → Apartment number (if applicable)
* The Pickup at point block must remain empty.
* For Delivery to Ukraine:
  * All words should be written in Latin characters without translation. For example: Budynok 10, Kvartyra 25, vul. Shevchenka, Kyi
  * English abbreviations are allowed.

| Full name | Abbreviations |
| --------- | ------------- |
| Street    | St            |
| Avenue    | Ave           |
| Boulevard | Blvd          |
| Road      | Rd            |
| Lane      | Ln            |
| Apartment | Apt           |

{% hint style="warning" %}
![](https://site-assets.novapost.com/2ce00c3a-6442-4f1a-ab0d-b44e4721a5ed.svg) Strictly follow the rules for structured address entry to ensure delivery accuracy, minimize the risk of errors, and avoid delays in delivery.

The Nova Post API expects to receive a structured recipient address. A structured address is a set of data formatted in a specific way and sequence.

During integration, Base (Baselinker) transmits the recipient's address as a single line. On Nova Post's side, this line is processed by an automated parsing algorithm that separates it into individual elements to create the shipment.

If the address is entered incorrectly, the algorithm will be unable to process the shipment automatically. In such cases, order processing will be delayed due to the need for manual intervention by staff or there may be a risk of incorrect delivery to the wrong address.
{% endhint %}

#### Delivery to a Branch or Parcel Locker

For this delivery type, a specific branch or parcel locker must be specified. Baselinker does not integrate with the Nova Post branch directory, so customers cannot select a branch or locker during the order process. However, the Nova Post module can transmit these details through the Pick up at point section.

Ways to provide Branch or Parcel Locker data for delivery:

* Integrate Nova Post API with your online store or CRM. Enable users to select the desired branch or locker for delivery during the ordering process. The selected data will be automatically transferred to Baselinker. [More details on the method](https://api-portal-stage.novapost.com/en/api-methods/branch-directory)[ ](https://api-portal-stage.novapost.com/en/api-methods/branch-directory)![](https://site-assets.novapost.com/66d56a6f-0ada-4130-96ea-2d79f1054e04.svg)
* Upload the current Branch and Locker directory to your order management platform. Customers can select the desired branch or locker for delivery. However, this directory will not update automatically. To display up-to-date delivery locations on the website, you will need to update the directory periodically. [More details](https://api-portal-stage.novapost.com/en/api-methods/branch-directory)[ ](https://api-portal-stage.novapost.com/en/api-methods/branch-directory)![](https://site-assets.novapost.com/66d56a6f-0ada-4130-96ea-2d79f1054e04.svg)
* Manually on Base (Baselinker). Enter the delivery location details in the Pick up at point section based on the customer-provided Delivery address data:

1. **Navigate to the branch map: select the country and delivery city.** Choose the desired delivery location: by branch or locker number, if provided by the customer. Enter the address provided in the Delivery address and select the nearest branch or locker.

   <figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fjhcu6QBpUM70AwphdJ7Q%2Fimage.png?alt=media&amp;token=45ad9867-f40a-49c7-8913-e102d2392824" alt=""><figcaption></figcaption></figure>

2. **Access the branch or locker details:** Click Copy to copy the information.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FfSQdmVAnGvk5RHyIEJdc%2Fimage.png?alt=media&amp;token=47e5b233-eca2-48f5-b805-48b6c4c81395" alt=""><figcaption></figcaption></figure>

3. **Return to the order card on Base (Baselinker):** Open the Pick up at point section, paste the copied information into the ID field, and save the changes.

   Complete the Shipment Details. Fill in the required shipment details in the Shipments section and click Send Package Nova Post.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FD79gs6i1edMSE5AqWKO0%2Fimage.png?alt=media&amp;token=d7596216-f496-480c-8412-abbb787bc24b" alt=""><figcaption></figcaption></figure>

#### How to fill in parcel details <a href="#shipments" id="shipments"></a>

1. 1Scroll down to the Shipments section in the order card and click Nova Post to open the parcel creation form.
2. 2Complete all mandatory fields in the form. Once finished, click Send package Nova Post. [Detailed Field Descriptions](https://api-portal-stage.novapost.com/en/integrations/other-platforms/base#parcel-fields) ![](https://site-assets.novapost.com/66d56a6f-0ada-4130-96ea-2d79f1054e04.svg)

An example of filling in parcel data:

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2F68OV8IsNjGWlJmfhZomZ%2Fimage.png?alt=media&amp;token=050247e3-e096-4780-b010-8c972d62f379" alt=""><figcaption></figcaption></figure>

### Description of the fields in the parcel creation form <a href="#parcel-fields" id="parcel-fields"></a>

| Field Name                    | What to Enter                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insurance                     | Declared value of the parcel                                                                                                                                                                                                                                              |
| Content description           | <p>Description of the shipment\*<br><br>\*To ensure the automatic completion of parcel descriptions, select one of the settings in the Default settings of shipment and printouts section: Product list (Quantity, Name) or Product list (Quantity, SKU, Name, Price)</p> |
| Cash on delivery              | <p>COD amount\*. If the field is left blank, the parcel will be delivered without COD.<br><br>\*To process COD, the Account number for COD (IBAN) and Bank account owner fields must be completed in the module settings.</p>                                             |
| Weight, Length, Width, Height | Parcel dimensions: weight, length, width, height                                                                                                                                                                                                                          |

### How to print a Label for a parcel from Base (Baselinker) <a href="#lable" id="lable"></a>

1. Label for a single parcel in each order

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fip3TEyU69wADth3frpev%2Fimage.png?alt=media&amp;token=5b185138-fb6f-435c-a036-69b9ca66ddb1" alt=""><figcaption></figcaption></figure>

2. Print labeling for multiple parcels or a single parcel

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FKIDmNZCK1C3of5pEqRG1%2Fimage.png?alt=media&amp;token=022d3643-ce24-4e76-b95d-880b9d8f0ced" alt=""><figcaption></figcaption></figure>

### How to track parcels in Baselinker <a href="#tracking" id="tracking"></a>

**Package number –** this is the express waybill number. Clicking on it allows you to track the parcel.

<figure><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FLgfS2UvjellIWq5JGmVb%2Fimage.png?alt=media&amp;token=9fadd70f-b1ab-4201-ae00-73037c4068ed" alt=""><figcaption></figcaption></figure>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/base-baselinker.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
